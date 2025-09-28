import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { AppEnv } from './context';
import type { AuthenticatedUser } from './types';
import { authenticateRequest } from './lib/access';
import { ensureUser } from './lib/db';
import { handleWhoAmI } from './routes/whoami';
import { handleUploadUrl } from './routes/upload-url';
import { handleUploadDirect } from './routes/upload-direct';
import { handleIngest } from './routes/ingest';
import { handleListFiles } from './routes/files';
import { handleDeleteFile } from './routes/delete-file';
import { handleChat } from './routes/chat';
import { handleDebugEmbed } from './routes/debug-embed';
import {
  handleDebugQuery,
  handleDebugFile,
  handleDebugProbeFile,
  handleDebugStats,
} from './routes/debug';
import { handleSession } from './routes/session';




const app = new Hono<AppEnv>();

// health check
app.get('/healthz', (c) => c.json({ ok: true }));

// 🔑 Add CORS middleware for all API routes
app.use(
  '/api/*',
  cors({
    origin: (origin, c) => c.env.ALLOWED_ORIGIN ?? 'http://localhost:5173',
    allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    maxAge: 86400,
  })
);

// --- API routes ---
const api = app.basePath('/api');

const DEV_IDENTITY_HEADER = 'x-marble-dev-user';

function decodeBase64(raw: string): string {
  const normalized = raw.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  if (typeof atob === 'function') {
    return atob(padded);
  }
  const BufferCtor = (globalThis as unknown as { Buffer?: { from(data: string, encoding: string): { toString(enc: string): string } } }).Buffer;
  if (BufferCtor) {
    return BufferCtor.from(padded, 'base64').toString('utf-8');
  }
  throw new Error('No base64 decoder available');
}

function parseDevIdentity(raw: string | null): AuthenticatedUser | null {
  if (!raw) return null;
  try {
    const decoded = decodeBase64(raw);
    const parsed = JSON.parse(decoded) as Partial<AuthenticatedUser> & { id?: unknown; email?: unknown };
    if (typeof parsed.id !== 'string' || typeof parsed.email !== 'string') {
      return null;
    }
    return {
      id: parsed.id,
      email: parsed.email,
      displayName: typeof parsed.displayName === 'string' ? parsed.displayName : null,
      avatarUrl: typeof parsed.avatarUrl === 'string' ? parsed.avatarUrl : null,
      tenant: typeof parsed.tenant === 'string'
        ? parsed.tenant
        : parsed.email.includes('@')
          ? parsed.email.split('@')[1]
          : 'dev',
      authMethod: 'dev',
    } satisfies AuthenticatedUser;
  } catch (error) {
    console.warn('Failed to parse dev identity header', error);
    return null;
  }
}

// 🔒 Authentication middleware
api.use('*', async (c, next) => {
  try {
    // If Access secrets are set → enforce Cloudflare Access
    const accessConfigured = Boolean(
      c.env.CF_ACCESS_AUD && c.env.CF_ACCESS_TEAM_DOMAIN && c.env.SKIP_ACCESS_CHECK !== 'true',
    );

    if (accessConfigured) {
      const user = await authenticateRequest(c.req.raw, c.env);
      c.set('user', user);
      await ensureUser(c.env, user);
    } else {
      // 🚨 fallback dev user (no Access configured). Try custom header first so each browser can be unique.
      const header = c.req.header(DEV_IDENTITY_HEADER);
      const devUser = parseDevIdentity(header);
      if (!devUser) {
        return c.json({ error: 'Missing identity. Sign in to continue.' }, 401);
      }
      c.set('user', devUser);
      await ensureUser(c.env, devUser);
    }
    await next();
  } catch (err) {
    console.error('Auth error:', err);
    return c.json({ error: 'Unauthorized' }, 401);
  }
});

// Routes
api.get('/session', handleSession);
api.get('/whoami', handleWhoAmI);
api.post('/upload-url', handleUploadUrl);
api.post('/upload-direct', handleUploadDirect);
api.post('/ingest', handleIngest);
api.get('/files', handleListFiles);
api.delete('/files/:id', handleDeleteFile);
api.post('/chat', handleChat);
api.get('/debug/embed', handleDebugEmbed);
api.get('/debug/query', handleDebugQuery);
api.get('/debug/file', handleDebugFile);
api.get('/debug/probe-file', handleDebugProbeFile);
api.get('/debug/stats', handleDebugStats);

// Log any unhandled errors and return a JSON message instead of plain 500
app.onError((err, c) => {
  console.error('UNHANDLED ERROR:', err instanceof Error ? err.stack || err.message : String(err));
  const msg = err instanceof Error ? err.message : String(err);
  return c.json({ error: msg }, 500);
});


export default app;
