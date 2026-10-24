// Servidor da Mesa Pathfinder: roda o mesmo Worker do build (dist/server/index.js) com banco SQLite local e as
// páginas dos livros em disco. A plataforma (local/platform.mjs) faz o papel do ChatGPT Sites: login e arquivos.
//   npm run dev  → só 127.0.0.1, entra direto como administrador (uso pessoal);
//   npm run mesa → login por código de acesso, para a rede de casa ou a hospedagem (npm start).
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { openLocalDb } from './scripts/local-db.mjs';
import { createPlatform, readConfig } from './local/platform.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const MAX_BODY = 2 * 1024 * 1024; // a maior ficha aceita pelo Worker é bem menor que isto

// .env: só preenche o que o ambiente ainda não definiu (a variável de ambiente vence).
function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([\w.]+)\s*=\s*(.*?)\s*$/);
    if (match && !match[1].startsWith('#') && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}

function start() {
  loadEnv(path.join(root, '.env'));
  const config = readConfig(process.env, process.argv.slice(2), root);
  if (!fs.existsSync(path.join(root, 'dist/server/index.js'))) throw new Error('Worker não encontrado. Rode "npm run build" antes.');
  return config;
}

let config;
try { config = start(); } catch (error) { console.error(error.message); process.exit(1); }
const { default: worker } = await import('./dist/server/index.js');
const sqlite = openLocalDb(path.join(config.dataDir, 'local.db'));
let platform;
try { platform = createPlatform({ worker, sqlite, ...config }); } catch (error) { console.error(error.message); process.exit(1); }

const toHeaders = raw => {
  const headers = new Headers();
  for (const [name, value] of Object.entries(raw)) for (const item of [].concat(value)) headers.append(name, item);
  return headers;
};

// Adaptador node:http ⇄ fetch. A URL sai do Host e do protocolo que o navegador usou (x-forwarded-proto atrás do
// proxy da hospedagem): o Worker compara a origem da requisição com ela antes de aceitar qualquer gravação.
const server = http.createServer(async (req, res) => {
  try {
    if (!req.headers.host) { res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' }); res.end('Requisição sem Host.'); return; }
    const proto = req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    const url = new URL(req.url, `${proto}://${req.headers.host}`);
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_BODY) { res.writeHead(413, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify({ error: 'Dados grandes demais.' })); req.destroy(); return; }
      chunks.push(chunk);
    }
    const body = chunks.length && !['GET', 'HEAD'].includes(req.method) ? Buffer.concat(chunks) : undefined;
    const response = await platform.fetch(new Request(url, { method: req.method, headers: toHeaders(req.headers), body }));
    const headers = Object.fromEntries([...response.headers].filter(([name]) => name !== 'set-cookie'));
    const cookies = response.headers.getSetCookie();
    if (cookies.length) headers['set-cookie'] = cookies;
    res.writeHead(response.status, headers);
    if (response.body && req.method !== 'HEAD') Readable.fromWeb(response.body).pipe(res);
    else res.end();
  } catch (error) {
    console.error('Erro no servidor:', error.message);
    if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Falha no servidor local.' }));
  }
});

// Endereços para abrir a mesa: localhost e, ouvindo em todas as interfaces, os IPv4 da rede (sem pontes do Docker).
function addresses() {
  if (config.host !== '0.0.0.0') return [`http://${config.host}:${config.port}`];
  const lan = Object.entries(os.networkInterfaces()).filter(([name]) => !/^(docker|br-|veth|lo)/.test(name)).flatMap(([, list]) => list || []).filter(item => item.family === 'IPv4' && !item.internal).map(item => `http://${item.address}:${config.port}`);
  return [`http://localhost:${config.port}`, ...lan];
}

server.listen(config.port, config.host, () => {
  console.log(`Mesa Pathfinder — modo ${config.mode === 'mesa' ? 'mesa (com login)' : 'dev (só você, sem login)'}`);
  for (const address of addresses()) console.log(`  ${address}/mesa.html`);
  if (config.mode === 'mesa') console.log('Administrador: entre com o código de MESA_CODIGO_ADMIN e convide a mesa pela tela de Personagens.');
  else console.log(`Conectado como administrador: ${config.ownerEmail}`);
  if (!fs.existsSync(config.booksDir)) console.log('(páginas dos livros ausentes: rode "npm run render:pages" ou ajuste BOOKS_DIR)');
});

// Backup das fichas ao subir e a cada 24 h (modo mesa), guardando os 10 mais recentes em DATA_DIR/backups.
if (config.mode === 'mesa') {
  const backup = () => { try { platform.backup(path.join(config.dataDir, 'backups')); } catch (error) { console.error('Backup das fichas falhou:', error.message); } };
  backup();
  setInterval(backup, 24 * 3600 * 1000).unref();
}

// A hospedagem manda SIGTERM ao publicar uma versão nova: fecha o servidor e o banco antes de sair.
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => { server.close(); sqlite.close(); process.exit(0); });
