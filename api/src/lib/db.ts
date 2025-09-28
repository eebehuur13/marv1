import { HTTPException } from 'hono/http-exception';
import type {
  AuthenticatedUser,
  ChunkRecord,
  FileRecord,
  FolderRecord,
  MarbleBindings,
  Visibility,
} from '../types';

export async function ensureUser(env: MarbleBindings, user: AuthenticatedUser): Promise<void> {
  await env.MARBLE_DB.prepare(
    `INSERT INTO users (id, email, display_name, avatar_url, tenant, last_seen)
     VALUES (?1, ?2, ?3, ?4, ?5, CURRENT_TIMESTAMP)
     ON CONFLICT(id) DO UPDATE SET
       email = excluded.email,
       display_name = excluded.display_name,
       avatar_url = excluded.avatar_url,
       tenant = excluded.tenant,
       last_seen = CURRENT_TIMESTAMP`,
  )
    .bind(user.id, user.email, user.displayName, user.avatarUrl, user.tenant)
    .run();
}

export async function getFolder(env: MarbleBindings, folderId: string): Promise<FolderRecord | null> {
  const result = await env.MARBLE_DB.prepare(
    `SELECT id, name, visibility, owner_id, created_at
     FROM folders
     WHERE id = ?1`,
  )
    .bind(folderId)
    .first<FolderRecord>();
  return result ?? null;
}

export function assertFolderVisibility(folder: FolderRecord, userId: string): void {
  if (folder.visibility === 'public') {
    return;
  }
  if (folder.owner_id !== userId) {
    throw new HTTPException(403, { message: 'Folder is private to another user' });
  }
}

export async function createFileRecord(
  env: MarbleBindings,
  data: Pick<FileRecord, 'id' | 'folder_id' | 'owner_id' | 'visibility' | 'file_name' | 'r2_key' | 'size' | 'status'>,
): Promise<void> {
  await env.MARBLE_DB.prepare(
    `INSERT INTO files (id, folder_id, owner_id, visibility, file_name, r2_key, size, status)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
  )
    .bind(
      data.id,
      data.folder_id,
      data.owner_id,
      data.visibility,
      data.file_name,
      data.r2_key,
      data.size,
      data.status,
    )
    .run();
}

export async function updateFileStatus(env: MarbleBindings, fileId: string, status: FileRecord['status']): Promise<void> {
  await env.MARBLE_DB.prepare(`UPDATE files SET status = ?2 WHERE id = ?1`).bind(fileId, status).run();
}

export interface FileWithFolder extends FileRecord {
  folder_name: string;
}

export async function getFile(env: MarbleBindings, fileId: string): Promise<FileWithFolder | null> {
  const result = await env.MARBLE_DB.prepare(
    `SELECT f.id, f.folder_id, f.owner_id, f.visibility, f.file_name, f.r2_key, f.size, f.status, f.created_at,
            d.name as folder_name
     FROM files f
     JOIN folders d ON d.id = f.folder_id
     WHERE f.id = ?1`,
  )
    .bind(fileId)
    .first<FileWithFolder>();
  return result ?? null;
}

export interface ListFilesFilters {
  folderId?: string;
  visibility?: Visibility;
  ownerId?: string;
}

export async function listFiles(env: MarbleBindings, filters: ListFilesFilters): Promise<FileWithFolder[]> {
  const clauses: string[] = [];
  const bindings: unknown[] = [];

  if (filters.folderId) {
    clauses.push('f.folder_id = ?' + (bindings.length + 1));
    bindings.push(filters.folderId);
  }
  if (filters.visibility) {
    clauses.push('f.visibility = ?' + (bindings.length + 1));
    bindings.push(filters.visibility);
  }
  if (filters.ownerId) {
    clauses.push('f.owner_id = ?' + (bindings.length + 1));
    bindings.push(filters.ownerId);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const statement = `SELECT f.id, f.folder_id, f.owner_id, f.visibility, f.file_name, f.r2_key, f.size, f.status, f.created_at,
        d.name as folder_name
      FROM files f
      JOIN folders d ON d.id = f.folder_id
      ${where}
      ORDER BY datetime(f.created_at) DESC`;

  const results = await env.MARBLE_DB.prepare(statement).bind(...bindings).all<FileWithFolder>();
  return results.results ?? [];
}

export async function deleteFile(env: MarbleBindings, fileId: string): Promise<void> {
  await env.MARBLE_DB.prepare('DELETE FROM files WHERE id = ?1').bind(fileId).run();
}

export async function insertChunk(
  env: MarbleBindings,
  record: Pick<ChunkRecord, 'id' | 'file_id' | 'folder_id' | 'owner_id' | 'visibility' | 'chunk_index' | 'start_line' | 'end_line' | 'content'>,
): Promise<void> {
  await env.MARBLE_DB.prepare(
    `INSERT INTO chunks (id, file_id, folder_id, owner_id, visibility, chunk_index, start_line, end_line, content)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
  )
    .bind(
      record.id,
      record.file_id,
      record.folder_id,
      record.owner_id,
      record.visibility,
      record.chunk_index,
      record.start_line,
      record.end_line,
      record.content,
    )
    .run();
}

export async function deleteChunksForFile(env: MarbleBindings, fileId: string): Promise<string[]> {
  const chunkIds = await env.MARBLE_DB.prepare('SELECT id FROM chunks WHERE file_id = ?1')
    .bind(fileId)
    .all<{ id: string }>();

  await env.MARBLE_DB.prepare('DELETE FROM chunks WHERE file_id = ?1').bind(fileId).run();
  return (chunkIds.results ?? []).map((row) => row.id);
}

export interface ChunkWithContext extends ChunkRecord {
  file_name: string;
  folder_name: string;
}

export async function getChunksByIds(env: MarbleBindings, chunkIds: string[]): Promise<ChunkWithContext[]> {
  if (!chunkIds.length) {
    return [];
  }
  const placeholders = chunkIds.map((_, idx) => `?${idx + 1}`).join(',');
  const statement = `SELECT c.id, c.file_id, c.folder_id, c.owner_id, c.visibility, c.chunk_index, c.start_line, c.end_line, c.content, c.created_at,
        f.file_name, d.name as folder_name
      FROM chunks c
      JOIN files f ON f.id = c.file_id
      JOIN folders d ON d.id = c.folder_id
      WHERE c.id IN (${placeholders})`;
  const results = await env.MARBLE_DB.prepare(statement).bind(...chunkIds).all<ChunkWithContext>();
  return results.results ?? [];
}

export async function recordChat(
  env: MarbleBindings,
  data: { id: string; user_id: string; question: string; answer: string; citations: string },
): Promise<void> {
  await env.MARBLE_DB.prepare(
    `INSERT INTO messages (id, user_id, question, answer, citations)
     VALUES (?1, ?2, ?3, ?4, ?5)`,
  )
    .bind(data.id, data.user_id, data.question, data.answer, data.citations)
    .run();
}

export async function ensureFolder(env: MarbleBindings, folderId: string, name: string, visibility: Visibility, ownerId: string | null): Promise<void> {
  await env.MARBLE_DB.prepare(
    `INSERT INTO folders (id, name, visibility, owner_id)
     VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, visibility = excluded.visibility, owner_id = excluded.owner_id`,
  )
    .bind(folderId, name, visibility, ownerId)
    .run();
}
