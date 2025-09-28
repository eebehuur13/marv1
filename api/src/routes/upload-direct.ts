import type { AppContext } from '../context';
import { HTTPException } from 'hono/http-exception';
import {
  assertFolderVisibility,
  createFileRecord,
  ensureFolder,
  getFolder,
} from '../lib/db';

function sanitizeFileName(fileName: string): string {
  return fileName
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9.-]/g, '')
    .toLowerCase();
}

// Accepts raw text body. Query params: folderId, folderName, visibility, fileName, size
export async function handleUploadDirect(c: AppContext) {
  const env = c.env;
  const user = c.get('user');

  const url = new URL(c.req.url);
  const folderId = url.searchParams.get('folderId') || '';
  const folderName = url.searchParams.get('folderName') || '';
  const visibility = (url.searchParams.get('visibility') || '') as 'public' | 'private';
  const fileName = url.searchParams.get('fileName') || '';
  const sizeParam = url.searchParams.get('size');

  if (!folderId || !folderName || !visibility || !fileName) {
    throw new HTTPException(400, { message: 'Missing required query params' });
  }
  if (visibility !== 'public' && visibility !== 'private') {
    throw new HTTPException(400, { message: "visibility must be 'public' or 'private'" });
  }
  if (!fileName.toLowerCase().endsWith('.txt')) {
    throw new HTTPException(400, { message: 'Only .txt files are supported' });
  }

  let folder = await getFolder(env, folderId);
  if (!folder) {
    await ensureFolder(
      env,
      folderId,
      folderName,
      visibility,
      visibility === 'public' ? null : user.id
    );
    folder = await getFolder(env, folderId);
  }
  if (!folder) {
    throw new HTTPException(500, { message: 'Unable to resolve folder' });
  }

  assertFolderVisibility(folder, user.id);

  const fileId = crypto.randomUUID();
  const safeName = sanitizeFileName(fileName);
  const basePath = visibility === 'public' ? 'public' : `users/${user.id}`;
  const key = `${basePath}/${folderId}/${fileId}-${safeName}`;

  const text = await c.req.text(); // raw text body
  const contentType = 'text/plain';

  // Write directly to R2
  try {
    await env.MARBLE_FILES.put(key, text, {
      httpMetadata: { contentType },
    });
  } catch (e: any) {
    console.error('R2 put error:', e?.message || e);
    throw new HTTPException(500, { message: 'Failed to upload to R2' });
  }

  // Create DB record (ready)
  await createFileRecord(env, {
    id: fileId,
    folder_id: folderId,
    owner_id: user.id,
    visibility,
    file_name: fileName,
    r2_key: key,
    size: text.length, // or parseInt(sizeParam||'0')
    status: 'ready',
  });

  return c.json({ fileId, key, uploaded: true });
}
