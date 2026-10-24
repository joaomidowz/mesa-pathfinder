// Plataforma local da Mesa: faz para o Worker o papel que o ChatGPT Sites fazia — serve as páginas, autentica quem
// entra e repassa a identidade nos cabeçalhos oai-authenticated-*, que o Worker já sabe ler. As regras de quem vê o
// quê continuam todas no Worker; aqui só se decide QUEM é a pessoa.
//   modo "dev":  identidade fixa do administrador, sem login (só em 127.0.0.1);
//   modo "mesa": login por código de acesso, sessão em cookie. Com MESA_LOGIN=email, jogadores e mestre entram só com
//                o e-mail cadastrado na mesa; o administrador continua com o código de MESA_CODIGO_ADMIN.
// Estilo fetch (Request → Response) para os testes chamarem direto, sem abrir porta.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { d1Adapter } from '../scripts/local-db.mjs';

export const OWNER_ID = 'local-owner'; // as fichas que o administrador já tinha são deste id
const IDENTITY_HEADERS = ['oai-authenticated-user-id', 'oai-authenticated-user-email'];
const COOKIE = 'mesa_sessao';
const SESSION_DAYS = 30;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem I, O, 0 e 1, que se confundem
const MIME = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8' };
const LOOPBACK = ['127.0.0.1', 'localhost', '::1'];

export const normalizeCode = code => String(code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
// 12 símbolos de um alfabeto de 32 = 60 bits: adivinhar um código é inviável, por isso não há limite de tentativas.
export function newCode() {
  let code = '';
  for (let i = 0; i < 12; i++) code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return code.match(/.{4}/g).join('-');
}

// Configuração vinda do ambiente (.env ou variáveis da hospedagem) e dos argumentos de server.mjs.
export function readConfig(env, argv, root) {
  const mode = argv.includes('--mesa') ? 'mesa' : 'dev';
  const host = env.HOST || (mode === 'mesa' ? '0.0.0.0' : '127.0.0.1');
  if (mode === 'dev' && !LOOPBACK.includes(host)) throw new Error('O modo dev entra como administrador sem login e só roda em 127.0.0.1. Para a rede ou a hospedagem, use "npm run mesa".');
  const port = Number(env.PORT || 8787);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT inválida: use um número de 1 a 65535.');
  const adminCode = env.MESA_CODIGO_ADMIN || '';
  const loginMode = String(env.MESA_LOGIN || 'codigo').trim().toLowerCase();
  if (!['codigo', 'email'].includes(loginMode)) throw new Error('MESA_LOGIN inválido: use "codigo" (cada pessoa com o seu código) ou "email" (jogadores e mestre entram só com o e-mail).');
  if (mode === 'mesa' && normalizeCode(adminCode).length < 12) throw new Error('Defina MESA_CODIGO_ADMIN (no .env ou nas variáveis da hospedagem) com pelo menos 12 letras ou números. Gere um com: npm run codigo');
  return {
    mode, host, port, adminCode, loginMode,
    ownerEmail: String(env.TABLE_OWNER_EMAIL || 'mestre@local').trim().toLowerCase(),
    dataDir: path.resolve(root, env.DATA_DIR || 'data'),
    booksDir: path.resolve(root, env.BOOKS_DIR || 'books/rendered'),
    distDir: path.join(root, 'dist'),
  };
}

function json(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...headers } });
}
const fail = (status, error) => json({ error }, status);
const redirect = location => new Response(null, { status: 302, headers: { location, 'cache-control': 'no-store' } });
const notFound = () => new Response('Não encontrado', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
// Volta só para caminhos do próprio site ("/sessao.html?character=x"), nunca para outro endereço.
const safeReturn = value => (typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\') ? value : '/mesa.html');

function readCookie(request, name) {
  for (const part of (request.headers.get('cookie') || '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return '';
}

export function createPlatform({ worker, sqlite, mode, ownerEmail, adminCode = '', loginMode = 'codigo', distDir, booksDir, now = () => new Date() }) {
  const owner = String(ownerEmail || '').trim().toLowerCase();
  const bucket = {
    async get(key) {
      const file = path.join(booksDir, key);
      if (!file.startsWith(booksDir + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return null;
      const buffer = fs.readFileSync(file);
      return { body: new Response(new Uint8Array(buffer)).body, size: buffer.length };
    },
  };
  const env = { DB: d1Adapter(sqlite), BUCKET: bucket, TABLE_OWNER_EMAIL: owner, ...(mode === 'mesa' ? { INVITATION_MODE: loginMode === 'email' ? 'email' : 'access-code' } : {}) };
  const sessionCookie = (value, url, maxAge) => `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${url.protocol === 'https:' ? '; Secure' : ''}`;

  function saveAccess(email, userId, code) {
    sqlite.prepare('INSERT INTO local_access (email, user_id, code_hash, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(email) DO UPDATE SET code_hash = excluded.code_hash, created_at = excluded.created_at').run(email, userId, sha256(normalizeCode(code)), now().toISOString());
    sqlite.prepare('DELETE FROM local_sessions WHERE email = ?').run(email);
  }

  // Código do administrador: vem do ambiente. Se mudou, as sessões antigas dele caem.
  if (mode === 'mesa') {
    if (normalizeCode(adminCode).length < 12) throw new Error('MESA_CODIGO_ADMIN precisa de pelo menos 12 letras ou números.');
    const current = sqlite.prepare('SELECT code_hash FROM local_access WHERE email = ?').get(owner);
    if (current?.code_hash !== sha256(normalizeCode(adminCode))) {
      sqlite.prepare('DELETE FROM local_access WHERE user_id = ? AND email <> ?').run(OWNER_ID, owner); // administrador trocou de e-mail
      saveAccess(owner, OWNER_ID, adminCode);
    }
  }

  function currentSession(request) {
    const token = readCookie(request, COOKIE);
    if (!token) return null;
    const session = sqlite.prepare('SELECT email, user_id, expires_at FROM local_sessions WHERE token_hash = ?').get(sha256(token));
    return session && session.expires_at > now().toISOString() ? session : null;
  }

  // Cabeçalhos de identidade que vierem do navegador são SEMPRE descartados; só a plataforma os escreve.
  async function withIdentity(request) {
    const headers = new Headers(request.headers);
    for (const name of IDENTITY_HEADERS) headers.delete(name);
    const identity = mode === 'dev' ? { user_id: OWNER_ID, email: owner } : currentSession(request);
    if (identity) { headers.set(IDENTITY_HEADERS[0], identity.user_id); headers.set(IDENTITY_HEADERS[1], identity.email); }
    const init = { method: request.method, headers };
    if (!['GET', 'HEAD'].includes(request.method)) init.body = await request.arrayBuffer();
    return new Request(request.url, init);
  }

  async function readJson(request) {
    const text = await request.text();
    if (text.length > 4096) return {};
    try { const value = JSON.parse(text); return value && typeof value === 'object' ? value : {}; } catch { return {}; }
  }

  function startSession(email, userId, url) {
    const at = now(), token = crypto.randomBytes(32).toString('base64url');
    sqlite.prepare('DELETE FROM local_sessions WHERE expires_at <= ?').run(at.toISOString());
    sqlite.prepare('INSERT INTO local_sessions (token_hash, email, user_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)').run(sha256(token), email, userId, at.toISOString(), new Date(at.getTime() + SESSION_DAYS * 86400000).toISOString());
    return json({ ok: true }, 200, { 'set-cookie': sessionCookie(token, url, SESSION_DAYS * 86400) });
  }

  function login(input, url) {
    if (input.email !== undefined) return loginMode === 'email' ? loginByEmail(input, url) : fail(400, 'Esta mesa entra com código de acesso. Peça o seu ao administrador.');
    const code = normalizeCode(input.code);
    const access = code.length >= 12 ? sqlite.prepare('SELECT email, user_id FROM local_access WHERE code_hash = ?').get(sha256(code)) : null;
    if (!access) return fail(401, 'Código inválido. Confira com o administrador da mesa.');
    if (access.email !== owner && !sqlite.prepare('SELECT active FROM table_members WHERE email = ?').get(access.email)?.active) return fail(403, 'Seu acesso à mesa foi revogado. Fale com o administrador.');
    return startSession(access.email, access.user_id, url);
  }

  // MESA_LOGIN=email: quem está cadastrado e ativo entra só com o e-mail. Quem souber o e-mail entra como a pessoa, então
  // é para mesa de amigos. O administrador segue com o código, porque é ele quem convida, troca papéis e revoga.
  function loginByEmail(input, url) {
    const email = String(input.email ?? '').trim().toLowerCase();
    if (email === owner) return fail(401, 'O administrador entra com o código de acesso.');
    const member = email.length <= 254 ? sqlite.prepare('SELECT user_id, active FROM table_members WHERE email = ?').get(email) : null;
    if (!member) return fail(401, 'E-mail não cadastrado na mesa. Confira com o administrador.');
    if (!member.active) return fail(403, 'Seu acesso à mesa foi revogado. Fale com o administrador.');
    // O id da conta fica gravado já no primeiro login: todos os aparelhos da pessoa caem na mesma conta.
    let userId = member.user_id;
    if (!userId) {
      userId = sqlite.prepare('SELECT user_id FROM local_access WHERE email = ?').get(email)?.user_id || 'u-' + crypto.randomUUID();
      sqlite.prepare('UPDATE table_members SET user_id = ? WHERE email = ? AND user_id IS NULL').run(userId, email);
    }
    return startSession(email, userId, url);
  }

  function logout(request, url) {
    const token = readCookie(request, COOKIE);
    if (token) sqlite.prepare('DELETE FROM local_sessions WHERE token_hash = ?').run(sha256(token));
    return json({ ok: true }, 200, { 'set-cookie': sessionCookie('', url, 0) });
  }

  // Link de acesso de um membro: código novo, que derruba os aparelhos conectados com o código antigo.
  function issueCode(request, input, url) {
    const session = currentSession(request);
    if (!session || session.email !== owner) return fail(403, 'Apenas o administrador gera links de acesso.');
    const email = String(input.email || '').trim().toLowerCase();
    if (email === owner) return fail(400, 'O código do administrador vem da variável MESA_CODIGO_ADMIN.');
    const member = sqlite.prepare('SELECT user_id, active FROM table_members WHERE email = ?').get(email);
    if (!member?.active) return fail(404, 'Cadastre a pessoa na mesa antes de gerar o link.');
    const userId = sqlite.prepare('SELECT user_id FROM local_access WHERE email = ?').get(email)?.user_id || member.user_id || 'u-' + crypto.randomUUID();
    const code = newCode();
    sqlite.exec('BEGIN');
    try { saveAccess(email, userId, code); sqlite.exec('COMMIT'); } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    return json({ email, code, link: `${url.origin}/entrar.html#${code}` });
  }

  async function auth(request, url) {
    if (mode !== 'mesa') return fail(404, 'Rota não encontrada.');
    if (request.method !== 'POST') return fail(405, 'Use POST.');
    const origin = request.headers.get('origin');
    if (origin && origin !== url.origin) return fail(403, 'Origem não permitida.');
    const input = await readJson(request);
    if (url.pathname === '/auth/login') return login(input, url);
    if (url.pathname === '/auth/logout') return logout(request, url);
    if (url.pathname === '/auth/code') return issueCode(request, input, url);
    return fail(404, 'Rota não encontrada.');
  }

  // Só arquivos de primeiro nível de dist/ com extensão de página: o Worker montado (dist/server) e metadados ficam de fora.
  function serveStatic(pathname, method) {
    let name;
    try { name = decodeURIComponent(pathname.slice(1)); } catch { return notFound(); }
    const ext = name.split('.').at(-1);
    if (!/^[\w.-]+$/.test(name) || !MIME[ext]) return notFound();
    const file = path.join(distDir, name);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return notFound();
    return new Response(method === 'HEAD' ? null : fs.readFileSync(file), { headers: { 'content-type': MIME[ext], 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'same-origin' } });
  }

  async function fetch(request) {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith('/auth/')) return await auth(request, url);
      if (url.pathname === '/signin-with-chatgpt') return redirect('/entrar.html?return_to=' + encodeURIComponent(safeReturn(url.searchParams.get('return_to'))));
      if (url.pathname.startsWith('/api/')) return await worker.fetch(await withIdentity(request), env);
      if (url.pathname === '/') return redirect('/mesa.html');
      return serveStatic(url.pathname, request.method);
    } catch (error) {
      console.error('Erro na plataforma local:', error.message);
      return fail(500, 'Falha no servidor local.');
    }
  }

  // Backup das fichas (sem acessos nem sessões): o banco local é o único lugar das fichas de todo mundo.
  function backup(dir, keep = 10) {
    fs.mkdirSync(dir, { recursive: true });
    const at = now();
    const tables = ['characters', 'table_members', 'legacy_migrations', 'character_sheets'];
    const content = { exportedAt: at.toISOString(), ...Object.fromEntries(tables.map(table => [table, sqlite.prepare(`SELECT * FROM ${table}`).all()])) };
    const file = path.join(dir, `fichas-${at.toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(file, JSON.stringify(content));
    for (const old of fs.readdirSync(dir).filter(name => /^fichas-.+\.json$/.test(name)).sort().slice(0, -keep)) fs.unlinkSync(path.join(dir, old));
    return file;
  }

  return { fetch, backup };
}
