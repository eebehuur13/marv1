import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  API_BASE,
  createFolder,
  deleteFile,
  fetchFiles,
  fetchFolders,
  type FileSummary,
  type FolderSummary,
  type Visibility,
  updateFile,
  uploadFile,
} from '../lib/api';

interface FileManagerProps {
  currentUserId: string;
}

interface UploadDialogProps {
  open: boolean;
  visibility: Visibility;
  folders: FolderSummary[];
  onClose: () => void;
  onUpload: (args: { file: File; folderId: string; visibility: Visibility; name?: string }) => void;
  isUploading: boolean;
}

function UploadDialog({ open, visibility, folders, onClose, onUpload, isUploading }: UploadDialogProps) {
  const [selectedVisibility, setSelectedVisibility] = useState<Visibility>(visibility);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedVisibility(visibility);
  }, [visibility]);

  useEffect(() => {
    const scopedFolders = folders.filter((folder) => folder.visibility === selectedVisibility);
    setSelectedFolderId((prev) => {
      if (prev && scopedFolders.some((folder) => folder.id === prev)) {
        return prev;
      }
      return scopedFolders[0]?.id ?? null;
    });
  }, [folders, selectedVisibility]);

  useEffect(() => {
    if (!open) {
      setFile(null);
      setName('');
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  const scopedFolders = folders.filter((folder) => folder.visibility === selectedVisibility);

  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true">
      <div className="dialog-card">
        <header>
          <h3>Upload File</h3>
        </header>
        <div className="dialog-body">
          <label className="field">
            <span>Mode</span>
            <div className="segmented">
              <button
                type="button"
                className={selectedVisibility === 'private' ? 'active' : ''}
                onClick={() => setSelectedVisibility('private')}
                disabled={isUploading}
              >
                Private
              </button>
              <button
                type="button"
                className={selectedVisibility === 'public' ? 'active' : ''}
                onClick={() => setSelectedVisibility('public')}
                disabled={isUploading}
              >
                Org Shared
              </button>
            </div>
          </label>

          <label className="field">
            <span>Folder</span>
            <select
              value={selectedFolderId ?? ''}
              onChange={(event) => setSelectedFolderId(event.target.value || null)}
              disabled={isUploading || scopedFolders.length === 0}
            >
              {scopedFolders.length === 0 && <option value="">No folders available</option>}
              {scopedFolders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.name}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>File</span>
            <input
              type="file"
              accept=".txt"
              onChange={(event) => {
                const chosen = event.target.files?.[0] ?? null;
                if (!chosen) {
                  setFile(null);
                  setName('');
                  return;
                }
                if (!chosen.name.toLowerCase().endsWith('.txt')) {
                  setError('Only .txt files are supported right now.');
                  setFile(null);
                  return;
                }
                setError(null);
                setFile(chosen);
                setName(chosen.name.replace(/\.txt$/i, ''));
              }}
              disabled={isUploading}
            />
          </label>

          <label className="field">
            <span>Display Name</span>
            <input
              type="text"
              value={name}
              placeholder="Optional custom name"
              onChange={(event) => setName(event.target.value)}
              disabled={isUploading}
            />
          </label>

          {error && <p className="error-text">{error}</p>}
        </div>
        <footer className="dialog-footer">
          <button type="button" className="link" onClick={onClose} disabled={isUploading}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              if (!file || !selectedFolderId) {
                setError('Select a folder and file to continue.');
                return;
              }
              const trimmed = name.trim();
              const finalName = trimmed
                ? trimmed.toLowerCase().endsWith('.txt')
                  ? trimmed
                  : `${trimmed}.txt`
                : undefined;
              onUpload({
                file,
                folderId: selectedFolderId,
                visibility: selectedVisibility,
                name: finalName,
              });
            }}
            disabled={isUploading || !file || !selectedFolderId}
          >
            {isUploading ? 'Uploading…' : 'Upload'}
          </button>
        </footer>
      </div>
    </div>
  );
}

interface FolderDialogProps {
  open: boolean;
  onClose: () => void;
  onCreate: (args: { name: string; visibility: Visibility }) => void;
  isSaving: boolean;
}

function FolderDialog({ open, onClose, onCreate, isSaving }: FolderDialogProps) {
  const [name, setName] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('private');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setName('');
      setVisibility('private');
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true">
      <div className="dialog-card">
        <header>
          <h3>New Folder</h3>
        </header>
        <div className="dialog-body">
          <label className="field">
            <span>Name</span>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Q1 Plans"
              disabled={isSaving}
            />
          </label>
          <label className="field">
            <span>Visibility</span>
            <div className="segmented">
              <button
                type="button"
                className={visibility === 'private' ? 'active' : ''}
                onClick={() => setVisibility('private')}
                disabled={isSaving}
              >
                Private
              </button>
              <button
                type="button"
                className={visibility === 'public' ? 'active' : ''}
                onClick={() => setVisibility('public')}
                disabled={isSaving}
              >
                Org Shared
              </button>
            </div>
          </label>
          {error && <p className="error-text">{error}</p>}
        </div>
        <footer className="dialog-footer">
          <button type="button" className="link" onClick={onClose} disabled={isSaving}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              if (!name.trim()) {
                setError('Folder name is required');
                return;
              }
              onCreate({ name: name.trim(), visibility });
            }}
            disabled={isSaving}
          >
            {isSaving ? 'Creating…' : 'Create'}
          </button>
        </footer>
      </div>
    </div>
  );
}

export function FileManager({ currentUserId }: FileManagerProps) {
  const [visibilityFilter, setVisibilityFilter] = useState<Visibility>('private');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [showFolderDialog, setShowFolderDialog] = useState(false);
  const [renamingFile, setRenamingFile] = useState<FileSummary | null>(null);
  const [alert, setAlert] = useState<{ type: 'info' | 'error'; message: string } | null>(null);
  const queryClient = useQueryClient();

  const foldersQuery = useQuery({
    queryKey: ['folders', 'all'],
    queryFn: () => fetchFolders({ visibility: 'all' }),
  });

  const folders: FolderSummary[] = foldersQuery.data?.folders ?? [];

  const foldersByVisibility = useMemo(() => {
    const privateFolders = folders.filter((folder) => folder.visibility === 'private' && folder.owner?.id === currentUserId);
    const publicFolders = folders.filter((folder) => folder.visibility === 'public');
    return { private: privateFolders, public: publicFolders };
  }, [folders, currentUserId]);

  useEffect(() => {
    const scoped = visibilityFilter === 'private' ? foldersByVisibility.private : foldersByVisibility.public;
    setSelectedFolderId((prev) => {
      if (prev && scoped.some((folder) => folder.id === prev)) {
        return prev;
      }
      return scoped[0]?.id ?? null;
    });
  }, [visibilityFilter, foldersByVisibility.private, foldersByVisibility.public]);

  const filesQuery = useQuery({
    queryKey: ['files', visibilityFilter, selectedFolderId ?? 'all'],
    queryFn: () =>
      fetchFiles({
        visibility: visibilityFilter,
        folderId: selectedFolderId ?? undefined,
      }),
    enabled: Boolean(selectedFolderId) || visibilityFilter === 'public',
  });

  const files = filesQuery.data?.files ?? [];
  const timestampFormatter = useMemo(
    () => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }),
    [],
  );

  const uploadMutation = useMutation({
    mutationFn: async ({ file, folderId, visibility, name }: { file: File; folderId: string; visibility: Visibility; name?: string }) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folderId', folderId);
      formData.append('visibility', visibility);
      if (name) {
        formData.append('name', name);
      }
      await uploadFile(formData);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['files'] }),
        queryClient.invalidateQueries({ queryKey: ['folders'] }),
      ]);
      setShowUpload(false);
      setAlert({ type: 'info', message: 'Upload complete. Document is ready for search.' });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Upload failed';
      setAlert({ type: 'error', message });
    },
  });

  const createFolderMutation = useMutation({
    mutationFn: createFolder,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['folders', 'all'] });
      setShowFolderDialog(false);
      setAlert({ type: 'info', message: 'Folder created.' });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Unable to create folder';
      setAlert({ type: 'error', message });
    },
  });

  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => updateFile(id, { name }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['files'] });
      setRenamingFile(null);
      setAlert({ type: 'info', message: 'File renamed.' });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Rename failed';
      setAlert({ type: 'error', message });
    },
  });

  const toggleVisibilityMutation = useMutation({
    mutationFn: ({ id, visibility }: { id: string; visibility: Visibility }) => updateFile(id, { visibility }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['files'] }),
        queryClient.invalidateQueries({ queryKey: ['folders'] }),
      ]);
      setAlert({ type: 'info', message: 'Visibility updated.' });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Unable to update visibility';
      setAlert({ type: 'error', message });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteFile(id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['files'] }),
        queryClient.invalidateQueries({ queryKey: ['folders'] }),
      ]);
      setAlert({ type: 'info', message: 'File deleted.' });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Delete failed';
      setAlert({ type: 'error', message });
    },
  });

  const scopedFolders = visibilityFilter === 'private' ? foldersByVisibility.private : foldersByVisibility.public;
  const isOwner = (file: FileSummary) => file.owner.id === currentUserId;
  const isLoadingFiles = filesQuery.isLoading;
  const selectedFolder = scopedFolders.find((folder) => folder.id === selectedFolderId) ?? null;
  const folderMeta = visibilityFilter === 'private' ? 'Personal space' : 'Shared workspace';
  const documentMeta = selectedFolder
    ? selectedFolder.name
    : visibilityFilter === 'public'
      ? 'All shared folders'
      : scopedFolders.length === 0
        ? 'Awaiting folder'
        : 'All folders';
  const documentCountLabel = isLoadingFiles ? '…' : files.length.toString();
  const fileListContent = (() => {
    if (isLoadingFiles) {
      return <div className="file-empty">Loading documents…</div>;
    }
    if (files.length === 0) {
      return (
        <div className="file-empty">
          {visibilityFilter === 'private'
            ? 'No documents here yet. Upload a file to get started.'
            : 'No shared documents yet.'}
        </div>
      );
    }
    return (
      <div className="card-list">
        {files.map((file) => {
          const ownerLabel = file.owner.displayName ?? file.owner.email;
          const visibilityLabel = file.visibility === 'public' ? 'Public' : 'Private';
          const updatedAt = timestampFormatter.format(new Date(file.updatedAt));
          return (
            <article key={file.id} className="file-card">
              <div className="file-card__header">
                <div>
                  <div className="file-card__title">{file.name}</div>
                  <div className="file-card__meta">
                    <span className={`badge ${file.visibility}`}>{visibilityLabel}</span>
                    <span className="owner-chip">{ownerLabel}</span>
                    <span>{file.folder.name}</span>
                  </div>
                </div>
              </div>
              <div className="file-card__footer">
                <span className="file-card__timestamp">Updated {updatedAt}</span>
                <div className="file-card__actions">
                  <button
                    type="button"
                    className="secondary"
                    onClick={() =>
                      window.open(`${API_BASE}/api/files/${file.id}/download`, '_blank')?.focus?.()
                    }
                  >
                    Open
                  </button>
                  {isOwner(file) && (
                    <>
                      <button type="button" className="secondary" onClick={() => setRenamingFile(file)}>
                        Rename
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() =>
                          toggleVisibilityMutation.mutate({
                            id: file.id,
                            visibility: file.visibility === 'public' ? 'private' : 'public',
                          })
                        }
                      >
                        Make {file.visibility === 'public' ? 'Private' : 'Public'}
                      </button>
                      <button type="button" className="danger" onClick={() => deleteMutation.mutate(file.id)}>
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    );
  })();

  return (
    <section className="panel file-manager prime">
      <header className="panel-header">
        <div>
          <h2>Knowledge Vault</h2>
          <p className="muted">Curate private and shared knowledge spaces.</p>
        </div>
        <div className="actions">
          <button type="button" className="secondary" onClick={() => setShowFolderDialog(true)}>
            New Folder
          </button>
          <button
            type="button"
            onClick={() => setShowUpload(true)}
            disabled={scopedFolders.length === 0}
            title={scopedFolders.length === 0 ? 'Create a folder first' : undefined}
          >
            Upload
          </button>
        </div>
      </header>

      {alert && (
        <div className={`banner ${alert.type}`}>
          <span>{alert.message}</span>
          <button type="button" onClick={() => setAlert(null)} aria-label="Dismiss notification">
            ×
          </button>
        </div>
      )}

      <div className="file-toolbar">
        <div className="segmented" role="tablist" aria-label="Visibility filter">
          <button
            type="button"
            className={visibilityFilter === 'private' ? 'active' : ''}
            onClick={() => setVisibilityFilter('private')}
            role="tab"
            aria-selected={visibilityFilter === 'private'}
          >
            My Files
          </button>
          <button
            type="button"
            className={visibilityFilter === 'public' ? 'active' : ''}
            onClick={() => setVisibilityFilter('public')}
            role="tab"
            aria-selected={visibilityFilter === 'public'}
          >
            Org Shared
          </button>
        </div>
        <div className="file-stats">
          <div className="stat-card">
            <span className="label">Folders</span>
            <span className="value">{scopedFolders.length}</span>
            <span className="meta">{folderMeta}</span>
          </div>
          <div className="stat-card">
            <span className="label">Documents</span>
            <span className="value">{documentCountLabel}</span>
            <span className="meta">{documentMeta}</span>
          </div>
        </div>
      </div>

      <div className="file-folders">
        <span className="file-folders__label">Folders</span>
        <div className="folders-bar">
          {scopedFolders.length === 0 ? (
            <p className="muted">No folders yet. Create one to get started.</p>
          ) : (
            <ul>
              {scopedFolders.map((folder) => (
                <li key={folder.id}>
                  <button
                    className={selectedFolderId === folder.id ? 'active' : ''}
                    onClick={() => setSelectedFolderId(folder.id)}
                  >
                    <span>{folder.name}</span>
                    <span className="count">{folder.fileCount}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="file-collection">
        <span className="file-folders__label">Documents</span>
        {fileListContent}
      </div>

      {renamingFile && (
        <div className="dialog-backdrop" role="dialog" aria-modal="true">
          <div className="dialog-card">
            <header>
              <h3>Rename File</h3>
            </header>
            <div className="dialog-body">
              <input
                type="text"
                value={renamingFile.name}
                onChange={(event) => setRenamingFile({ ...renamingFile, name: event.target.value })}
              />
            </div>
            <footer className="dialog-footer">
              <button type="button" className="link" onClick={() => setRenamingFile(null)}>
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!renamingFile.name.trim()) return;
                  renameMutation.mutate({ id: renamingFile.id, name: renamingFile.name.trim() });
                }}
              >
                {renameMutation.isPending ? 'Saving…' : 'Save'}
              </button>
            </footer>
          </div>
        </div>
      )}

      <UploadDialog
        open={showUpload}
        visibility={visibilityFilter}
        folders={folders}
        onClose={() => setShowUpload(false)}
        onUpload={({ file, folderId, visibility, name }) => {
          uploadMutation.mutate({ file, folderId, visibility, name });
        }}
        isUploading={uploadMutation.isPending}
      />

      <FolderDialog
        open={showFolderDialog}
        onClose={() => setShowFolderDialog(false)}
        onCreate={({ name, visibility }) => createFolderMutation.mutate({ name, visibility })}
        isSaving={createFolderMutation.isPending}
      />
    </section>
  );
}
