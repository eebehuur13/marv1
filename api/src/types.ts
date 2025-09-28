import type { VectorizeIndex } from '@cloudflare/workers-types';

export type Visibility = 'public' | 'private';

export interface MarbleBindings {
  MARBLE_DB: D1Database;
  MARBLE_FILES: R2Bucket;
  MARBLE_VECTORS: VectorizeIndex;
  OPENAI_API_KEY: string;
  OPENAI_MODEL?: string;
  OPENAI_EMBEDDING_MODEL?: string;
  VECTOR_TOP_K?: string;
  CHUNK_SIZE?: string;
  CHUNK_OVERLAP?: string;
  CF_ACCESS_AUD: string;
  CF_ACCESS_TEAM_DOMAIN: string;
}

export interface MarbleContext {
  user: AuthenticatedUser;
  env: MarbleBindings;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  name?: string;
}

export interface FolderRecord {
  id: string;
  name: string;
  visibility: Visibility;
  owner_id: string | null;
  created_at: string;
}

export interface FileRecord {
  id: string;
  folder_id: string;
  owner_id: string;
  visibility: Visibility;
  file_name: string;
  r2_key: string;
  size: number;
  status: 'uploading' | 'ready';
  created_at: string;
}

export interface ChunkRecord {
  id: string;
  file_id: string;
  folder_id: string;
  owner_id: string;
  visibility: Visibility;
  chunk_index: number;
  start_line: number;
  end_line: number;
  content: string;
  created_at: string;
}

export interface ChatCitation {
  folder: string;
  file: string;
  lines: [number, number];
}

export interface ChatResult {
  answer: string;
  citations: ChatCitation[];
}
