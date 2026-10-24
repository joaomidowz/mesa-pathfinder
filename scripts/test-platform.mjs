// Plataforma local (local/platform.mjs): login por código ou só por e-mail, sessão em cookie, identidade repassada ao Worker,
// arquivos estáticos e backup. Tudo em processo, com banco em memória: nenhuma porta é aberta.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import worker from '../dist/server/index.js';
import { openLocalDb } from './local-db.mjs';
import { createPlatform, readConfig, newCode, normalizeCode } from '../local/platform.mjs';

let checks = 0;
const ok = (condition, message) => { assert.ok(condition, message); checks++; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks++; };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mesa-teste-'));
const booksDir = path.join(tmp, 'books');
fs.mkdirSync(path.join(booksDir, 'livro1', 'pages'), { recursive: true });
fs.writeFileSync(path.join(booksDir, 'livro1', 'pages', '1.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
const distDir = path.resolve('dist');
const ADMIN = 'admin@mesa.example', ADMIN_CODE = 'abcd-efgh-jkmn';
let clock = new Date('2026-10-24T12:00:00Z');
const sqlite = openLocalDb(':memory:');
const make = (options = {}) => createPlatform({ worker, sqlite, mode: 'mesa', ownerEmail: ADMIN, adminCode: ADMIN_CODE, distDir, booksDir, now: () => clock, ...options });
let platform = make();

const ORIGIN = 'http://192.168.0.33:8787';
async function call(route, { method = 'GET', body, cookie, headers = {}, origin = ORIGIN, base = ORIGIN } = {}) {
  const init = { method, headers: { ...headers } };
  if (cookie) init.headers.cookie = cookie;
  if (body !== undefined) { init.body = JSON.stringify(body); init.headers['content-type'] = 'application/json'; }
  if (method !== 'GET' && origin) init.headers.origin = origin;
  const response = await platform.fetch(new Request(base + route, init));
  const type = response.headers.get('content-type') || '';
  return { status: response.status, headers: response.headers, json: type.includes('json') ? await response.json() : null };
}
const cookieOf = response => (response.headers.getSetCookie()[0] || '').split(';')[0];
const login = async code => { const response = await call('/auth/login', { method: 'POST', body: { code } }); return { ...response, cookie: cookieOf(response) }; };

// Configuração: dev só em loopback, mesa exige código, padrões de host.
assert.throws(() => readConfig({ HOST: '0.0.0.0' }, [], tmp), /127\.0\.0\.1/); checks++;
assert.throws(() => readConfig({}, ['--mesa'], tmp), /MESA_CODIGO_ADMIN/); checks++;
assert.throws(() => readConfig({ PORT: 'abc', MESA_CODIGO_ADMIN: ADMIN_CODE }, ['--mesa'], tmp), /PORT/); checks++;
eq(readConfig({ MESA_CODIGO_ADMIN: ADMIN_CODE }, ['--mesa'], tmp).host, '0.0.0.0');
eq(readConfig({}, [], tmp).host, '127.0.0.1');
eq(readConfig({ MESA_CODIGO_ADMIN: ADMIN_CODE }, ['--mesa'], tmp).loginMode, 'codigo');
eq(readConfig({ MESA_CODIGO_ADMIN: ADMIN_CODE, MESA_LOGIN: ' Email ' }, ['--mesa'], tmp).loginMode, 'email');
assert.throws(() => readConfig({ MESA_CODIGO_ADMIN: ADMIN_CODE, MESA_LOGIN: 'senha' }, ['--mesa'], tmp), /MESA_LOGIN/); checks++;
ok(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(newCode()), 'formato do código');
eq(normalizeCode(' abcd-efgh jkmn '), 'ABCDEFGHJKMN');

// Sem sessão, nada passa — nem com cabeçalho de identidade forjado.
eq((await call('/api/session')).status, 401);
eq((await call('/api/session', { headers: { 'oai-authenticated-user-id': 'local-owner', 'oai-authenticated-user-email': ADMIN } })).status, 401);
eq((await call('/api/books/livro1/pages/1')).status, 401);

// Login do administrador: aceita minúsculas e sem hífen; cookie HttpOnly e SameSite, sem Secure em http.
eq((await login('ABCD-EFGH-ZZZZ')).status, 401);
const admin = await login('abcdefghjkmn');
eq(admin.status, 200);
const adminCookieHeader = admin.headers.getSetCookie()[0];
ok(/HttpOnly/.test(adminCookieHeader) && /SameSite=Lax/.test(adminCookieHeader) && !/Secure/.test(adminCookieHeader), 'atributos do cookie em http');
const session = await call('/api/session', { cookie: admin.cookie });
eq(session.status, 200);
eq(session.json.user.admin, true);
eq(session.json.user.id, 'local-owner');
eq(session.json.invitationMode, 'access-code');
// Cabeçalho forjado junto com a sessão: vale a sessão, não o cabeçalho.
eq((await call('/api/session', { cookie: admin.cookie, headers: { 'oai-authenticated-user-email': 'outro@mesa.example' } })).json.user.email, ADMIN);
// Atrás do proxy https da hospedagem, o cookie ganha Secure.
ok(/Secure/.test((await call('/auth/login', { method: 'POST', body: { code: ADMIN_CODE }, base: 'https://mesa.example', origin: 'https://mesa.example' })).headers.getSetCookie()[0]), 'cookie Secure em https');

// Convite: administrador cadastra e gera o link; o jogador entra com ele e só vê as próprias fichas.
eq((await call('/api/members', { method: 'POST', cookie: admin.cookie, body: { email: 'alice@mesa.example', role: 'player' } })).status, 200);
eq((await call('/auth/code', { method: 'POST', cookie: admin.cookie, body: { email: 'ninguem@mesa.example' } })).status, 404);
eq((await call('/auth/code', { method: 'POST', cookie: admin.cookie, body: { email: ADMIN } })).status, 400);
const invite = await call('/auth/code', { method: 'POST', cookie: admin.cookie, body: { email: 'Alice@Mesa.example' } });
eq(invite.status, 200);
eq(invite.json.link, `${ORIGIN}/entrar.html#${invite.json.code}`);
const alice = await login(invite.json.code);
eq(alice.status, 200);
const aliceSession = await call('/api/session', { cookie: alice.cookie });
eq(aliceSession.json.user.role, 'player');
eq(aliceSession.json.user.admin, false);
eq((await call('/auth/code', { method: 'POST', cookie: alice.cookie, body: { email: 'alice@mesa.example' } })).status, 403);
// Salvar a partir de outro aparelho da rede: a origem é a do Host usado, e a gravação passa.
const created = await call('/api/characters', { method: 'POST', cookie: alice.cookie, body: { data: { profile: { name: 'Alice' } } } });
eq(created.status, 201);
eq((await call('/api/characters', { cookie: alice.cookie })).json.characters.length, 1);
eq((await call('/api/characters/legacy-local-owner', { cookie: alice.cookie })).status, 404);
// Origem de outro site é recusada no login e nas gravações.
eq((await call('/auth/login', { method: 'POST', body: { code: invite.json.code }, origin: 'https://evil.example' })).status, 403);
eq((await call('/api/characters', { method: 'POST', cookie: alice.cookie, body: { data: { profile: { name: 'x' } } }, origin: 'https://evil.example' })).status, 403);

// Código novo derruba o aparelho antigo; o novo entra.
const second = await call('/auth/code', { method: 'POST', cookie: admin.cookie, body: { email: 'alice@mesa.example' } });
eq((await call('/api/session', { cookie: alice.cookie })).status, 401);
eq((await login(invite.json.code)).status, 401);
const alice2 = await login(second.json.code);
eq((await call('/api/session', { cookie: alice2.cookie })).json.user.id, aliceSession.json.user.id);
// Sair encerra a sessão.
const out = await call('/auth/logout', { method: 'POST', cookie: alice2.cookie });
ok(/Max-Age=0/.test(out.headers.getSetCookie()[0]), 'cookie apagado');
eq((await call('/api/session', { cookie: alice2.cookie })).status, 401);
// Sessão vencida (30 dias) cai.
const alice3 = await login(second.json.code);
clock = new Date(clock.getTime() + 31 * 86400000);
eq((await call('/api/session', { cookie: alice3.cookie })).status, 401);
// Acesso revogado na tela de Convites impede novo login.
const admin2 = await login(ADMIN_CODE);
eq((await call('/api/members', { method: 'DELETE', cookie: admin2.cookie, body: { email: 'alice@mesa.example' } })).status, 200);
eq((await login(second.json.code)).status, 403);
// Trocar MESA_CODIGO_ADMIN derruba as sessões antigas do administrador.
platform = make({ adminCode: 'NOVO-CODI-GO23' });
eq((await call('/api/session', { cookie: admin2.cookie })).status, 401);
eq((await login(ADMIN_CODE)).status, 401);
const admin3 = await login('NOVO-CODI-GO23');
eq(admin3.status, 200);
eq((await call('/api/books/livro1/pages/1', { cookie: admin3.cookie })).headers.get('content-type'), 'image/jpeg');

// Entrada só com o e-mail (MESA_LOGIN=email): cadastrado e ativo entra sem código; o administrador segue com o código.
const loginEmail = async email => { const response = await call('/auth/login', { method: 'POST', body: { email } }); return { ...response, cookie: cookieOf(response) }; };
eq((await loginEmail('alice@mesa.example')).status, 400); // modo código: e-mail não entra
platform = make({ adminCode: 'NOVO-CODI-GO23', loginMode: 'email' });
eq((await call('/api/session', { cookie: admin3.cookie })).json.invitationMode, 'email');
eq((await call('/api/members', { method: 'POST', cookie: admin3.cookie, body: { email: 'bia@mesa.example', role: 'master' } })).status, 200);
const bia = await loginEmail(' Bia@Mesa.example ');
eq(bia.status, 200);
const biaSession = await call('/api/session', { cookie: bia.cookie });
eq(biaSession.json.user.email, 'bia@mesa.example');
eq(biaSession.json.user.role, 'master');
// O id fica gravado já no primeiro login: o segundo aparelho cai na mesma conta.
eq((await call('/api/session', { cookie: (await loginEmail('bia@mesa.example')).cookie })).json.user.id, biaSession.json.user.id);
eq((await loginEmail('ninguem@mesa.example')).status, 401);
eq((await loginEmail(ADMIN)).status, 401);
eq((await loginEmail('alice@mesa.example')).status, 403); // revogada
eq((await login('NOVO-CODI-GO23')).status, 200);
// Ficha já ligada ao e-mail (membro com o id do dono da ficha): o jogador entra e acha a ficha dele.
const at = clock.toISOString();
sqlite.prepare("INSERT INTO table_members (email, user_id, role, active, invited_by, created_at, updated_at) VALUES ('zuque@mesa.example', 'u-zuque', 'player', 1, ?, ?, ?)").run(ADMIN, at, at);
sqlite.prepare("INSERT INTO characters (id, owner_id, owner_email, name, data, version, created_at, updated_at) VALUES ('mesa-zuque', 'u-zuque', 'zuque@mesa.example', 'Zuque', ?, 1, ?, ?)").run(JSON.stringify({ profile: { name: 'Zuque' } }), at, at);
const zuque = await loginEmail('zuque@mesa.example');
eq((await call('/api/characters', { cookie: zuque.cookie })).json.characters.map(item => item.id).join(), 'mesa-zuque');

// Entrada, redirecionamentos e arquivos.
let response = await call('/signin-with-chatgpt?return_to=' + encodeURIComponent('/sessao.html?character=x'));
eq(response.status, 302);
eq(response.headers.get('location'), '/entrar.html?return_to=' + encodeURIComponent('/sessao.html?character=x'));
eq((await call('/signin-with-chatgpt?return_to=' + encodeURIComponent('//evil.example'))).headers.get('location'), '/entrar.html?return_to=%2Fmesa.html');
eq((await call('/')).headers.get('location'), '/mesa.html');
response = await call('/mesa.html');
eq(response.status, 200);
ok(response.headers.get('content-type').startsWith('text/html'), 'html servido');
eq((await call('/entrar.html')).status, 200);
for (const route of ['/server/index.js', '/.openai/hosting.json', '/..%2Fpackage.json', '/%2e%2e/package.json', '/regras.txt']) eq((await call(route)).status, 404, route);

// Modo dev: identidade fixa do administrador, sem rotas de login.
const dev = createPlatform({ worker, sqlite, mode: 'dev', ownerEmail: ADMIN, distDir, booksDir, now: () => clock });
const devSession = await dev.fetch(new Request(ORIGIN + '/api/session'));
eq((await devSession.json()).user.id, 'local-owner');
eq((await dev.fetch(new Request(ORIGIN + '/auth/login', { method: 'POST', body: '{}' }))).status, 404);

// Backup: fichas e membros, sem acessos nem sessões, guardando só os 10 mais recentes.
const backups = path.join(tmp, 'backups');
for (let i = 0; i < 12; i++) { clock = new Date(clock.getTime() + 1000); platform.backup(backups); }
const files = fs.readdirSync(backups);
eq(files.length, 10);
const saved = JSON.parse(fs.readFileSync(path.join(backups, files.sort().at(-1)), 'utf8'));
ok(Array.isArray(saved.characters) && saved.characters.some(row => row.name === 'Alice'), 'fichas no backup');
ok(Array.isArray(saved.table_members) && !('local_access' in saved) && !('local_sessions' in saved), 'sem acessos nem sessões');
ok(!JSON.stringify(saved).includes('code_hash') && !JSON.stringify(saved).includes('token_hash'), 'nenhum hash no backup');

fs.rmSync(tmp, { recursive: true, force: true });
console.log('PASS', checks, 'checks: configuração, login por código, login por e-mail, cookie, identidade forjada, convite, origem, troca de código, sessão vencida, revogação, arquivos, modo dev, backup.');
