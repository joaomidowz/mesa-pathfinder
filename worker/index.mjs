const ASSETS = __ASSETS__;
const OWNER_DEFAULTS = __OWNER_DEFAULTS__;
const BOOKS = [{ id: 'livro1', name: 'Livro do Jogador 1', pages: 469, pdfOffset: 1 }, { id: 'livro2', name: 'Livro do Jogador 2', pages: 322, pdfOffset: 2 }];
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } }); }
function fail(status, message) { const error = new Error(message); error.status = status; throw error; }
async function body(request) {
  if (!request.headers.get('content-type')?.includes('application/json')) fail(415, 'Envie JSON.');
  const text = await request.text();
  if (text.length > 1500000) fail(413, 'Dados grandes demais.');
  try { return JSON.parse(text); } catch { fail(400, 'JSON inválido.'); }
}
function validateData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data) || !data.profile || typeof data.profile.name !== 'string') fail(400, 'Ficha inválida: informe o nome do personagem.');
  const text = JSON.stringify(data);
  if (text.length > 900000) fail(413, 'Ficha grande demais.');
  for (const key of ['stats','skills','feats','inventory','notes','extra','abilities','fieldReferences']) {
    if (key in data && (!data[key] || typeof data[key] !== 'object' || Array.isArray(data[key]))) fail(400, 'Estrutura inválida: ' + key);
  }
  for (const key of ['attacks','references']) if (key in data && (!Array.isArray(data[key]) || data[key].some(value=>!value || typeof value !== 'object' || Array.isArray(value)))) fail(400, 'Lista inválida: '+key);
  if (data.abilities && Object.keys(data.abilities).some(key=> !/^[\w-]{1,100}$/.test(key))) fail(400, 'Identificador de habilidade inválido.');
  if (data.abilities && Object.values(data.abilities).some(value=>!value || typeof value !== 'object' || Array.isArray(value))) fail(400, 'Habilidade inválida.');
  const forbidden = object => object && typeof object === 'object' && Object.entries(object).some(([key, val]) => ['__proto__','prototype','constructor'].includes(key) || forbidden(val));
  if (forbidden(data)) fail(400, 'Campos inválidos.');
  return text;
}
async function actor(request, env) {
  const id = request.headers.get('oai-authenticated-user-id');
  const email = (request.headers.get('oai-authenticated-user-email') || '').trim().toLowerCase();
  if (!id || !email) fail(401, 'Entre na sua conta para acessar a mesa.');
  if (!env.DB) fail(503, 'Banco indisponível.');
  const admin = !!env.TABLE_OWNER_EMAIL && email === env.TABLE_OWNER_EMAIL.trim().toLowerCase();
  if (admin) {
    const now = new Date().toISOString();
    await env.DB.prepare("INSERT OR IGNORE INTO table_members (email, user_id, role, active, invited_by, created_at, updated_at) VALUES (?1, ?2, 'player', 1, ?1, ?3, ?3)").bind(email, id, now).run();
  }
  const member = await env.DB.prepare('SELECT * FROM table_members WHERE email = ?1').bind(email).first();
  if (!member || !member.active) fail(403, 'Seu e-mail não está convidado para esta mesa. Peça ao administrador para liberar o acesso.');
  if (member.user_id && member.user_id !== id) fail(403, 'O convite está associado a outra conta.');
  if (!member.user_id) await env.DB.prepare('UPDATE table_members SET user_id = ?1 WHERE email = ?2 AND user_id IS NULL').bind(id, email).run();
  return { id, email, role: member.role, admin };
}
async function migrateLegacy(user, env) {
  const legacy = await env.DB.prepare('SELECT data, updated_at FROM character_sheets WHERE user_id = ?1').bind(user.id).first();
  if (!legacy && !user.admin) return;
  const id = 'legacy-' + user.id;
  let data;
  try { data = legacy ? JSON.parse(legacy.data) : OWNER_DEFAULTS; } catch { return; }
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO characters (id, owner_id, owner_email, name, data, version, created_at, updated_at) SELECT ?1, ?2, ?3, ?4, ?5, 1, ?6, ?6 WHERE NOT EXISTS (SELECT 1 FROM legacy_migrations WHERE user_id = ?2)').bind(id, user.id, user.email, String(data.profile?.name || 'Meu personagem'), JSON.stringify(data), legacy?.updated_at || now),
    env.DB.prepare('INSERT OR IGNORE INTO legacy_migrations (user_id, migrated_at) VALUES (?1, ?2)').bind(user.id, now),
  ]);
}
async function findCharacter(id, user, env, write = false) {
  const record = await env.DB.prepare('SELECT * FROM characters WHERE id = ?1').bind(id).first();
  if (!record || (record.owner_id !== user.id && (user.role !== 'master' || write))) fail(404, 'Ficha não encontrada ou sem permissão.');
  return record;
}
// --- SRD: consulta às regras estruturadas extraídas dos livros (tabelas srd_*) ---
const SRD_TYPES = ['spell', 'focus', 'ritual', 'feat', 'class', 'ancestry', 'condition'];
const srdDeaccent = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const srdSqueeze = s => srdDeaccent(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const ftsQuery = q => String(q).split(/\s+/).filter(Boolean).map(term => '"' + term.replace(/["]/g, '') + '*"').join(' ');
function srdFilters(params) {
  const where = [], binds = [];
  const type = params.get('type');
  if (type) { if (!SRD_TYPES.includes(type)) fail(400, 'Tipo desconhecido.'); where.push('e.type = ?'); binds.push(type); }
  const level = params.get('level');
  if (level) { if (!/^\d{1,2}$/.test(level)) fail(400, 'Nível inválido.'); where.push('e.level = ?'); binds.push(Number(level)); }
  const category = params.get('category');
  if (category) { where.push('e.category_norm LIKE ?'); binds.push('%' + srdSqueeze(category) + '%'); }
  const trait = params.get('trait');
  if (trait) { where.push('e.traits_norm LIKE ?'); binds.push('%' + srdSqueeze(trait) + '%'); }
  const book = params.get('book');
  if (book) { where.push('e.book = ?'); binds.push(book); }
  return { where, binds };
}
async function srdSearch(url, env) {
  const params = url.searchParams;
  const q = (params.get('q') || '').trim().slice(0, 120);
  const limit = Math.min(Math.max(Number(params.get('limit')) || 25, 1), 100);
  const { where, binds } = srdFilters(params);
  const filterSql = where.length ? ' AND ' + where.join(' AND ') : '';
  const seen = new Set();
  const entries = [];
  const columns = 'e.id, e.type, e.name, e.level, e.category, e.traits, e.book, e.page';
  if (q) {
    const match = ftsQuery(q);
    const fts = await env.DB.prepare('SELECT ' + columns + ", snippet(srd_fts, 1, char(1), char(2), '…', 24) AS snippet FROM srd_fts JOIN srd_entries e ON e.rowid = srd_fts.rowid WHERE srd_fts MATCH ?" + filterSql + ' ORDER BY bm25(srd_fts), e.name LIMIT ?').bind(match, ...binds, limit).all();
    for (const row of fts.results) if (!seen.has(row.id)) { seen.add(row.id); entries.push(row); }
    if (entries.length < limit) {
      const like = '%' + srdSqueeze(q) + '%';
      const extra = await env.DB.prepare('SELECT ' + columns + ", substr(e.data, 1, 260) AS snippet FROM srd_entries e WHERE e.norm LIKE ?" + (where.length ? ' AND ' + where.join(' AND ') : '') + ' ORDER BY e.type, e.name LIMIT ?').bind(like, ...binds, limit - entries.length).all();
      for (const row of extra.results) if (!seen.has(row.id)) { seen.add(row.id); entries.push(row); }
    }
  } else {
    if (!where.length) return json({ entries: [], pages: [], hint: 'Informe um termo ou um filtro para navegar.' });
    const list = await env.DB.prepare('SELECT ' + columns + ", '' AS snippet FROM srd_entries e WHERE " + where.join(' AND ') + ' ORDER BY e.type, e.name LIMIT ?').bind(...binds, limit).all();
    for (const row of list.results) entries.push(row);
  }
  let pages = [];
  if (q && !params.get('type')) {
    const pageHits = await env.DB.prepare("SELECT p.book, p.page, p.chapter, snippet(srd_pages_fts, 0, char(1), char(2), '…', 24) AS snippet FROM srd_pages_fts JOIN srd_pages p ON p.rowid = srd_pages_fts.rowid WHERE srd_pages_fts MATCH ? LIMIT 8").bind(ftsQuery(q)).all();
    pages = pageHits.results;
    if (pages.length < 4) {
      const like = '%' + srdSqueeze(q) + '%';
      const extraPages = await env.DB.prepare("SELECT p.book, p.page, p.chapter, substr(p.text, 1, 260) AS snippet FROM srd_pages p WHERE p.norm LIKE ? LIMIT 8").bind(like).all();
      const have = new Set(pages.map(p => p.book + '/' + p.page));
      for (const row of extraPages.results) if (!have.has(row.book + '/' + row.page)) pages.push(row);
    }
  }
  return json({ entries, pages });
}
async function api(request, env, path) {
  const user = await actor(request, env);
  const method = request.method;
  if (path === '/api/session' && method === 'GET') { await migrateLegacy(user, env); return json({ user, books: BOOKS, invitationMode: 'private-site-sharing' }); }
  if (path === '/api/books' && method === 'GET') return json({ books: BOOKS });
  if (path === '/api/srd/stats' && method === 'GET') {
    const counts = await env.DB.prepare('SELECT type, COUNT(*) AS count FROM srd_entries GROUP BY type ORDER BY count DESC').all();
    const total = await env.DB.prepare('SELECT COUNT(*) AS count FROM srd_entries').first();
    return json({ types: counts.results, total: total.count });
  }
  if (path === '/api/search' && method === 'GET') return await srdSearch(new URL(request.url), env);
  const entryMatch = path.match(/^\/api\/entries\/([\w-]+)$/);
  if (entryMatch && method === 'GET') {
    const record = await env.DB.prepare('SELECT * FROM srd_entries WHERE id = ?1').bind(entryMatch[1]).first();
    if (!record) fail(404, 'Entrada não encontrada.');
    let data = {};
    try { data = JSON.parse(record.data); } catch {}
    return json({ id: record.id, type: record.type, name: record.name, level: record.level, category: record.category, traits: record.traits ? record.traits.split(',').map(t => t.trim()).filter(Boolean) : [], book: record.book, page: record.page, data });
  }
  const pageMatch = path.match(/^\/api\/books\/(livro[12])\/pages\/(\d+)$/);
  if (pageMatch && method === 'GET') {
    const book = BOOKS.find(item => item.id === pageMatch[1]);
    const page = Number(pageMatch[2]);
    if (page < 1 || page > book.pages) fail(404, 'Página fora do livro.');
    const object = await env.BUCKET?.get(book.id + '/pages/' + page + '.jpg');
    if (!object) fail(404, 'Página ainda não disponível.');
    return new Response(object.body, { headers: { 'content-type': 'image/jpeg', 'cache-control': 'private, max-age=3600', 'x-content-type-options': 'nosniff' } });
  }
  if (path === '/api/members') {
    if (!user.admin) fail(403, 'Apenas o administrador gerencia convites e papéis.');
    if (method === 'GET') {
      const result = await env.DB.prepare('SELECT email, role, active, created_at, updated_at, user_id IS NOT NULL AS accepted FROM table_members ORDER BY created_at').all();
      return json({ members: result.results });
    }
    if (method === 'POST') {
      const input = await body(request);
      const email = String(input.email || '').trim().toLowerCase();
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'Informe um e-mail válido.');
      if (!['player','master'].includes(input.role)) fail(400, 'Escolha jogador ou mestre.');
      const now = new Date().toISOString();
      await env.DB.prepare('INSERT INTO table_members (email, role, active, invited_by, created_at, updated_at) VALUES (?1, ?2, 1, ?3, ?4, ?4) ON CONFLICT(email) DO UPDATE SET role = excluded.role, active = 1, updated_at = excluded.updated_at').bind(email, input.role, user.email, now).run();
      return json({ ok: true, email, role: input.role, link: new URL('/mesa.html', request.url).href, platformAccessRequired: true });
    }
    if (method === 'DELETE') {
      const input = await body(request);
      const email = String(input.email || '').trim().toLowerCase();
      if (email === env.TABLE_OWNER_EMAIL?.toLowerCase()) fail(400, 'O administrador não pode remover o próprio acesso.');
      await env.DB.prepare('UPDATE table_members SET active = 0, updated_at = ?1 WHERE email = ?2').bind(new Date().toISOString(), email).run();
      return json({ ok: true });
    }
  }
  if (path === '/api/characters' && method === 'GET') {
    const columns = 'id, owner_id, owner_email, name, version, updated_at, data';
    const query = user.role === 'master' ? env.DB.prepare('SELECT ' + columns + ' FROM characters ORDER BY updated_at DESC') : env.DB.prepare('SELECT ' + columns + ' FROM characters WHERE owner_id = ?1 ORDER BY updated_at DESC').bind(user.id);
    const records = (await query.all()).results;
    return json({ characters: records.map(item => { let profile = {}; try { profile = JSON.parse(item.data).profile || {}; } catch {} return { id: item.id, name: item.name, ownerEmail: item.owner_email, owned: item.owner_id === user.id, level: profile.level || '1', className: profile.className || '', ancestry: profile.ancestry || '', version: item.version, updatedAt: item.updated_at }; }) });
  }
  if (path === '/api/characters' && method === 'POST') {
    const input = await body(request);
    const data = validateData(input.data);
    const count = await env.DB.prepare('SELECT COUNT(*) AS count FROM characters WHERE owner_id = ?1').bind(user.id).first();
    if (count.count >= 30) fail(400, 'Limite de 30 personagens por conta.');
    const id = crypto.randomUUID(), now = new Date().toISOString();
    await env.DB.prepare('INSERT INTO characters (id, owner_id, owner_email, name, data, version, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6, ?6)').bind(id, user.id, user.email, input.data.profile.name.slice(0, 160), data, now).run();
    return json({ id, version: 1, updatedAt: now }, 201);
  }
  const match = path.match(/^\/api\/characters\/([\w-]+)$/);
  if (match) {
    const record = await findCharacter(match[1], user, env, method !== 'GET');
    if (method === 'GET') return json({ id: record.id, data: JSON.parse(record.data), version: record.version, updatedAt: record.updated_at, readOnly: record.owner_id !== user.id });
    if (method === 'PUT') {
      const input = await body(request);
      const data = validateData(input.data);
      if (!Number.isInteger(input.version) || record.version !== input.version) fail(409, 'Esta ficha mudou em outra aba ou dispositivo. Baixe seu backup antes de recarregar.');
      const now = new Date().toISOString();
      const result = await env.DB.prepare('UPDATE characters SET name = ?1, data = ?2, version = version + 1, updated_at = ?3 WHERE id = ?4 AND owner_id = ?5 AND version = ?6').bind(input.data.profile.name.slice(0,160), data, now, record.id, user.id, input.version).run();
      if (!result.meta.changes) fail(409, 'Conflito de edição. Recarregue após baixar seu backup.');
      return json({ id: record.id, version: record.version + 1, updatedAt: now });
    }
  }
  if (path === '/api/character') fail(410, 'Atualize a página para usar a nova mesa.');
  fail(404, 'Rota não encontrada.');
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (!['GET','HEAD'].includes(request.method)) {
        const origin = request.headers.get('origin');
        if (origin && origin !== url.origin) fail(403, 'Origem não permitida.');
      }
      if (url.pathname.startsWith('/api/')) return await api(request, env, url.pathname);
      if (url.pathname === '/') return Response.redirect(new URL('/mesa.html',url).href,302);
      const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      const asset = ASSETS[file];
      if (asset == null) return new Response('Não encontrado', { status: 404 });
      const ext = file.split('.').at(-1);
      const mime = { html: 'text/html', js: 'text/javascript', css: 'text/css' }[ext] || 'text/plain';
      return new Response(request.method === 'HEAD' ? null : asset, { headers: { 'content-type': mime + '; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'same-origin' } });
    } catch (error) { if (!error.status) console.error('Mesa API error:', error.message); return json({ error: error.status ? error.message : 'Falha no servidor. Tente novamente sem limpar seus dados.' }, error.status || 500); }
  },
};
