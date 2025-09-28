import type { AppContext } from '../context';

export function handleSession(c: AppContext) {
  const user = c.get('user');
  c.header('Cache-Control', 'private, no-store');
  return c.json({
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName ?? null,
      avatarUrl: user.avatarUrl ?? null,
      tenant: user.tenant,
      authMethod: user.authMethod,
    },
    tenant: user.tenant,
    mode: user.authMethod,
  });
}
