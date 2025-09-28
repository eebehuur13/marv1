import { useCallback, useMemo, useState } from 'react';
import type { DragEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchFiles, removeFile, requestUploadUrl, triggerIngest } from '../lib/api';

const PUBLIC_FOLDERS = [{ id: 'public-root', name: 'Org Shared' }];
const PRIVATE_FOLDERS = [{ id: 'private-root', name: 'My Space' }];

type Visibility = 'public' | 'private';

interface UploadPanelProps {
  onStatusChange?: (message: string) => void;
}

export function UploadPanel({ onStatusChange }: UploadPanelProps) {
  const [activeVisibility, setActiveVisibility] = useState<Visibility>('public');
  const publicFolder = PUBLIC_FOLDERS[0];
  const privateFolder = PRIVATE_FOLDERS[0];
  const selectedFolder = activeVisibility === 'public' ? publicFolder : privateFolder;
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const queryClient = useQueryClient();

  const publicQuery = useQuery({
    queryKey: ['files', 'public', publicFolder.id],
    queryFn: () => fetchFiles({ visibility: 'public', folderId: publicFolder.id }),
  });

  const privateQuery = useQuery({
    queryKey: ['files', 'private', privateFolder.id],
    queryFn: () => fetchFiles({ visibility: 'private', folderId: privateFolder.id }),
  });

  const files = useMemo(() => {
    if (activeVisibility === 'public') return publicQuery.data?.files ?? [];
    return privateQuery.data?.files ?? [];
  }, [activeVisibility, privateQuery.data, publicQuery.data]);

  const uploadMutation = useMutation({
    mutationFn: async ({ file, visibility }: { file: File; visibility: Visibility }) => {
      const folder = visibility === 'public' ? publicFolder : privateFolder;

      if (!file.name.toLowerCase().endsWith('.txt')) {
        throw new Error('Only .txt files are supported right now.');
      }

      // Read the file now so both presigned and direct upload can use it
      const text = await file.text();

      // Ask backend for presigned URL; it will FALL BACK to /api/upload-direct if presign fails
      // NOTE: we pass fileText so fallback can stream through the Worker
      const { fileId, uploadUrl } = await requestUploadUrl({
        folderId: folder.id,
        folderName: folder.name,
        visibility,
        fileName: file.name,
        size: file.size,
        // @ts-expect-error - we extended the type on the server-side fallback; FE sends it along
        fileText: text,
      });

      // If presigned URL was returned, do the PUT directly to R2
      if (uploadUrl) {
        const putRes = await fetch(uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': 'text/plain' }, // MUST match presign constraint
          body: text,
        });
        if (!putRes.ok) {
          const err = await putRes.text();
          throw new Error(`R2 upload failed: ${err || putRes.status}`);
        }
      }

      // Kick off ingest either way (presigned or direct path)
      await triggerIngest(fileId);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['files', 'public', publicFolder.id] }),
        queryClient.invalidateQueries({ queryKey: ['files', 'private', privateFolder.id] }),
      ]);
      onStatusChange?.('Upload complete. File is ready for chat.');
    },
    onError: (uploadError: unknown) => {
      const message = uploadError instanceof Error ? uploadError.message : 'Upload failed';
      setError(message);
      onStatusChange?.(`Upload failed: ${message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (fileId: string) => removeFile(fileId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['files', 'public', publicFolder.id] }),
        queryClient.invalidateQueries({ queryKey: ['files', 'private', privateFolder.id] }),
      ]);
    },
    onError: (deleteError: unknown) => {
      const message = deleteError instanceof Error ? deleteError.message : 'Delete failed';
      setError(message);
    },
  });

  const handleFiles = useCallback(
    (fileList: FileList | File[]) => {
      const filesArray = Array.from(fileList);
      if (!filesArray.length) return;

      filesArray.forEach((file) => {
        if (!file.name.toLowerCase().endsWith('.txt')) {
          setError('Only .txt files are supported right now.');
          return;
        }
        setError(null);
        uploadMutation.mutate({ file, visibility: activeVisibility });
        onStatusChange?.(`Uploading “${file.name}” to ${selectedFolder.name} (${activeVisibility}).`);
      });
    },
    [activeVisibility, onStatusChange, selectedFolder.name, uploadMutation],
  );

  const onDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(true);
  }, []);

  const onDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
  }, []);

  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragActive(false);
      handleFiles(event.dataTransfer.files);
    },
    [handleFiles],
  );

  const isLoading =
    publicQuery.isLoading ||
    privateQuery.isLoading ||
    uploadMutation.isPending ||
    deleteMutation.isPending;

  return (
    <section className="panel">
      <header className="panel-header">
        <h2>Workspace</h2>
        <div className="visibility-toggle">
          <button
            className={activeVisibility === 'public' ? 'active' : ''}
            onClick={() => setActiveVisibility('public')}
          >
            Org Public
          </button>
          <button
            className={activeVisibility === 'private' ? 'active' : ''}
            onClick={() => setActiveVisibility('private')}
          >
            My Private
          </button>
        </div>
      </header>

      <div
        className={`drop-zone ${dragActive ? 'drag-active' : ''}`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <input
          type="file"
          accept=".txt"
          multiple
          onChange={(event) => {
            if (event.target.files) {
              handleFiles(event.target.files);
              event.target.value = '';
            }
          }}
        />
        <p>Drag & drop .txt files here or click to browse.</p>
        <small>Uploads land in “{selectedFolder.name}”.</small>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="file-list">
        <div className="file-list-header">
          <h3>{activeVisibility === 'public' ? 'Org Files' : 'My Files'}</h3>
          {isLoading && <span className="spinner" aria-hidden>⏳</span>}
        </div>

        {files.length === 0 ? (
          <p className="empty">No files yet.</p>
        ) : (
          <ul>
            {files.map((file) => (
              <li key={file.id}>
                <div>
                  <strong>{file.file_name}</strong>
                  <small>
                    {file.folder_name} · {file.visibility} · {new Date(file.created_at).toLocaleString()}
                  </small>
                </div>
                {file.visibility === 'private' && (
                  <button
                    className="danger"
                    onClick={() => deleteMutation.mutate(file.id)}
                    disabled={deleteMutation.isPending}
                  >
                    Delete
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
