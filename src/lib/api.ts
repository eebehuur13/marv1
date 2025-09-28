// frontend/src/lib/api.ts

// --- Types ---
export interface SessionResponse {
  user: {
    id: string;
    email: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
  tenant: string;
}

export type Visibility = 'public' | 'private';

export interface FolderSummary {
  id: string;
  name: string;
  visibility: Visibility;
  fileCount: number;
  owner: {
    id: string;
    email: string;
    displayName: string | null;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface FileSummary {
  id: string;
  name: string;
  visibility: Visibility;
  status: 'uploading' | 'ready';
  size: number;
  mimeType: string | null;
  folder: {
    id: string;
    name: string;
    visibility: Visibility;
  };
  owner: {
    id: string;
    email: string;
    displayName: string | null;
  };
  createdAt: string;
  updatedAt: string;
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
export const API_BASE = BASE;

// --- Fetch helper ---
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
export function fetchSession(): Promise<SessionResponse> {
  return fetchJSON('/api/session');
}

export function fetchFolders(params: { visibility?: 'public' | 'private' | 'all' } = {}): Promise<{ folders: FolderSummary[] }>
{
  const search = new URLSearchParams();
  if (params.visibility) {
    search.set('visibility', params.visibility);
  }
  const query = search.toString();
  return fetchJSON(`/api/folders${query ? `?${query}` : ''}`);
}

export function createFolder(body: { name: string; visibility: Visibility }): Promise<{ folder: FolderSummary }> {
  return fetchJSON('/api/folders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function updateFolder(id: string, body: { name?: string; visibility?: Visibility }): Promise<{ folder: FolderSummary }>
{
  return fetchJSON(`/api/folders/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function fetchFiles(params: { visibility?: 'public' | 'private' | 'all'; folderId?: string }): Promise<{ files: FileSummary[] }>
{
  const search = new URLSearchParams();
  if (params.visibility) search.set('visibility', params.visibility);
  if (params.folderId) search.set('folderId', params.folderId);
  const query = search.toString();
  return fetchJSON(`/api/files${query ? `?${query}` : ''}`);
}

export async function uploadFile(formData: FormData): Promise<{ file: FileSummary }> {
  const response = await fetch(`${BASE}/api/files`, {
    method: 'POST',
    body: formData,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Upload failed with ${response.status}`);
  }
  return response.json();
}

export function updateFile(id: string, body: { name?: string; visibility?: Visibility; folderId?: string }): Promise<{ file: FileSummary }>
{
  return fetchJSON(`/api/files/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function deleteFile(id: string): Promise<{ deleted: boolean }> {
  return fetchJSON(`/api/files/${id}`, { method: 'DELETE' });
}

export function sendChat(message: string, knowledgeMode: boolean): Promise<ChatResponse> {
  return fetchJSON('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, knowledgeMode }),
  });
}
