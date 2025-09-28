import type { AppContext } from '../context';
import { listFiles } from '../lib/db';
import { listFilesQuery } from '../schemas';

export async function handleListFiles(c: AppContext) {
  const user = c.get('user');
  const query = c.req.query();
  const parsed = listFilesQuery.safeParse(query);
  if (!parsed.success) {
    return c.json({ error: parsed.error.message }, 400);
  }

  const folderId = parsed.data.folder_id;
  const visibility = parsed.data.visibility;

  if (visibility === 'public') {
    const files = await listFiles(c.env, { folderId, visibility: 'public' });
    return c.json({ files });
  }

  if (visibility === 'private') {
    const files = await listFiles(c.env, { folderId, visibility: 'private', ownerId: user.id });
    return c.json({ files });
  }

  const [publicFiles, privateFiles] = await Promise.all([
    listFiles(c.env, { folderId, visibility: 'public' }),
    listFiles(c.env, { folderId, visibility: 'private', ownerId: user.id }),
  ]);

  const merged = [...publicFiles, ...privateFiles].sort((a, b) => (a.created_at > b.created_at ? -1 : 1));
  return c.json({ files: merged });
}
