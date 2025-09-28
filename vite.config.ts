import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Vite config with smart API routing:
 * - If VITE_API_BASE is set to an absolute URL (e.g. https://project-marble.eebehuur13.workers.dev),
 *   we DO NOT proxy. All fetches should use `${import.meta.env.VITE_API_BASE}/api/...`.
 * - If VITE_API_BASE is empty, we assume you want to hit a local Worker on 127.0.0.1:8787
 *   and we proxy /api there (no rewrite).
 */
export default ({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiBase = env.VITE_API_BASE || '';

  const useRemoteApi = /^https?:\/\//i.test(apiBase);

  return defineConfig({
    plugins: [react()],
    server: useRemoteApi
      ? {} // remote API: no proxy; your code must call `${VITE_API_BASE}/api/...`
      : {
          // local API: run `npx -y wrangler@4 dev --port 8787`
          proxy: {
            '/api': {
              target: 'http://127.0.0.1:8787',
              changeOrigin: true,
              // IMPORTANT: do NOT rewrite; keep `/api` prefix for the Worker
            },
          },
        },
  });
};
