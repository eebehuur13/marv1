// frontend/src/lib/api.ts

// --- Types ---
export interface WhoAmIResponse {
  user: {
    id: string;
    email: string;
    name?: string;
  };
}

export interface FileRecord {
  id: string;
  folder_id: string;
  folder_name: string;
  file_name: string;
  visibility: 'public' | 'private';
  status: 'uploading' | 'ready';
  created_at: string;
  size: number;
}

export interface UploadUrlArgs {
  folderId: string;
  folderName: string;
  visibility: 'public' | 'private';
  fileName: string;
  size: number;
}

export interface UploadUrlResponse {
  fileId: string;
  uploadUrl: string;
  key: string;
}

export interface ChatResponse {
  id: string;
  answer: string;
  citations: Array<{ folder: string; file: string; lines: [number, number] }>;
  sources: Array<{
    order: number;
    chunkId: string;
    folderName: string;
    fileName: string;
    startLine: number;
    endLine: number;
    content: string;
  }>;
}

// --- Base URL from env ---
const BASE = import.meta.env.VITE_API_BASE ?? '';

// --- Fetch wrapper ---
async function fetchJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${BASE}${path}`;
  const response = await fetch(url, init);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed with ${response.status}`);
  }
  return response.json() as Promise<T>;
}

// --- API functions ---
export function fetchWhoAmI(): Promise<WhoAmIResponse> {
  return fetchJSON('/api/whoami');
}

export function fetchFiles(params: { folderId?: string; visibility?: 'public' | 'private' }): Promise<{ files: FileRecord[] }> {
  const search = new URLSearchParams();
  if (params.folderId) {
    search.set('folder_id', params.folderId);
  }
  if (params.visibility) {
    search.set('visibility', params.visibility);
  }
  const query = search.toString();
  return fetchJSON(`/api/files${query ? `?${query}` : ''}`);
}

// --- Upload (with fallback) ---
export async function requestUploadUrl(body: UploadUrlArgs): Promise<UploadUrlResponse> {
  try {
    // Try presigned upload first
    return await fetchJSON('/api/upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.warn('Presigned upload failed, falling back to direct upload:', err);

    // Fallback: upload file contents directly
    const text = (body as any).fileText ?? ''; // caller must pass fileText
    const url = new URL(`${BASE}/api/upload-direct`);
    url.searchParams.set('folderId', body.folderId);
    url.searchParams.set('folderName', body.folderName);
    url.searchParams.set('visibility', body.visibility);
    url.searchParams.set('fileName', body.fileName);
    url.searchParams.set('size', String(body.size));

    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: text,
    });
    if (!res.ok) {
      throw new Error(await res.text());
    }
    return res.json();
  }
}

export function triggerIngest(fileId: string): Promise<{ chunks: number }> {
  return fetchJSON('/api/ingest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileId }),
  });
}

export function removeFile(fileId: string): Promise<{ deleted: boolean }> {
  return fetchJSON(`/api/files/${fileId}`, {
    method: 'DELETE',
  });
}

export function sendChat(question: string): Promise<ChatResponse> {
  return fetchJSON('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  });
}
