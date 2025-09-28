// api/src/routes/debug-embed.ts
import type { AppContext } from '../context';
import { HTTPException } from 'hono/http-exception';
import { createEmbeddings } from '../lib/openai';

/**
 * GET /api/debug/embed?q=some+text
 * Returns the embedding dims + a tiny preview so we can confirm OpenAI is working.
 */
export async function handleDebugEmbed(c: AppContext) {
  const url = new URL(c.req.url);
  const q = (url.searchParams.get('q') || '').trim();
  if (!q) throw new HTTPException(400, { message: 'Missing q' });

  const vectors = await createEmbeddings(c.env, [q]); // number[][]
  const v = vectors[0] || [];

  return c.json({
    q,
    dims: Array.isArray(v) ? v.length : -1,
    preview: Array.isArray(v) ? v.slice(0, 8) : null,
  });
}
