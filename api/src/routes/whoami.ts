import type { AppContext } from '../context';
import { ensureUser } from '../lib/db';

export async function handleWhoAmI(c: AppContext) {
  const user = c.get('user');
  await ensureUser(c.env, user);
  return c.json({ user });
}
