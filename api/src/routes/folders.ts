import type { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv, AppContext } from '../context';
import { createFolder, listFolders, updateFolder, getFolderById, assertFolderAccess } from '../lib/db';
import { createFolderInput, listFoldersQuery, updateFolderInput } from '../schemas';

function serializeFolder(folder: Awaited<ReturnType<typeof listFolders>>[number]) {
  return {
    id: folder.id,
    name: folder.name,
    visibility: folder.visibility,
    fileCount: folder.file_count,
    owner: folder.owner_email
      ? {
          id: folder.owner_id,
          email: folder.owner_email,
          displayName: folder.owner_display_name,
        }
      : null,
    createdAt: folder.created_at,
    updatedAt: folder.updated_at,
  };
}

async function handleList(c: AppContext) {
  const user = c.get('user');
  const query = listFoldersQuery.safeParse(c.req.query());
  if (!query.success) {
    throw new HTTPException(400, { message: query.error.message });
  }

  const folders = await listFolders(c.env, {
    tenant: user.tenant,
    ownerId: user.id,
    visibility: query.data.visibility ?? 'all',
  });

  c.header('Cache-Control', 'private, no-store');
  return c.json({
    folders: folders.map(serializeFolder),
  });
}

async function handleCreate(c: AppContext) {
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const parsed = createFolderInput.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.message });
  }

  const id = crypto.randomUUID();
  await createFolder(c.env, {
    id,
    tenant: user.tenant,
    ownerId: user.id,
    name: parsed.data.name,
    visibility: parsed.data.visibility,
  });

  c.header('Cache-Control', 'private, no-store');
  return c.json(
    {
      folder: {
        id,
        name: parsed.data.name,
        visibility: parsed.data.visibility,
        fileCount: 0,
        owner: {
          id: user.id,
          email: user.email,
          displayName: user.displayName ?? null,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    },
    201,
  );
}

async function handleUpdate(c: AppContext) {
  const user = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const parsed = updateFolderInput.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.message });
  }

  const { next } = await updateFolder(c.env, {
    id,
    tenant: user.tenant,
    ownerId: user.id,
    name: parsed.data.name,
    visibility: parsed.data.visibility,
  });

  const [summary] = await listFolders(c.env, {
    tenant: user.tenant,
    ownerId: user.id,
    visibility: 'all',
  }).then((folders) => folders.filter((folder) => folder.id === id));

  c.header('Cache-Control', 'private, no-store');
  return c.json({
    folder: summary
      ? serializeFolder(summary)
      : {
          id: next.id,
          name: next.name,
          visibility: next.visibility,
          fileCount: 0,
          owner: {
            id: user.id,
            email: user.email,
            displayName: user.displayName ?? null,
          },
          createdAt: next.created_at,
          updatedAt: next.updated_at,
        },
  });
}

async function handleDetail(c: AppContext) {
  const user = c.get('user');
  const id = c.req.param('id');
  const folder = await getFolderById(c.env, id);
  assertFolderAccess(folder, user.id);

  c.header('Cache-Control', 'private, no-store');
  return c.json({
    folder: folder
      ? {
          id: folder.id,
          name: folder.name,
          visibility: folder.visibility,
          createdAt: folder.created_at,
          updatedAt: folder.updated_at,
          owner: folder.owner_email
            ? { id: folder.owner_id, email: folder.owner_email, displayName: folder.owner_display_name }
            : null,
        }
      : null,
  });
}

export function registerFolderRoutes(api: Hono<AppEnv>) {
  api.get('/folders', handleList);
  api.get('/folders/:id', handleDetail);
  api.post('/folders', handleCreate);
  api.patch('/folders/:id', handleUpdate);
}
