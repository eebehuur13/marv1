import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { AppEnv } from './context';
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

// 🔒 Authentication middleware
api.use('*', async (c, next) => {
  try {
    // If Access secrets are set → enforce Cloudflare Access
    if (c.env.ACCESS_AUD && c.env.ACCESS_TEAM_DOMAIN) {
      const user = await authenticateRequest(c.req.raw, c.env);
      c.set('user', user);
      await ensureUser(c.env, user);
    } else {
      // 🚨 fallback dev user (no Access configured)
      const devUser = { id: 'dev-user', email: 'dev@local', name: 'Dev User' };
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
