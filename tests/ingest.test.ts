import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import app from '../api/src/worker';
import { createTestEnv } from './helpers/mock-env';

vi.mock('../api/src/lib/access', () => ({
  authenticateRequest: vi.fn(async () => ({
    id: 'user-1',
    email: 'user@example.com',
    name: 'Test User',
  })),
}));

describe('ingest route', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('chunks text files and upserts embeddings', async () => {
    const { env, db, r2, vector, ctx } = createTestEnv();

    db.folders.set('private-root', {
      id: 'private-root',
      name: 'My Space',
      visibility: 'private',
      owner_id: 'user-1',
      created_at: new Date().toISOString(),
    });

    db.files.set('file-1', {
      id: 'file-1',
      folder_id: 'private-root',
      owner_id: 'user-1',
      visibility: 'private',
      file_name: 'notes.txt',
      r2_key: 'users/user-1/private-root/file-1-notes.txt',
      size: 42,
      status: 'uploading',
      created_at: new Date().toISOString(),
    });

    await r2.put('users/user-1/private-root/file-1-notes.txt', 'Line one\nLine two\nLine three');

    global.fetch = vi.fn(async (input, init) => {
      if (typeof input === 'string' && input.endsWith('/embeddings')) {
        const body = JSON.parse(init?.body as string);
        const embeddings = body.input.map((_chunk: string, index: number) => ({
          embedding: Array(3).fill(index + 1),
        }));
        return new Response(JSON.stringify({ data: embeddings }), { status: 200 });
      }
      if (typeof input === 'string' && input.includes('/cdn-cgi/access/certs')) {
        return new Response(JSON.stringify({ keys: [] }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    });

    const request = new Request('https://example.com/api/ingest', {
      method: 'POST',
      body: JSON.stringify({ fileId: 'file-1' }),
      headers: {
        'Content-Type': 'application/json',
        'cf-access-jwt-assertion': 'test-token',
      },
    });

    const response = await app.fetch(request, env, ctx);
    expect(response.status).toBe(200);
    const json = (await response.json()) as { chunks: number };

    expect(json.chunks).toBeGreaterThan(0);
    expect(db.chunks.size).toBe(json.chunks);
    expect(vector.upserts.length).toBe(json.chunks);
  });
});
