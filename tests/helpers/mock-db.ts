import type { D1Database } from '@cloudflare/workers-types';
import type { ChunkRecord, FileRecord, FolderRecord } from '../../api/src/types';

interface RunResult {
  results?: unknown[];
}

export class MockD1 implements D1Database {
  users = new Map<string, { id: string; email: string; name?: string }>();
  folders = new Map<string, FolderRecord>();
  files = new Map<string, FileRecord>();
  chunks = new Map<string, ChunkRecord>();
  messages: unknown[] = [];

  prepare(query: string) {
    const db = this;
    return {
      args: [] as unknown[],
      bind(...args: unknown[]) {
        this.args = args;
        return this;
      },
      async run() {
        db.execute(query, this.args);
        return {} as RunResult;
      },
      async first<T>() {
        const result = db.execute(query, this.args);
        if (Array.isArray(result)) {
          return (result[0] as T) ?? null;
        }
        return (result as T) ?? null;
      },
      async all<T>() {
        const result = db.execute(query, this.args);
        if (Array.isArray(result)) {
          return { results: result as T[] };
        }
        if (!result) {
          return { results: [] };
        }
        return { results: [result as T] };
      },
    };
  }

  dump() {
    return {
      users: Array.from(this.users.values()),
      folders: Array.from(this.folders.values()),
      files: Array.from(this.files.values()),
      chunks: Array.from(this.chunks.values()),
      messages: this.messages,
    };
  }

  private execute(query: string, args: unknown[]) {
    const normalized = query.replace(/\s+/g, ' ').trim().toLowerCase();

    if (normalized.startsWith('insert into users')) {
      const [id, email, name] = args as [string, string, string];
      this.users.set(id, { id, email, name: name ?? undefined });
      return null;
    }

    if (normalized.startsWith('insert into folders')) {
      const [id, name, visibility, ownerId] = args as [string, string, string, string | null];
      const existing = this.folders.get(id);
      this.folders.set(id, {
        id,
        name,
        visibility: visibility as 'public' | 'private',
        owner_id: ownerId,
        created_at: existing?.created_at ?? new Date().toISOString(),
      });
      return null;
    }

    if (normalized.startsWith('select id, name, visibility, owner_id, created_at from folders')) {
      const [id] = args as [string];
      const folder = this.folders.get(id);
      return folder ?? null;
    }

    if (normalized.startsWith('insert into files')) {
      const [id, folderId, ownerId, visibility, fileName, r2Key, size, status] = args as [
        string,
        string,
        string,
        string,
        string,
        string,
        number,
        FileRecord['status'],
      ];
      this.files.set(id, {
        id,
        folder_id: folderId,
        owner_id: ownerId,
        visibility: visibility as 'public' | 'private',
        file_name: fileName,
        r2_key: r2Key,
        size,
        status,
        created_at: new Date().toISOString(),
      });
      return null;
    }

    if (normalized.startsWith('select f.id')) {
      const [fileId] = args as [string];
      const file = this.files.get(fileId);
      if (!file) {
        return null;
      }
      const folder = this.folders.get(file.folder_id);
      return {
        ...file,
        folder_name: folder?.name ?? 'Folder',
      };
    }

    if (normalized.startsWith('update files set status')) {
      const [fileId, status] = args as [string, FileRecord['status']];
      const file = this.files.get(fileId);
      if (file) {
        file.status = status;
      }
      return null;
    }

    if (normalized.startsWith('insert into chunks')) {
      const [id, fileId, folderId, ownerId, visibility, chunkIndex, startLine, endLine, content] = args as [
        string,
        string,
        string,
        string,
        string,
        number,
        number,
        number,
        string,
      ];
      this.chunks.set(id, {
        id,
        file_id: fileId,
        folder_id: folderId,
        owner_id: ownerId,
        visibility: visibility as 'public' | 'private',
        chunk_index: chunkIndex,
        start_line: startLine,
        end_line: endLine,
        content,
        created_at: new Date().toISOString(),
      });
      return null;
    }

    if (normalized.startsWith('select id from chunks where file_id')) {
      const [fileId] = args as [string];
      return Array.from(this.chunks.values())
        .filter((chunk) => chunk.file_id === fileId)
        .map((chunk) => ({ id: chunk.id }));
    }

    if (normalized.startsWith('delete from chunks where file_id')) {
      const [fileId] = args as [string];
      for (const [chunkId, chunk] of this.chunks.entries()) {
        if (chunk.file_id === fileId) {
          this.chunks.delete(chunkId);
        }
      }
      return null;
    }

    if (normalized.startsWith('delete from files')) {
      const [fileId] = args as [string];
      this.files.delete(fileId);
      return null;
    }

    if (normalized.startsWith('select c.id')) {
      const ids = args as string[];
      return ids
        .map((id) => this.chunks.get(id))
        .filter(Boolean)
        .map((chunk) => {
          const file = this.files.get(chunk!.file_id);
          const folder = file ? this.folders.get(file.folder_id) : undefined;
          return {
            ...chunk!,
            file_name: file?.file_name ?? 'file.txt',
            folder_name: folder?.name ?? 'Folder',
          };
        });
    }

    if (normalized.startsWith('insert into messages')) {
      const record = {
        id: args[0],
        user_id: args[1],
        question: args[2],
        answer: args[3],
        citations: args[4],
      };
      this.messages.push(record);
      return null;
    }

    if (normalized.startsWith('select f.id, f.folder_id')) {
      const filters: { folderId?: string; visibility?: string; ownerId?: string } = {};
      const clause = normalized.includes('where') ? normalized.split('where')[1] : '';
      let index = 0;
      if (clause.includes('f.folder_id =')) {
        filters.folderId = args[index++] as string;
      }
      if (clause.includes('f.visibility =')) {
        filters.visibility = args[index++] as string;
      }
      if (clause.includes('f.owner_id =')) {
        filters.ownerId = args[index++] as string;
      }
      return Array.from(this.files.values())
        .filter((file) => {
          if (filters.folderId && file.folder_id !== filters.folderId) {
            return false;
          }
          if (filters.visibility && file.visibility !== filters.visibility) {
            return false;
          }
          if (filters.ownerId && file.owner_id !== filters.ownerId) {
            return false;
          }
          return true;
        })
        .sort((a, b) => (a.created_at > b.created_at ? -1 : 1))
        .map((file) => {
          const folder = this.folders.get(file.folder_id);
          return {
            ...file,
            folder_name: folder?.name ?? 'Folder',
          };
        });
    }

    throw new Error(`Unsupported query in mock DB: ${query}`);
  }
}
