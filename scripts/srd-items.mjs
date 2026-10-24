// Itens do catálogo SRD: itens mágicos e alquímicos do Livro 2 (capítulo "Pilha de tesouros") e as tabelas
// de armas, armaduras e escudos do Livro 1 (capítulo "Equipamento").
// Funções puras: recebem páginas já limpas pelo parse-srd ({ book, page, chapter, raw, layout }) e devolvem
// entradas do catálogo, sem ler arquivo nem banco.
const deaccent = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '');
const squeeze = s => deaccent(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const isUpper = s => /[A-ZÀ-Ü]/.test(s) && !/[a-zà-ü]/.test(s);
const ACTIONS = { 'one-action': '1 ação', 'two-actions': '2 ações', 'three-actions': '3 ações', reaction: 'reação', 'free-action': 'ação livre' };
const actionText = s => String(s).replace(/\[(one-action|two-actions|three-actions|reaction|free-action)\]\s*/g, (_, glyph) => `(${ACTIONS[glyph]}) `);

// ---------- Livro 2: itens com cabeçalho "NOME ITEM 6+" (às vezes "ITEM+6"; materiais: "MATERIAL 8+") ----------
export const ITEM_HEADER = /^(.+?)\s*(?:ITEM|MATERIAL)\s*(\+?)\s*(\d{1,2})\s*(\+?)\s*$/;
// Tipos de um item: "Tipo menor; Nível 1; Preço 3 po" (às vezes sem espaços, às vezes com mais campos depois do preço).
const VARIANT = /^Tipo\s*(.+?);\s*N[íi]vel\s*(\d+)\s*;\s*Pre[çc]o\s*(.+)$/;

// Títulos de seção do capítulo: encerram o item anterior e viram a categoria dos próximos.
const SECTIONS = {
  materiaispreciosos: 'material precioso', armadurasdemateriaispreciosos: 'material precioso', escudosdemateriaispreciosos: 'material precioso',
  armaduras: 'armadura mágica', escudos: 'escudo mágico', armasmagicas: 'arma mágica', itensalquimicos: 'item alquímico',
  bombasalquimicas: 'bomba alquímica', elixiresalquimicos: 'elixir', mutagenicos: 'mutagênico', venenosalquimicos: 'veneno',
  ferramentasalquimicas: 'ferramenta alquímica', arapucas: 'arapuca', municao: 'munição mágica', oleos: 'óleo', pocoes: 'poção',
  talismas: 'talismã', itenssegurados: 'item segurado', cajados: 'cajado', varinhas: 'varinha', itensequipados: 'item equipado',
};

// Texto útil de uma página, em ordem de leitura. A coluna lateral vem por último no modo raw: nas páginas ímpares,
// rótulo do capítulo + número ("Pilha de tesouros", "6 6") e a barra de navegação ("Introdução", "Ancestralidades"…);
// nas pares, o rodapé "Livro do jogador 2". Depois deles só sobram legendas de ilustração — corta tudo dali em diante.
export function pageLines(page) {
  const lines = page.raw.split('\n').map(text => text.trim());
  let end = lines.findIndex((text, i) => text === 'Introdução' && /^(Ancestralidades|Classe)$/.test(lines[i + 1] || ''));
  if (end < 0) end = lines.findIndex((text, i) => /^Livro do jogador( 2)?$/i.test(text) && i >= lines.length - 15);
  if (end < 0) end = lines.length;
  while (end > 0 && (/^\d+ \d+$/.test(lines[end - 1]) || lines[end - 1] === page.chapter)) end--;
  return lines.slice(0, end).filter(text => text && !/^\d{1,3}$/.test(text) && text !== page.chapter);
}

const isItemHeader = text => { const match = text.match(ITEM_HEADER); return Boolean(match && isUpper(match[1])); };
const sectionOf = text => (text.length <= 40 ? SECTIONS[squeeze(text)] || null : null);

// Linhas do capítulo em ordem de leitura, marcadas para duas correções de coluna:
// - `itemPage`: a página tem cabeçalho de item; páginas só de introdução ou tabela não continuam corpo de item;
// - `top`: linha do bloco antes do primeiro cabeçalho (e antes de título de seção) — às vezes é a cauda de um item
//   lida fora de ordem, e quem decide o dono é parseTreasureItems.
export function chapterLines(pages) {
  const out = [];
  for (const page of pages) {
    const lines = pageLines(page), first = lines.findIndex(isItemHeader);
    let stop = first < 0 ? 0 : lines.slice(0, first).findIndex(sectionOf);
    if (first >= 0 && stop < 0) stop = first;
    lines.forEach((text, i) => out.push({ page, text, itemPage: first >= 0, top: i < stop }));
  }
  return out;
}

// Linhas de tipo quebradas em duas ("…; Nível 12;" + "Preço 1.600 po…") voltam a ser uma só.
export function joinVariantLines(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i], next = lines[i + 1];
    if (/^Tipo\b/.test(line) && !VARIANT.test(line) && next && VARIANT.test(line + ' ' + next)) { out.push(line + ' ' + next); i++; continue; }
    out.push(line);
  }
  return out;
}

// Índice do layout sem espaços (o parse-srd já monta; aqui só garante para quem chama direto).
function ensureIndex(page) {
  if (page._sq) return;
  const chars = [], map = [];
  for (let i = 0; i < page.layout.length; i++) if (!/\s/.test(page.layout[i])) { chars.push(page.layout[i]); map.push(i); }
  page._sq = chars.join('');
  page._map = map;
}

// Palavras coladas pelo modo raw ("árvoreatingidaporumraio.") voltam com os espaços do modo layout, desde que o trecho
// apareça inteiro numa linha do layout (sem quebra de linha nem vão de coluna no meio).
export function respace(page, line) {
  ensureIndex(page);
  return line.replace(/\S{16,}/g, token => {
    const at = page._sq.indexOf(token);
    if (at < 0) return token;
    const slice = page.layout.slice(page._map[at], page._map[at + token.length - 1] + 1);
    return /\n| {2,}/.test(slice) ? token : slice;
  });
}

// Nome com espaços a partir do modo layout: "COTADOMARINHEIRO" → "COTA DO MARINHEIRO", confirmando o "ITEM" logo depois.
export function fixItemName(page, rawName) {
  ensureIndex(page);
  const target = rawName.replace(/\s+/g, '');
  for (let from = 0; ;) {
    const at = page._sq.indexOf(target, from);
    if (at < 0) return null;
    from = at + 1;
    const start = page._map[at], stop = page._map[at + target.length - 1];
    const before = page.layout[start - 1];
    if (before && !/[\s(«"'“–—-]/.test(before)) continue;
    if (!/^\s*(?:ITEM|MATERIAL)\s*\+?\s*\d/.test(page.layout.slice(stop + 1, stop + 60))) continue;
    return page.layout.slice(start, stop + 1).replace(/\s+/g, ' ').trim();
  }
}
// Sem a âncora "ITEM" (legenda de ilustração, por exemplo): a primeira ocorrência EM MAIÚSCULAS do nome no layout.
function fixItemNameLoose(page, rawName) {
  const target = rawName.replace(/\s+/g, ''), at = page._sq.indexOf(target);
  return at < 0 ? null : page.layout.slice(page._map[at], page._map[at + target.length - 1] + 1).replace(/\s+/g, ' ').trim();
}

// Categoria: o título de seção às vezes é lido depois dos itens; quando há traço que define o tipo, ele manda.
const TRAIT_CATEGORIES = [['CAJADO', 'cajado'], ['VARINHA', 'varinha'], ['BOMBA', 'bomba alquímica'], ['POÇÃO', 'poção'], ['ÓLEO', 'óleo'], ['TALISMÃ', 'talismã'], ['MUTAGÊNICO', 'mutagênico'], ['ELIXIR', 'elixir']];
export function itemCategory(item) {
  const byTrait = TRAIT_CATEGORIES.find(([trait]) => item.traits.includes(trait));
  if (byTrait) return byTrait[1];
  if (!TRAIT_CATEGORIES.some(([, label]) => label === item.category)) return item.category;
  if (item.traits.includes('CONSUMÍVEL')) return 'consumível';
  return /equipad/.test(item.usage) ? 'item equipado' : 'item segurado';
}

// Corpo de um item: traços em maiúsculas, Preço, Uso/Volume, Ativação, texto e tipos ("Tipo menor; Nível 1; Preço 3 po").
export function buildTreasureItem({ page, nameRaw, level, plus, section, body }) {
  const traits = [];
  let i = 0;
  while (i < body.length && isUpper(body[i]) && traits.length < 12) { traits.push(...body[i].split(/\s+/).filter(Boolean)); i++; }
  const fixed = fixItemName(page, nameRaw) || fixItemNameLoose(page, nameRaw);
  const item = { type: 'item', name: fixed || nameRaw, nameFixed: fixed != null, level, plus, traits, category: section || '', book: page.book, page: page.page, price: '', usage: '', bulk: '', activate: '', text: '', variants: [] };
  const text = [];
  let variant = null, match;
  // Linha toda em maiúsculas no meio do corpo é legenda de ilustração ou título de página, não regra.
  for (const line of joinVariantLines(body.slice(i).filter(line => !isUpper(line)))) {
    if ((match = line.match(VARIANT))) {
      // o que vier depois do preço ("; Requerimentos de manufatura…") é texto do tipo
      const [price, ...rest] = match[3].split(/;\s*/);
      variant = { name: match[1].trim(), level: Number(match[2]), price: price.replace(/\s*Volume\s*\S*$/, '').trim(), text: rest.join('; ').trim() };
      item.variants.push(variant);
      continue;
    }
    if (variant) { variant.text += (variant.text ? '\n' : '') + line; continue; }
    if (!item.price && (match = line.match(/^Pre[çc]o\s*(\S.*?)(?:;?\s*Volume\s*(\S.*))?$/))) { item.price = match[1].trim(); if (match[2] && !item.bulk) item.bulk = match[2].trim(); continue; }
    if (!item.usage && (match = line.match(/^Uso\s*(.+?)(?:;\s*[Vv]olume\s*(.+))?$/))) { item.usage = match[1].trim(); if (match[2]) item.bulk = match[2].trim(); continue; }
    if (!item.usage && (match = line.match(/^Muni[çc][ãa]o\s*(\S.*)$/))) { item.usage = 'munição (' + match[1].trim() + ')'; continue; }
    if (!item.bulk && (match = line.match(/^Volume\s*(\S.*)$/))) { item.bulk = match[1].trim(); continue; }
    if (!item.activate && (match = line.match(/^Ativa[çc][ãa]o\s*(.*)$/))) item.activate = actionText(match[1]).split(/;?\s*(?=Efeito\b|Gatilho\b|Acionamento|Requerimentos\b|Frequ[êe]ncia\b)/)[0].trim();
    text.push(line);
  }
  item.text = actionText(text.join('\n')).trim();
  for (const v of item.variants) v.text = actionText(v.text).trim();
  if (!item.price && item.variants.length) item.price = item.variants[0].price;
  item.category = itemCategory(item);
  return item;
}

export function parseTreasureItems(pages) {
  const records = [], topBlocks = new Map();
  let section = '', current = null;
  for (const { page, text, itemPage, top } of chapterLines(pages)) {
    if (isItemHeader(text)) {
      const header = text.match(ITEM_HEADER);
      current = { page, nameRaw: header[1].trim(), level: Number(header[3]), plus: Boolean(header[2] || header[4]), section, body: [] };
      records.push(current);
      continue;
    }
    const label = sectionOf(text);
    if (label) { current = null; section = label; continue; }
    if (!itemPage) { current = null; continue; }
    if (top) { if (!topBlocks.has(page)) topBlocks.set(page, { owner: current, lines: [] }); topBlocks.get(page).lines.push(respace(page, text)); continue; }
    if (current) current.body.push(respace(page, text));
  }
  // Bloco do topo de página: vai para o item cujo nome aparece nos tipos do bloco ("Tipo mantodoamoque…");
  // sem nome reconhecido, é a continuação do item anterior no fluxo.
  const byLength = [...records].sort((a, b) => b.nameRaw.length - a.nameRaw.length);
  for (const block of topBlocks.values()) {
    const names = block.lines.map(text => text.match(VARIANT)).filter(Boolean).map(match => squeeze(match[1]));
    const owner = byLength.find(record => names.some(name => name.startsWith(squeeze(record.nameRaw)))) || block.owner;
    owner?.body.push(...block.lines);
  }
  return records.map(buildTreasureItem);
}

// ---------- Livro 1: tabelas de armas, armaduras e escudos (modo layout) ----------
const MONEY = String.raw`(?:[\d.]+ (?:po|pp|pc)|0|—|Varia)`;
const BULK = String.raw`(?:L|—|\d+)`;
const DAMAGE_TYPES = { Pf: 'perfurante', Ct: 'cortante', Cn: 'contundente' };
const RANGED_ROW = new RegExp(String.raw`^(.+?)\s{2,}(${MONEY})\s+(\d+d\d+|Varia|—)(?:\s+(Pf|Ct|Cn))?\s+([\d,]+ m\.)\s+(\d|—)\s+(${BULK})\s+(1\+|1|2)\s+([A-ZÀ-Ü][a-zà-ü]+)\s+(.+)$`);
const MELEE_ROW = new RegExp(String.raw`^(.+?)\s{2,}(${MONEY})\s+(\d+d\d+|Varia|—)(?:\s+(Pf|Ct|Cn))?\s+(${BULK})\s+(1\+|1|2|—)\s+([A-ZÀ-Ü][a-zà-ü]+)\s+(.+)$`);
const ARMOR_ROW = new RegExp(String.raw`^(.+?)\s{2,}(${MONEY})\s+([+–-]\d+)\s+([+–-]?\d+|—)\s+([–-]\d+|—)\s+([–-][\d,]+ m\.|—)\s+([+–-]?\d+|—)\s+(${BULK})\s+([A-ZÀ-Ü][a-zà-ü]+)\s+(.+)$`);
const SHIELD_ROW = new RegExp(String.raw`^(.+?)\s{2,}(${MONEY})\s+(\+\d+(?:\/\+\d+)?)\s+([–-][\d,]+ m\.|—)\s+(${BULK})\s+(\d+)\s+(\d+ \(\d+\))$`);
const AMMO_ROW = new RegExp(String.raw`^(\d+ [a-zà-ü ]+?)\s{2,}(${MONEY})\s+(${BULK})$`);
const WEAPON_TABLE = /^Armas?((?:\s+[a-zà-ü]+)+?)\s+Pre[çc]o\b/;
const ARMOR_TABLE = /^(Leves|Médias|Pesadas|Sem armadura)\s+Pre[çc]o\b/;
const SIDEBAR_COLUMN = 136; // a barra lateral das páginas ímpares começa depois desta coluna (as pares não têm)

const splitTraits = text => (text.trim() === '—' ? [] : text.split(/,\s*/).map(trait => trait.trim().replace(/\*$/, '')).filter(Boolean).map(trait => trait.charAt(0).toUpperCase() + trait.slice(1)));
const levelFromName = name => { const match = name.match(/\s*\(n[íi]vel (\d+)\)$/); return match ? [name.slice(0, match.index).trim(), Number(match[1])] : [name.trim(), 0]; };
const handsText = hands => (hands === '1+' ? '1+ (uma para disparar, outra para recarregar)' : hands === '—' ? '' : hands);

// Uma linha de tabela (já sem a coluna lateral) vira entrada do catálogo; linha genérica de preço "Varia" é ignorada.
export function parseEquipmentRow(text, context) {
  const row = matchEquipmentRow(text.replace(/(\(n[íi]vel \d+\))\s+/, '$1  '), context);
  return row && row.price !== 'Varia' ? row : null;
}

function matchEquipmentRow(text, context) {
  let match;
  if (context.kind === 'weapon' && (match = text.match(RANGED_ROW))) {
    const [, rawName, price, damage, type, range, reload, bulk, hands, group, traits] = match;
    const [name, level] = levelFromName(rawName);
    return { type: 'item', name, level, category: context.category + ' à distância', traits: [...context.traits, ...splitTraits(traits)], price, damage, damageType: DAMAGE_TYPES[type] || '', range: range.replace(/\.$/, ''), reload, bulk, hands: handsText(hands), group };
  }
  if (context.kind === 'weapon' && (match = text.match(MELEE_ROW))) {
    const [, rawName, price, damage, type, bulk, hands, group, traits] = match;
    const [name, level] = levelFromName(rawName);
    return { type: 'item', name, level, category: context.category, traits: [...context.traits, ...splitTraits(traits)], price, damage, damageType: DAMAGE_TYPES[type] || '', bulk, hands: handsText(hands), group };
  }
  if (context.kind === 'weapon' && (match = text.match(AMMO_ROW))) {
    const [, name, price, bulk] = match;
    return { type: 'item', name: name.trim(), level: 0, category: 'munição', traits: [], price, bulk };
  }
  if (context.kind === 'armor' && (match = text.match(ARMOR_ROW))) {
    const [, rawName, price, acBonus, dexCap, checkPenalty, speedPenalty, strength, bulk, group, traits] = match;
    const [name, level] = levelFromName(rawName);
    return { type: 'item', name, level, category: context.category, traits: splitTraits(traits), price, acBonus, dexCap, checkPenalty, speedPenalty: speedPenalty.replace(/\.$/, ''), strength, bulk, group };
  }
  if (context.kind === 'shield' && (match = text.match(SHIELD_ROW))) {
    const [, rawName, price, acBonus, speedPenalty, bulk, hardness, hitPoints] = match;
    const [name, level] = levelFromName(rawName);
    // "+2/+42": o último 2 é a nota de rodapé colada ao bônus.
    return { type: 'item', name, level, category: 'escudo', traits: [], price, acBonus: acBonus.replace(/^(\+\d)\/(\+\d)\d$/, '$1/$2'), speedPenalty: speedPenalty.replace(/\.$/, ''), bulk, hardness, hitPoints };
  }
  return null;
}

// Cabeçalho de tabela muda o contexto: tipo de linha esperado, categoria e traços implícitos ("incomuns").
export function tableContext(line) {
  const text = line.trim();
  let match;
  if ((match = text.match(WEAPON_TABLE))) {
    const words = match[1].trim().split(/\s+/);
    const kind = words.find(word => /^(simples|marciais|avançadas)$/.test(word));
    const category = 'arma ' + ({ simples: 'simples', marciais: 'marcial', avançadas: 'avançada' }[kind] || 'comum');
    return { kind: 'weapon', category, traits: words.includes('incomuns') ? ['Incomum'] : words.includes('raras') ? ['Raro'] : [] };
  }
  if ((match = text.match(ARMOR_TABLE))) return { kind: 'armor', category: 'armadura ' + { Leves: 'leve', Médias: 'média', Pesadas: 'pesada', 'Sem armadura': 'sem armadura' }[match[1]], traits: [] };
  if (/^Escudo\s+Pre[çc]o\b/.test(text)) return { kind: 'shield', category: 'escudo', traits: [] };
  return null;
}

export function parseEquipmentTables(pages) {
  const entries = [];
  for (const page of pages) {
    const limit = page.page % 2 ? SIDEBAR_COLUMN : Infinity;
    let context = null, last = null;
    for (const raw of page.layout.split('\n')) {
      const line = raw.slice(0, limit).trim();
      const next = tableContext(line);
      if (next) { context = next; last = null; continue; }
      if (!context || !line) continue;
      const row = parseEquipmentRow(line, context);
      if (row) { last = { ...row, book: page.book, page: page.page, text: '' }; entries.push(last); continue; }
      // nome que continua na linha de baixo: "Martelo com" + "gancho gnômico"
      if (last && /^[a-zà-ü][a-zà-ü ]{2,30}$/.test(line)) last.name += ' ' + line;
      last = null;
    }
  }
  const seen = new Set();
  return entries.filter(entry => { const key = squeeze(entry.name) + '|' + entry.category; if (seen.has(key)) return false; seen.add(key); return true; });
}
