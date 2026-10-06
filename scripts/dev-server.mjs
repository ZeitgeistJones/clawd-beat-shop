import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {handleGenerateLyricsRequest} from '../server/generate-lyrics.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.PORT || 3000);
const types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.mjs': 'text/javascript'};

async function loadLocalEnv() {
  try {
    const text = await readFile(path.join(root, '.env.local'), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!match) continue;
      const key = match[1];
      if (process.env[key]) continue;
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  } catch {
    // Optional local credentials file.
  }
}

await loadLocalEnv();

http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname === '/api/generate-lyrics') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = Buffer.concat(chunks);
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (value == null) continue;
        if (Array.isArray(value)) value.forEach(item => headers.append(key, item));
        else headers.set(key, value);
      }
      const request = new Request(new URL(req.url, `http://127.0.0.1:${port}`), {
        method: req.method,
        headers,
        body: ['GET', 'HEAD'].includes(req.method || 'GET') ? undefined : body
      });
      const response = await handleGenerateLyricsRequest(request, {
        env: process.env,
        fetchImpl: globalThis.fetch.bind(globalThis)
      });
      res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
      res.end(Buffer.from(await response.arrayBuffer()));
      return;
    }

    const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const filename = path.resolve(root, relative);
    if (!filename.startsWith(root) || relative.split('/').some(x => x.startsWith('.')) || !types[path.extname(filename)]) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    // Keep browser code away from server-only modules and env files.
    if (relative === 'server' || relative.startsWith('server/') || relative === 'api' || relative.startsWith('api/')) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const body = await readFile(filename);
    res.writeHead(200, {
      'Content-Type': `${types[path.extname(filename)]}; charset=utf-8`,
      'Cache-Control': 'no-store'
    });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`Clawd Beat Lab: http://localhost:${port}`);
  console.log(process.env.GEMINI_API_KEY ? 'Generate Lyrics: GEMINI_API_KEY loaded for local API' : 'Generate Lyrics: set GEMINI_API_KEY in .env.local for local generation');
});
