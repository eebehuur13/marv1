// frontend/src/lib/api.ts

import { getIdentityHeader, getIdentityHeaderName } from './auth';

// --- Types ---
export interface SessionResponse {
  user: {
    id: string;
    email: string;
    displayName: string | null;
    avatarUrl: string | null;
    tenant: string;
    authMethod: 'access' | 'dev';
  };
  tenant: string;
  mode: 'access' | 'dev';
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

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

function attachIdentity(init?: RequestInit): RequestInit {
  const headers = new Headers(init?.headers ?? undefined);
  const identity = getIdentityHeader();
  if (identity) {
    headers.set(getIdentityHeaderName(), identity);
  }
  return { ...init, headers };
}

// --- Fetch helper ---
async function fetchJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${BASE}${path}`;
  const response = await fetch(url, attachIdentity(init));
  if (!response.ok) {
    const text = await response.text();
    let message = text || `Request failed with ${response.status}`;
    try {
      const parsed = JSON.parse(text) as { error?: string };
      if (parsed && typeof parsed.error === 'string' && parsed.error.trim().length > 0) {
        message = parsed.error;
      }
    } catch {
      // ignore parse errors; fall back to raw text
    }
    throw new ApiError(response.status, message);
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
  const response = await fetch(`${BASE}/api/files`, attachIdentity({
    method: 'POST',
    body: formData,
  }));
  if (!response.ok) {
    const text = await response.text();
    throw new ApiError(response.status, text || `Upload failed with ${response.status}`);
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
