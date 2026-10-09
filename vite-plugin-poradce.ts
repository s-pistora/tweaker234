/*
 * Lokální proxy AI poradce: `vite` (dev) i `vite preview` obslouží `/api/poradce`
 * a přepošle dotaz na Groq. API klíč čte z `.env.local` (GROQ_API_KEY) – nikdy se
 * nedostane do prohlížeče ani do buildu. Na GitHub Pages proxy není → poradce se skryje.
 *
 * GET  /api/poradce → 200 { ok, model } | 503 (chybí klíč)
 * POST /api/poradce → { messages, tools, tool_choice } → odpověď Groq (chat/completions)
 */
import { loadEnv, type Plugin, type PreviewServer, type ViteDevServer } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const VYCHOZI_MODEL = 'openai/gpt-oss-120b';
const MAX_BODY = 512 * 1024;

function posli(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function nactiBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('příliš velký dotaz'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function pripoj(server: ViteDevServer | PreviewServer) {
  const env = loadEnv(server.config.mode, server.config.envDir || process.cwd(), '');
  const key = env.GROQ_API_KEY || process.env.GROQ_API_KEY || '';
  const model = env.GROQ_MODEL || process.env.GROQ_MODEL || VYCHOZI_MODEL;

  server.middlewares.use('/api/poradce', async (req, res) => {
    if (!key) return posli(res, 503, { error: 'Chybí GROQ_API_KEY v .env.local' });
    if (req.method === 'GET') return posli(res, 200, { ok: true, model });
    if (req.method !== 'POST') return posli(res, 405, { error: 'Jen GET nebo POST' });
    let vstup: { messages?: unknown; tools?: unknown; tool_choice?: unknown };
    try {
      vstup = JSON.parse(await nactiBody(req));
    } catch {
      return posli(res, 400, { error: 'Neplatný dotaz' });
    }
    if (!Array.isArray(vstup.messages)) return posli(res, 400, { error: 'Chybí messages' });
    try {
      const r = await fetch(GROQ_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        // model, teplotu a limit určuje server, ne prohlížeč
        body: JSON.stringify({
          model,
          messages: vstup.messages,
          tools: vstup.tools,
          tool_choice: vstup.tool_choice ?? 'auto',
          temperature: 0.3,
          max_completion_tokens: 1500,
          // gpt-oss „přemýšlí“ a i to se počítá do limitu tokenů za minutu
          ...(model.startsWith('openai/gpt-oss') ? { reasoning_effort: 'low' } : {}),
        }),
      });
      const text = await r.text();
      if (!r.ok) server.config.logger.warn(`[poradce] Groq ${r.status}: ${text.slice(0, 300)}`);
      res.statusCode = r.status;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      const retry = r.headers.get('retry-after');
      if (retry) res.setHeader('Retry-After', retry);
      res.end(text);
    } catch (e) {
      server.config.logger.error(`[poradce] ${String(e)}`);
      posli(res, 502, { error: 'Groq je nedostupný' });
    }
  });
}

export function poradceProxy(): Plugin {
  return {
    name: 'poradce-proxy',
    configureServer: pripoj,
    configurePreviewServer: pripoj,
  };
}
