// Servidor local da Mesa Pathfinder: roda o mesmo Worker do build com ambiente simulado.
// Uso pessoal em localhost — livros e fichas nunca são expostos fora da máquina.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import worker from './dist/server/index.js';
import { openLocalDb, d1Adapter } from './scripts/local-db.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)));

function loadEnv() {
  const file = path.join(root, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([\w.]+)\s*=\s*(.*?)\s*$/);
    if (match && !match[1].startsWith('#') && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
  }
}
loadEnv();

const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT || 8787);
const OWNER_EMAIL = (process.env.TABLE_OWNER_EMAIL || 'mestre@local').trim().toLowerCase();
const OWNER_ID = 'local-owner';
const DB_FILE = path.join(root, 'data', 'local.db');
const RENDERED = path.join(root, 'books', 'rendered');
const DIST = path.join(root, 'dist');

if (!fs.existsSync(path.join(root, 'dist/server/index.js'))) {
  console.error('Worker não encontrado. Rode "npm run build" antes de "npm run dev".');
  process.exit(1);
}

fs.mkdirSync(path.join(root, 'data'), { recursive: true });
const sqlite = openLocalDb();
const adapter = d1Adapter(sqlite);

// Bucket R2 simulado: lê as imagens renderizadas de books/rendered.
const bucket = {
  async get(key) {
    const file = path.join(RENDERED, key);
    if (!file.startsWith(RENDERED + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return null;
    const buffer = fs.readFileSync(file);
    return { body: new Response(new Uint8Array(buffer)).body, size: buffer.length };
  },
};

const env = { DB: adapter, BUCKET: bucket, TABLE_OWNER_EMAIL: OWNER_EMAIL };

const MIME = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', svg: 'image/svg+xml', ico: 'image/x-icon', json: 'application/json; charset=utf-8' };

// Arquivos estáticos servidos direto do dist/ para refletir edições sem rebuild.
function serveStatic(pathname, res) {
  const relative = pathname === '/' ? 'mesa.html' : decodeURIComponent(pathname.slice(1));
  const file = path.join(DIST, relative);
  if (!file.startsWith(DIST + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Não encontrado');
    return;
  }
  const ext = file.split('.').at(-1).toLowerCase();
  res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${HOST}:${PORT}`);
    if (url.pathname.startsWith('/api/')) {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = chunks.length ? Buffer.concat(chunks) : undefined;
      const headers = { ...req.headers, 'oai-authenticated-user-id': OWNER_ID, 'oai-authenticated-user-email': OWNER_EMAIL };
      const request = new Request(url, { method: req.method, headers, body, duplex: 'half' });
      const response = await worker.fetch(request, env);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      if (response.body) Readable.fromWeb(response.body).pipe(res);
      else res.end();
      return;
    }
    if (url.pathname === '/') { res.writeHead(302, { location: '/mesa.html' }); res.end(); return; }
    serveStatic(url.pathname, res);
  } catch (error) {
    console.error('Erro local:', error);
    if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Falha no servidor local.' }));
  }
});

server.listen(PORT, HOST, () => {
  const pages = ['livro1', 'livro2'].some(id => fs.existsSync(path.join(RENDERED, id)))
    ? '' : '\n  (imagens dos livros ausentes: rode "npm run render:pages" para gerar)';
  console.log(`Mesa Pathfinder local: http://${HOST}:${PORT}/mesa.html`);
  console.log(`Conectado como administrador: ${OWNER_EMAIL}${pages}`);
});
