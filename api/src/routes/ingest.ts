import { HTTPException } from 'hono/http-exception';
import type { AppContext } from '../context';
import { chunkText } from '../lib/chunk';
import { createEmbeddings, OpenAIError } from '../lib/openai';
import { insertChunk, deleteChunksForFile, getFile, updateFileStatus } from '../lib/db';
import { deleteChunkVectors, upsertChunkVector } from '../lib/vectorize';
import { ingestInput } from '../schemas';

function parseNumber(value: string | undefined, fallback: number): number {
  const parsed = value ? Number.parseInt(value, 10) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

// Normalize whatever the embeddings provider returns to number[][]
function normalizeEmbeddings(maybe: any): number[][] {
  // OpenAI SDK shape: { data: [{ embedding: number[] }, ...] }
  if (maybe && Array.isArray(maybe.data)) {
    return maybe.data.map((d: any) => d.embedding);
  }
  // Already number[][]
  if (Array.isArray(maybe) && Array.isArray(maybe[0])) {
    return maybe as number[][];
  }
  // Single vector number[]
  if (Array.isArray(maybe) && typeof maybe[0] === 'number') {
    return [maybe as number[]];
  }
  // Some wrappers return { vectors: number[][] }
  if (maybe && Array.isArray(maybe.vectors)) {
    return maybe.vectors as number[][];
  }
  throw new Error('Embedding response not in a known format');
}

export async function handleIngest(c: AppContext) {
  const user = c.get('user');
  const input = await c.req.json();
  const parsed = ingestInput.safeParse(input);
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.message });
  }

  const file = await getFile(c.env, parsed.data.fileId);
  if (!file) {
    throw new HTTPException(404, { message: 'File not found' });
  }

  if (file.owner_id !== user.id) {
    throw new HTTPException(403, { message: 'You can only ingest your own files' });
  }

  const object = await c.env.MARBLE_FILES.get(file.r2_key);
  if (!object) {
    throw new HTTPException(404, { message: 'Uploaded object not found in R2' });
  }

  const text = await object.text();
  const chunkSize = parseNumber(c.env.CHUNK_SIZE, 1500);
  const overlap = parseNumber(c.env.CHUNK_OVERLAP, 200);
  const chunks = chunkText(text, { chunkSize, overlap });

  if (!chunks.length) {
    throw new HTTPException(400, { message: 'No content found to ingest' });
  }

  // Create embeddings for each chunk's content
  let rawEmbeddings: number[][] | any;
  try {
    rawEmbeddings = await createEmbeddings(
      c.env,
      chunks.map((chunk) => chunk.content),
    );
  } catch (error) {
    console.error('Embedding generation failed', error);
    if (error instanceof OpenAIError) {
      throw new HTTPException(502, { message: error.message });
    }
    throw new HTTPException(500, { message: (error as Error)?.message || String(error) });
  }

  let embeddings: number[][];
  try {
    embeddings = normalizeEmbeddings(rawEmbeddings);
  } catch (e: any) {
    console.error('normalizeEmbeddings failed', e);
    throw new HTTPException(500, {
      message: `Failed to parse embeddings: ${e?.message || String(e)}`,
    });
  }

  if (embeddings.length !== chunks.length) {
    throw new HTTPException(500, {
      message: `Embedding count mismatch: got ${embeddings.length}, expected ${chunks.length}`,
    });
  }

  // --- Remove existing chunks/vectors from D1 + Vectorize ---
  const existing = await deleteChunksForFile(c.env, file.id);
  if (existing.length) {
    try {
      await deleteChunkVectors(c.env, existing, file.visibility, file.owner_id);
    } catch (error) {
      console.error('Vector delete failed', { fileId: file.id, error });
      throw error;
    }
  }

  let insertedChunks = 0;
  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    const chunkId = crypto.randomUUID();

    await insertChunk(c.env, {
      id: chunkId,
      file_id: file.id,
      folder_id: file.folder_id,
      owner_id: file.owner_id,
      visibility: file.visibility,
      chunk_index: index,
      start_line: chunk.startLine,
      end_line: chunk.endLine,
      content: chunk.content,
    });

    try {
      await upsertChunkVector(c.env, chunkId, embeddings[index], {
        chunkId,
        fileId: file.id,
        folderId: file.folder_id,
        folderName: file.folder_name,
        fileName: file.file_name,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        visibility: file.visibility,
        ownerId: file.owner_id,
      });
    } catch (error) {
      console.error('Vector upsert failed for chunk', chunkId, error);
      throw error;
    }

    if (index === 0) {
      console.log('First chunk upserted', {
        fileId: file.id,
        chunkId,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        visibility: file.visibility,
      });
    }

    insertedChunks += 1;
  }

  await updateFileStatus(c.env, file.id, 'ready');

  console.log('Ingest completed', {
    fileId: file.id,
    chunks: insertedChunks,
    visibility: file.visibility,
  });

  return c.json({ chunks: insertedChunks });
}
