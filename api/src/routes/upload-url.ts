import { HTTPException } from 'hono/http-exception';
import type { AppContext } from '../context';
import { uploadUrlInput } from '../schemas';
import {
  assertFolderVisibility,
  createFileRecord,
  ensureFolder,
  getFolder,
} from '../lib/db';

function sanitizeFileName(fileName: string): string {
  return fileName
    .replace(/\s+/g, '-')           // whitespace → dashes
    .replace(/[^a-zA-Z0-9.-]/g, '') // keep letters, digits, dot, hyphen
    .toLowerCase();
}

export async function handleUploadUrl(c: AppContext) {
  try {
    const env = c.env;
    const user = c.get('user');

    const body = await c.req.json().catch(() => ({} as any));
    const parsed = uploadUrlInput.safeParse(body);
    if (!parsed.success) {
      throw new HTTPException(400, { message: parsed.error.message });
    }

    const { folderId, folderName, visibility, fileName, size } = parsed.data;

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

    await createFileRecord(env, {
      id: fileId,
      folder_id: folderId,
      owner_id: user.id,
      visibility,
      file_name: fileName,
      r2_key: key,
      size,
      status: 'uploading',
    });

    // ---- Try presign (several variants). If all fail, return the exact reason. ----
    const contentType = 'text/plain';
    let urlStr: string | null = null;
    const reasons: string[] = [];

    // Variant A: expiration + httpMetadata.contentType
    try {
      // @ts-ignore runtime differences
      const res = await env.MARBLE_FILES.createPresignedUrl({
        method: 'PUT',
        key,
        expiration: 900,
        httpMetadata: { contentType },
      });
      const u = (res as any)?.url;
      if (u) urlStr = typeof u === 'string' ? u : u.toString();
    } catch (e: any) {
      const msg = e?.message || String(e);
      reasons.push(`A(expiration+httpMetadata): ${msg}`);
      console.error('Presign A failed:', msg);
    }

    // Variant B: expires + customHeaders["content-type"]
    if (!urlStr) {
      try {
        // @ts-ignore runtime differences
        const res = await env.MARBLE_FILES.createPresignedUrl({
          method: 'PUT',
          key,
          expires: 900,
          customHeaders: { 'content-type': contentType },
        });
        const u = (res as any)?.url;
        if (u) urlStr = typeof u === 'string' ? u : u.toString();
      } catch (e: any) {
        const msg = e?.message || String(e);
        reasons.push(`B(expires+customHeaders): ${msg}`);
        console.error('Presign B failed:', msg);
      }
    }

    // Variant C: minimal (no header constraints)
    if (!urlStr) {
      try {
        // @ts-ignore runtime differences
        const res = await env.MARBLE_FILES.createPresignedUrl({
          method: 'PUT',
          key,
          expiration: 900,
        });
        const u = (res as any)?.url;
        if (u) urlStr = typeof u === 'string' ? u : u.toString();
      } catch (e: any) {
        const msg = e?.message || String(e);
        reasons.push(`C(minimal): ${msg}`);
        console.error('Presign C failed:', msg);
      }
    }

    if (!urlStr) {
      // Return the detailed reasons so you can see the *real* R2 error in curl/UI
      return c.json({
        error: `Failed to create upload URL for key ${key}`,
        reasons,
      }, 500);
    }

    return c.json({
      fileId,
      uploadUrl: urlStr,
      key,
    });
  } catch (err) {
    const msg =
      err instanceof HTTPException
        ? err.message
        : (err as any)?.message || String(err);
    if (!(err instanceof HTTPException)) {
      console.error('upload-url error:', err);
    }
    if (err instanceof HTTPException) throw err;
    throw new HTTPException(500, { message: msg });
  }
}
