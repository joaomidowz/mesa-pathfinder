const ASSETS = __ASSETS__;
const OWNER_DEFAULTS = __OWNER_DEFAULTS__;
// Cadastro dos livros (scripts/livros.mjs, embutido no build): { id, name, pages, pdfOffset, audience, legacy, aliases }.
const BOOKS = __BOOKS__;
// Livro do mestre só para quem tem o papel de mestre (o administrador entra como jogador); público desconhecido, ninguém.
// É a autorização de verdade: lista, páginas, busca, entradas e contagens passam por aqui.
const visibleBooks = user => BOOKS.filter(book => book.audience === 'todos' || (book.audience === 'mestre' && user.role === 'master'));
const placeholders = list => list.map(() => '?').join(', ');
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
  for (const key of ['stats','skills','feats','inventory','notes','extra','abilities','fieldReferences','spellcasting','defense']) {
    if (key in data && (!data[key] || typeof data[key] !== 'object' || Array.isArray(data[key]))) fail(400, 'Estrutura inválida: ' + key);
  }
  for (const key of ['attacks','references','spells','items','conditions','choices']) if (key in data && (!Array.isArray(data[key]) || data[key].some(value=>!value || typeof value !== 'object' || Array.isArray(value)))) fail(400, 'Lista inválida: '+key);
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
// Painel do grupo: só o que a mesa toda vê na hora do jogo (PV, defesas, condições), nunca anotações, inventário ou magias.
// O e-mail do dono vai só para o mestre.
const PARTY_PROFILE = ['name','player','level','className','ancestry'];
const PARTY_STATS = ['hpMax','hpCurrent','hpTemp','ac','perception','fort','reflex','will','classDc'];
function partySummary(record, user) {
  let data = {};
  try { data = JSON.parse(record.data) || {}; } catch {}
  const pick = (object, keys) => Object.fromEntries(keys.filter(key => object?.[key] != null && typeof object[key] !== 'object').map(key => [key, String(object[key])]));
  const conditions = Array.isArray(data.conditions) ? data.conditions.map(item => ({ name: String(item?.name ?? ''), value: String(item?.value ?? '') })) : [];
  const owned = record.owner_id === user.id;
  return { id: record.id, name: record.name, owned, version: record.version, updatedAt: record.updated_at, ...(user.role === 'master' && !owned ? { ownerEmail: record.owner_email } : {}), data: { profile: pick(data.profile, PARTY_PROFILE), stats: pick(data.stats, PARTY_STATS), spellcasting: pick(data.spellcasting, ['dc']), heroPoints: String(data.heroPoints ?? '0'), conditions } };
}
// --- SRD: consulta às regras estruturadas extraídas dos livros (tabelas srd_*) ---
// affliction: maldição ou doença (category diz qual).
const SRD_TYPES = ['spell', 'focus', 'ritual', 'feat', 'class', 'ancestry', 'condition', 'item', 'creature', 'hazard', 'affliction', 'vehicle'];
const srdDeaccent = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const srdSqueeze = s => srdDeaccent(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const ftsQuery = q => String(q).split(/\s+/).filter(Boolean).map(term => '"' + term.replace(/["]/g, '') + '*"').join(' ');
function srdFilters(params, user) {
  const where = [], binds = [];
  const type = params.get('type');
  if (type) { if (!SRD_TYPES.includes(type)) fail(400, 'Tipo desconhecido.'); where.push('e.type = ?'); binds.push(type); }
  // Criaturas e perigos começam no nível -1.
  const level = params.get('level');
  if (level) { if (!/^-?\d{1,2}$/.test(level)) fail(400, 'Nível inválido.'); where.push('e.level = ?'); binds.push(Number(level)); }
  // Vaga de talento: até o nível da vaga.
  const maxLevel = params.get('maxLevel');
  if (maxLevel) { if (!/^\d{1,2}$/.test(maxLevel)) fail(400, 'Nível máximo inválido.'); where.push('e.level <= ?'); binds.push(Number(maxLevel)); }
  // Até 3 categorias, com OU (a vaga de ancestralidade busca a ancestralidade e a herança versátil juntas).
  const categories = params.getAll('category').filter(Boolean).slice(0, 3);
  if (categories.length) { where.push('(' + categories.map(() => 'e.category_norm LIKE ?').join(' OR ') + ')'); binds.push(...categories.map(category => '%' + srdSqueeze(category) + '%')); }
  const trait = params.get('trait');
  if (trait) { where.push('e.traits_norm LIKE ?'); binds.push('%' + srdSqueeze(trait) + '%'); }
  // Livro por id ou sigla, sem diferenciar maiúsculas, só entre os visíveis: escondido e inexistente dão o mesmo 400.
  const wanted = (params.get('book') || '').trim().toLowerCase();
  const visible = visibleBooks(user);
  const chosen = wanted ? visible.filter(book => book.id === wanted || (book.aliases || []).some(alias => alias.toLowerCase() === wanted)) : visible;
  if (wanted && !chosen.length) fail(400, 'Livro desconhecido.');
  const filtered = where.length > 0 || !!wanted;
  const books = chosen.map(book => book.id);
  where.push('e.book IN (' + placeholders(books) + ')'); binds.push(...books);
  return { where, binds, books, filtered };
}
async function srdSearch(url, env, user) {
  const params = url.searchParams;
  const q = (params.get('q') || '').trim().slice(0, 120);
  const limit = Math.min(Math.max(Number(params.get('limit')) || 25, 1), 200);
  // `where` sempre traz os livros visíveis; `filtered` diz se a pessoa pediu algum filtro.
  const { where, binds, books, filtered } = srdFilters(params, user);
  const filterSql = ' AND ' + where.join(' AND ');
  const seen = new Set();
  const entries = [];
  const columns = 'e.id, e.type, e.name, e.level, e.category, e.traits, e.book, e.page';
  if (q) {
    const match = ftsQuery(q);
    const fts = await env.DB.prepare('SELECT ' + columns + ", snippet(srd_fts, 1, char(1), char(2), '…', 24) AS snippet FROM srd_fts JOIN srd_entries e ON e.rowid = srd_fts.rowid WHERE srd_fts MATCH ?" + filterSql + ' ORDER BY bm25(srd_fts), e.name LIMIT ?').bind(match, ...binds, limit).all();
    for (const row of fts.results) if (!seen.has(row.id)) { seen.add(row.id); entries.push(row); }
    if (entries.length < limit) {
      const like = '%' + srdSqueeze(q) + '%';
      const extra = await env.DB.prepare('SELECT ' + columns + ", substr(e.data, 1, 260) AS snippet FROM srd_entries e WHERE e.norm LIKE ?" + filterSql + ' ORDER BY e.type, e.name LIMIT ?').bind(like, ...binds, limit - entries.length).all();
      for (const row of extra.results) if (!seen.has(row.id)) { seen.add(row.id); entries.push(row); }
    }
  } else {
    if (!filtered) return json({ entries: [], pages: [], hint: 'Informe um termo ou um filtro para navegar.' });
    const list = await env.DB.prepare('SELECT ' + columns + ", '' AS snippet FROM srd_entries e WHERE " + where.join(' AND ') + ' ORDER BY e.type, e.name LIMIT ?').bind(...binds, limit).all();
    for (const row of list.results) entries.push(row);
  }
  let pages = [];
  if (q && !params.get('type')) {
    // Páginas também só dos livros visíveis (ou do livro pedido).
    const inBooks = ' AND p.book IN (' + placeholders(books) + ')';
    const pageHits = await env.DB.prepare("SELECT p.book, p.page, p.chapter, snippet(srd_pages_fts, 0, char(1), char(2), '…', 24) AS snippet FROM srd_pages_fts JOIN srd_pages p ON p.rowid = srd_pages_fts.rowid WHERE srd_pages_fts MATCH ?" + inBooks + ' LIMIT 8').bind(ftsQuery(q), ...books).all();
    pages = pageHits.results;
    // O reforço pelo texto espremido acha frases que o PDF colou ("Bolade Fogo"), mas uma palavra sozinha casa por cima
    // das palavras ("gerais e talentos" contém "seta"): por isso ele só entra em buscas de mais de uma palavra.
    if (pages.length < 4 && /\s/.test(q)) {
      const like = '%' + srdSqueeze(q) + '%';
      const extraPages = await env.DB.prepare("SELECT p.book, p.page, p.chapter, substr(p.text, 1, 260) AS snippet FROM srd_pages p WHERE p.norm LIKE ?" + inBooks + ' LIMIT 8').bind(like, ...books).all();
      const have = new Set(pages.map(p => p.book + '/' + p.page));
      for (const row of extraPages.results) if (!have.has(row.book + '/' + row.page)) pages.push(row);
    }
  }
  return json({ entries, pages });
}
async function api(request, env, path) {
  const user = await actor(request, env);
  const method = request.method;
  if (path === '/api/session' && method === 'GET') { await migrateLegacy(user, env); return json({ user, books: visibleBooks(user), invitationMode: env.INVITATION_MODE || 'private-site-sharing' }); }
  if (path === '/api/books' && method === 'GET') return json({ books: visibleBooks(user) });
  if (path === '/api/srd/stats' && method === 'GET') {
    const books = visibleBooks(user).map(book => book.id), inBooks = ' WHERE book IN (' + placeholders(books) + ')';
    const counts = await env.DB.prepare('SELECT type, COUNT(*) AS count FROM srd_entries' + inBooks + ' GROUP BY type ORDER BY count DESC').bind(...books).all();
    const total = await env.DB.prepare('SELECT COUNT(*) AS count FROM srd_entries' + inBooks).bind(...books).first();
    return json({ types: counts.results, total: total.count });
  }
  if (path === '/api/search' && method === 'GET') return await srdSearch(new URL(request.url), env, user);
  const entryMatch = path.match(/^\/api\/entries\/([\w-]+)$/);
  if (entryMatch && method === 'GET') {
    const record = await env.DB.prepare('SELECT * FROM srd_entries WHERE id = ?1').bind(entryMatch[1]).first();
    // Entrada de livro escondido responde como inexistente.
    if (!record || !visibleBooks(user).some(book => book.id === record.book)) fail(404, 'Entrada não encontrada.');
    let data = {};
    try { data = JSON.parse(record.data); } catch {}
    return json({ id: record.id, type: record.type, name: record.name, level: record.level, category: record.category, traits: record.traits ? record.traits.split(',').map(t => t.trim()).filter(Boolean) : [], book: record.book, page: record.page, data });
  }
  const pageMatch = path.match(/^\/api\/books\/([a-z0-9]+)\/pages\/(\d+)$/);
  if (pageMatch && method === 'GET') {
    const book = visibleBooks(user).find(item => item.id === pageMatch[1] && item.pageImages);
    const page = Number(pageMatch[2]);
    // Livro inexistente ou escondido dá a mesma 404 da página fora do livro: não revela que ele existe.
    if (!book || page < 1 || page > book.pages) fail(404, 'Página fora do livro.');
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
  // Grupo: fichas dos jogadores ativos para qualquer pessoa da mesa; as fichas do próprio mestre (criaturas, NPCs) só para ele.
  if (path === '/api/party' && method === 'GET') {
    const records = (await env.DB.prepare("SELECT id, owner_id, owner_email, name, version, updated_at, data FROM characters WHERE owner_id = ?1 OR owner_id IN (SELECT user_id FROM table_members WHERE role = 'player' AND active = 1 AND user_id IS NOT NULL) ORDER BY name").bind(user.id).all()).results;
    return json({ characters: records.map(record => partySummary(record, user)) });
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
    // O mestre guarda criaturas e NPCs como fichas próprias, por isso tem um limite maior.
    const limit = user.role === 'master' ? 300 : 30;
    if (count.count >= limit) fail(400, `Limite de ${limit} personagens por conta.`);
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
