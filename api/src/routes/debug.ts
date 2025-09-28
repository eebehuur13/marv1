// api/src/routes/debug.ts
import type { AppContext } from '../context';
import { HTTPException } from 'hono/http-exception';
import { createEmbeddings } from '../lib/openai';
import { publicNamespace, privateNamespace, queryNamespace } from '../lib/vectorize';

/**
 * GET /api/debug/query?q=some+text[&scope=public|private|both]
 * Uses your real embeddings + vector index. Helpful to verify search end-to-end.
 */
export async function handleDebugQuery(c: AppContext) {
  const user = c.get('user');
  const url = new URL(c.req.url);
  const q = (url.searchParams.get('q') || '').trim();
  const scope = url.searchParams.get('scope') || 'both'; // 'public' | 'private' | 'both'

  if (!q) throw new HTTPException(400, { message: 'Missing q' });

  // 1) Embed the query
  const vectors = await createEmbeddings(c.env, [q]);
  const vec = vectors[0] || [];
  const vectorDims = Array.isArray(vec) ? vec.length : -1;

  // 2) Query vector index (public/private/both)
  const topK = parseTopK(c.env.VECTOR_TOP_K, 8);

  try {
    const promises: Array<Promise<any>> = [];
    if (scope === 'public' || scope === 'both') {
      promises.push(
        queryNamespace(c.env, { namespace: publicNamespace(), vector: vec, topK })
      );
    }
    if (scope === 'private' || scope === 'both') {
      promises.push(
        queryNamespace(c.env, { namespace: privateNamespace(user.id), vector: vec, topK })
      );
    }

    const results = (await Promise.all(promises)).flat();

    return c.json({
      q,
      vectorDims,
      matches: results.map((m: any) => ({
        score: m.score,
        chunkId: m.chunkId,
        fileId: m.fileId,
        fileName: m.fileName,
        folderId: m.folderId,
        folderName: m.folderName,
        visibility: m.visibility,
        ownerId: m.ownerId,
        startLine: m.startLine,
        endLine: m.endLine,
      })),
    });
  } catch (e: any) {
    return c.json(
      {
        q,
        vectorDims,
        error: String(e?.message || e),
      },
      500
    );
  }
}

/**
 * GET /api/debug/file?fileId=...
 * Lists the chunks for a file from D1 so you can copy exact text.
 */
export async function handleDebugFile(c: AppContext) {
  const url = new URL(c.req.url);
  const fileId = url.searchParams.get('fileId') || '';
  if (!fileId) throw new HTTPException(400, { message: 'Missing fileId' });

  const rows = await c.env.MARBLE_DB.prepare(
    `SELECT id, file_id, folder_id, owner_id, visibility, chunk_index, start_line, end_line, content
     FROM chunks WHERE file_id = ? ORDER BY chunk_index ASC`
  )
    .bind(fileId)
    .all<any>();

  const results = rows.results ?? [];
  return c.json({
    fileId,
    chunkCount: results.length,
    sample: results.slice(0, 3).map((r: any) => ({
      chunkId: r.id,
      range: [r.start_line, r.end_line],
      preview: (r.content || '').slice(0, 200),
    })),
    chunkIds: results.map((r: any) => r.id),
  });
}

/**
 * GET /api/debug/probe-file?fileId=...
 * Embeds the FIRST chunk's text from that file and queries the index.
 * If this returns matches, your vectors are present and discoverable.
 */
export async function handleDebugProbeFile(c: AppContext) {
  const user = c.get('user');
  const url = new URL(c.req.url);
  const fileId = url.searchParams.get('fileId') || '';
  if (!fileId) throw new HTTPException(400, { message: 'Missing fileId' });

  // First chunk for the file
  const row = await c.env.MARBLE_DB.prepare(
    `SELECT id, file_id, owner_id, visibility, folder_id, chunk_index, start_line, end_line, content
     FROM chunks WHERE file_id = ? ORDER BY chunk_index ASC LIMIT 1`
  )
    .bind(fileId)
    .first<any>();

  if (!row) throw new HTTPException(404, { message: 'No chunks for that file' });

  const [vec] = await createEmbeddings(c.env, [row.content || '']);
  const topK = 10;

  // Choose the namespace to query based on the file visibility
  const ns =
    row.visibility === 'public'
      ? publicNamespace()
      : privateNamespace(user.id);

  const matches = await queryNamespace(c.env, {
    namespace: ns,
    vector: vec,
    topK,
  });

  return c.json({
    fileId,
    probeChunkId: row.id,
    probePreview: (row.content || '').slice(0, 200),
    matches,
  });
}

/**
 * GET /api/debug/stats
 * If supported, returns Vectorize index info (handy to see if it’s empty).
 */
export async function handleDebugStats(c: AppContext) {
  try {
    const describe = (c.env as any)?.MARBLE_VECTORS?.describe;
    if (typeof describe !== 'function') {
      return c.json({ error: 'describe() not supported on this binding' }, 400);
    }
    const stats = await describe();
    return c.json(stats);
  } catch (e: any) {
    return c.json({ error: String(e?.message || e) }, 500);
  }
}

/* utils */
function parseTopK(v: string | undefined, fallback: number) {
  const n = v ? Number.parseInt(v, 10) : Number.NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
