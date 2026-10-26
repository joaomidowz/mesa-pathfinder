// Constrói os catálogos estruturados (magias, talentos, classes, ancestralidades, condições, itens, criaturas, perigos,
// maldições, doenças e veículos) a partir do texto extraído (DATA_DIR/pages.json; padrão data/) dos livros do cadastro
// (scripts/livros.mjs) e carrega tudo em DATA_DIR/local.db (tabelas srd_*).
//
// Estratégia:
// - cabeçalhos de entrada detectados no modo RAW (linhas próprias, formato regular);
// - nomes com espaços corretos recuperados do modo LAYOUT da mesma página (índice despaçado);
// - corpo do texto lido no RAW entre um cabeçalho e o próximo (ordem de leitura correta);
// - vocabulário de traços colhido dos próprios dados + categorias conhecidas.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openLocalDb } from './local-db.mjs';
import { LIVROS } from './livros.mjs';
import { parseEquipmentTables, parseTreasureItems, buildTreasureItem } from './srd-items.mjs';
import { adaptarRemaster } from './remaster.mjs';
import { NEW_ANCHOR, STAT_TYPES, parseBookHeader, furnitureOf, dropFurniture, respaceLine, normalizeStatLine, splitBody, tidySpell } from './srd-books.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.resolve(root, process.env.DATA_DIR || 'data');
const pages = JSON.parse(fs.readFileSync(path.join(dataDir, 'pages.json'), 'utf8'));
const byBook = Object.fromEntries(LIVROS.map(book => [book.id, pages.filter(p => p.book === book.id)]));
// Os dois Livros do Jogador seguem pelo caminho original, intocado: os ids das entradas não mudam (as fichas guardam ids).
// Os demais livros passam pelo caminho dos livros novos, mais abaixo.
const ORIGINAL_BOOKS = ['livro1', 'livro2'];
const NEW_BOOKS = LIVROS.map(book => book.id).filter(id => !ORIGINAL_BOOKS.includes(id) && byBook[id].length);

// ---------- utilidades ----------
const deaccent = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const squeeze = s => deaccent(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const isUpperLine = line => /[A-ZÀ-Ü]/.test(line) && !/[a-zà-ü]/.test(line.replace(/\[[^\]]*\]/g, ''));
// Remove acentos mantendo o comprimento: índices de match valem para a string original.
const ACCENTS = { á:'a',à:'a',â:'a',ã:'a',ä:'a',é:'e',è:'e',ê:'e',ë:'e',í:'i',ì:'i',î:'i',ï:'i',ó:'o',ò:'o',ô:'o',õ:'o',ö:'o',ú:'u',ù:'u',û:'u',ü:'u',ç:'c',ñ:'n',Á:'A',À:'A',Â:'A',Ã:'A',Ä:'A',É:'E',È:'E',Ê:'E',Ë:'E',Í:'I',Ì:'I',Î:'I',Ï:'I',Ó:'O',Ò:'O',Ô:'O',Õ:'O',Ö:'O',Ú:'U',Ù:'U',Û:'U',Ü:'U',Ç:'C',Ñ:'N' };
const charDeaccent = s => [...s].map(c => ACCENTS[c] ?? c).join('');
// Padrão tolerante a acentos e espaços perdidos ("PROGRESSÃODEBÁRBARO" casa com "Progressão de bárbaro").
const CHARCLASS = { A:'[AÁÀÂÃÄ]', E:'[EÉÈÊË]', I:'[IÍÌÎÏ]', O:'[OÓÒÔÕÖ]', U:'[UÚÙÛÜ]', C:'[CÇ]', N:'[NÑ]' };
const accentClass = name => deaccent(name).toUpperCase().split('').map(c => CHARCLASS[c] || (/[A-Z0-9]/.test(c) ? c : '\\s')).join('\\s*');

// Índice despaçado do layout de cada página: permite achar "APERTO ÁCIDO" a partir de "APERTOÁCIDO".
// Também remove caracteres de controle (ex.: backspace após glifos no Livro 2) do texto bruto.
const CONTROL = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g;
// Rejunta palavras hifenizadas pela diagramação do livro ("conti-\nnuaria" → "continuaria").
const SOFT_HYPHEN = /([a-zà-ü])-\n([a-zà-ü])/g;
for (const page of pages) {
  page.raw = page.raw.replace(CONTROL, ' ').replace(SOFT_HYPHEN, '$1$2');
  page.layout = page.layout.replace(CONTROL, ' ').replace(SOFT_HYPHEN, '$1$2');
  const chars = [], map = [];
  for (let i = 0; i < page.layout.length; i++) {
    if (!/\s/.test(page.layout[i])) { chars.push(page.layout[i]); map.push(i); }
  }
  page._sq = chars.join('');
  page._map = map;
}
const ENTRY_ANCHOR = /^\s*(?:\[(one-action|two-actions|three-actions|free-action|reaction)\]\s*)?(MAGIA|TRUQUE|TALENTO|FOCO|RITUAL)\s*\d/;
function fixName(page, rawName, anchor = ENTRY_ANCHOR) {
  const target = rawName.replace(/\s+/g, '');
  let from = 0;
  while (true) {
    const at = page._sq.indexOf(target, from);
    if (at < 0) return null;
    from = at + 1;
    const start = page._map[at], stop = page._map[at + target.length - 1];
    const before = page.layout[start - 1];
    if (before && !/[\s(«"'“–—-]/.test(before)) continue;
    const rest = page.layout.slice(stop + 1, stop + 80);
    if (!anchor.test(rest)) continue;
    return page.layout.slice(start, stop + 1).trim();
  }
}
// Variante sem âncora de tipo: para nomes que não precedem MAGIA/TALENTO/… (ex.: heranças).
function fixNameLoose(pages_, rawName) {
  const target = rawName.replace(/\s+/g, '');
  for (const page of pages_) {
    let from = 0;
    while (true) {
      const at = page._sq.indexOf(target, from);
      if (at < 0) break;
      from = at + 1;
      const start = page._map[at], stop = page._map[at + target.length - 1];
      const before = page.layout[start - 1], after = page.layout[stop + 1];
      if ((before && !/[\s(«"'“–—-]/.test(before)) || (after && !/[\s.,;:)»"'”–—]/.test(after))) continue;
      return page.layout.slice(start, stop + 1).trim();
    }
  }
  return null;
}

// ---------- detecção de cabeçalhos no RAW ----------
const KINDS = { MAGIA: 'spell', TRUQUE: 'spell', FOCO: 'focus', RITUAL: 'ritual', TALENTO: 'feat' };
const HEADER_RE = /^([A-ZÀ-Ü0-9'’!.-](?:[A-ZÀ-Ü0-9'’!.-]|\s(?!\s)){1,80}?)\s*(?:\[(one-action|two-actions|three-actions|free-action|reaction)\])?\s*(MAGIA|TRUQUE|FOCO|RITUAL|TALENTOS?)\s*(\d{1,2})\s*$/;
const SKIP_CHAPTERS = new Set(['Glossário e índice', 'Abertura', 'Ficha', 'Tabela de Tesouros']);

function scanHeaders() {
  const headers = [];
  for (const book of ORIGINAL_BOOKS) {
    for (const page of byBook[book]) {
      if (SKIP_CHAPTERS.has(page.chapter)) continue;
      const lines = page.raw.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const match = lines[i].match(HEADER_RE);
        if (!match) continue;
        const [, nameRaw, glyph, kind, level] = match;
        headers.push({ book, page: page.page, line: i, nameRaw: nameRaw.trim(), glyph, type: KINDS[kind], level: Number(level) });
      }
    }
  }
  return headers;
}

// ---------- vocabulário de traços ----------
const SKILL_NAMES = ['Acrobatismo', 'Arcanismo', 'Atletismo', 'Diplomacia', 'Dissimulação', 'Furtividade', 'Intimidação', 'Ladroagem', 'Manufatura', 'Medicina', 'Natureza', 'Ocultismo', 'Performance', 'Religião', 'Sociedade', 'Sobrevivência'];
const CLASS_NAMES = ['Bardo', 'Bruxo', 'Clérigo', 'Druida', 'Guerreiro', 'Ladino', 'Mago', 'Patrulheiro', 'Alquimista', 'Bárbaro', 'Campeão', 'Espadachim', 'Feiticeiro', 'Investigador', 'Monge', 'Oráculo'];
const ANCESTRY_NAMES = ['Anão', 'Elfo', 'Gnomo', 'Goblin', 'Halfling', 'Humano', 'Leshy', 'Orc', 'Amurrun', 'Hobgoblin', 'Iruxi', 'Kholo', 'Kobold', 'Tengu', 'Tripkee', 'Ysoki'];
const SEED_TRAITS = ['GERAL', 'PERÍCIA', 'ARQUÉTIPO', 'COMPANHEIRO', 'INCOMUM', 'RARO', 'ÚNICO', 'COMUM',
  ...SKILL_NAMES.map(s => s.toUpperCase()), ...CLASS_NAMES.map(s => s.toUpperCase()), ...ANCESTRY_NAMES.map(s => s.toUpperCase())];
function buildTraitVocab(source = pages) {
  const freq = new Map();
  for (const token of SEED_TRAITS) freq.set(token, 99);
  for (const page of source) {
    for (const line of page.raw.split('\n')) {
      const t = line.trim();
      if (t.length < 3 || t.length > 90 || !isUpperLine(t)) continue;
      if (/\d|MAGIA|TRUQUE|TALENTO|FOCO|RITUAL/.test(t)) continue;
      for (const token of t.split(/\s+/)) {
        if (token.length >= 3 && /[A-ZÀ-Ü]/.test(token)) freq.set(token, (freq.get(token) || 0) + 1);
      }
    }
  }
  return new Set([...freq.entries()].filter(([, n]) => n >= 3).map(([t]) => t));
}
function splitTraits(upperLine, vocab) {
  if (upperLine.includes(' ')) return upperLine.split(/\s+/).filter(Boolean);
  const out = [];
  let rest = upperLine;
  while (rest.length) {
    let hit = null;
    for (const word of vocab) {
      if (rest.startsWith(word) && (!hit || word.length > hit.length)) hit = word;
    }
    if (hit) { out.push(hit); rest = rest.slice(hit.length); }
    else rest = rest.slice(1);
  }
  return out;
}

// ---------- rótulos de campos ----------
const LABELS = {
  'Tradições': 'traditions', 'Patrono': 'patron', 'Domínio': 'domain', 'Distância': 'range',
  'Alvos': 'targets', 'Área': 'area', 'Defesa': 'defense', 'Duração': 'duration', 'Custo': 'cost',
  'Requerimentos': 'requirements', 'Execução': 'time', 'Gatilho': 'trigger', 'Acionamento': 'trigger',
  'Pré-requisitos': 'prerequisites', 'Conjuradores secundários': 'secondary',
  'Teste primário': 'primaryCheck', 'Testes secundários': 'secondaryChecks',
};
const LABEL_MATCHERS = Object.entries(LABELS)
  .sort((a, b) => b[0].length - a[0].length)
  .map(([label, key]) => {
    const pattern = deaccent(label).split('').map(c => (c === '-' ? '-?' : /[A-Za-z0-9]/.test(c) ? c : '\\s')).join('\\s*');
    return [key, new RegExp('(^|[;:]\\s*)(' + pattern + ')\\s*', 'gi')];
  });

function parseLabeledLine(line, fields) {
  const plain = charDeaccent(line);
  const hits = [];
  for (const [key, re] of LABEL_MATCHERS) {
    re.lastIndex = 0;
    for (const hit of plain.matchAll(re)) hits.push({ index: hit.index + hit[1].length, end: hit.index + hit[1].length + hit[2].length, key });
  }
  if (!hits.length) return false;
  hits.sort((a, b) => a.index - b.index);
  for (let i = 0; i < hits.length; i++) {
    if (i && hits[i].index <= hits[i - 1].end) continue;
    const value = line.slice(hits[i].end, i + 1 < hits.length ? hits[i + 1].index : undefined)
      .replace(/^[;:\s]+|[;,\s]+$/g, '');
    if (value) fields[hits[i].key] = (fields[hits[i].key] ? fields[hits[i].key] + ' ' : '') + value;
  }
  return true;
}

// ---------- magias / rituais / talentos ----------
function parseEntry(header, lines, vocab) {
  const entry = {
    name: header.nameRaw, type: header.type, level: header.level, actions: header.glyph || null,
    traits: [], book: header.book, page: header.page, heightened: [],
  };
  let i = 0;
  while (i < lines.length && lines[i].trim() && isUpperLine(lines[i]) && entry.traits.length < 8) {
    entry.traits.push(...splitTraits(lines[i].trim(), vocab));
    i++;
  }
  const fields = {};
  const body = [];
  const elevated = [];
  for (; i < lines.length; i++) {
    const line = lines[i];
    const elev = line.match(/^(Elevada|Aumentada)\s*\(?\s*\+?\s*(\d+)\s*[ºo°]?\)?\s*(.*)$/i);
    if (elev) { elevated.push({ plus: Number(elev[2]), text: elev[3] }); continue; }
    if (elevated.length && line.trim() && !/^(Sucesso|Falha|Elevada)/i.test(line.trim())) {
      elevated[elevated.length - 1].text += ' ' + line.trim();
      continue;
    }
    if (parseLabeledLine(line, fields)) continue;
    body.push(line);
  }
  Object.assign(entry, fields);
  entry.text = body.join('\n').replace(/\n{2,}/g, '\n').trim();
  entry.heightened = elevated.map(e => ({ ...e, text: e.text.trim() })).filter(e => e.text);
  return entry;
}

const CATEGORY_TOKENS = new Map([
  ['geral', 'geral'], ['pericia', 'perícia'], ['arquetipo', 'arquétipo'], ['companheiro', 'companheiro'],
  ...SKILL_NAMES.map(n => [squeeze(n), 'perícia: ' + n]),
  ...CLASS_NAMES.map(n => [squeeze(n), 'classe: ' + n]),
  ...ANCESTRY_NAMES.map(n => [squeeze(n), 'ancestralidade: ' + n]),
  ...['Nefilim', 'Aiuvarin', 'Cambiante', 'Dromaar', 'Dampiro', 'Dracano', 'Crepusculante', 'Realeza', 'Ancestralidade mista']
    .map(n => [squeeze(n), 'herança versátil: ' + n]),
]);
const featCategory = traits => {
  const found = [];
  for (const trait of traits) {
    const cat = CATEGORY_TOKENS.get(squeeze(trait));
    if (cat) found.push(cat);
  }
  return [...new Set(found)].join(' | ');
};

// ---------- varredura principal ----------
// Vocabulário só dos Livros do Jogador: com o dos livros novos, a separação dos traços colados deles mudaria.
const vocab = buildTraitVocab(ORIGINAL_BOOKS.flatMap(book => byBook[book]));
const headers = scanHeaders();
const entries = [];
const seen = new Set();
const unfixed = [];
const RUNNING_HEADER = /^Livro do jogador( 2)?$/;
for (let h = 0; h < headers.length; h++) {
  const header = headers[h];
  const page = byBook[header.book].find(p => p.page === header.page);
  const lines = page.raw.split('\n');
  let bodyLines = lines.slice(header.line + 1);
  const next = headers[h + 1];
  if (next && next.book === header.book) {
    if (next.page > header.page) {
      bodyLines = bodyLines.concat(...byBook[header.book]
        .filter(p => p.page > header.page && p.page < next.page)
        .map(p => p.raw.split('\n')));
      const nextPage = byBook[header.book].find(p => p.page === next.page);
      bodyLines = bodyLines.concat(nextPage.raw.split('\n').slice(0, next.line));
    }
    if (next.page === header.page) bodyLines = lines.slice(header.line + 1, next.line);
  }
  bodyLines = bodyLines.filter(line => !RUNNING_HEADER.test(line.trim()));
  const fixed = fixName(page, header.nameRaw);
  if (!fixed) unfixed.push(`${header.book} p.${header.page}: ${header.nameRaw} (${header.type})`);
  const entry = parseEntry(header, bodyLines, vocab);
  entry.name = fixed || header.nameRaw;
  entry.nameFixed = !!fixed;
  if (entry.type === 'feat') entry.category = featCategory(entry.traits);
  entry.header = header;
  entry.bodyLines = bodyLines;
  const key = entry.type + '|' + squeeze(entry.name) + '|' + entry.level + '|' + entry.book;
  if (seen.has(key)) continue;
  seen.add(key);
  entries.push(entry);
}

// Correção de colunas: entrada cujo corpo foi desenhado no TOPO da página (antes do primeiro
// cabeçalho da página) enquanto o cabeçalho fica no fim da coluna anterior (ordem do stream).
// O bloco inicial é devolvido a essa entrada e removido do corpo da entrada que o carregava.
for (let k = 0; k < entries.length; k++) {
  const entry = entries[k];
  if ((entry.text || '').length >= 20) continue;
  const page = byBook[entry.book].find(p => p.page === entry.page);
  const firstHeader = headers.find(hh => hh.book === entry.book && hh.page === entry.page);
  if (!firstHeader || firstHeader.line === 0 || firstHeader.line > 40) continue;
  const block = page.raw.split('\n').slice(0, firstHeader.line);
  const blockStr = block.join('\n');
  if (!blockStr.trim()) continue;
  let donor = -1;
  for (let j = k - 1; j >= 0 && entries[j].book === entry.book; j--) {
    const candidate = entries[j].bodyLines;
    if (candidate.length >= block.length && candidate.slice(candidate.length - block.length).join('\n') === blockStr) { donor = j; break; }
  }
  if (donor < 0) continue;
  entries[donor].bodyLines = entries[donor].bodyLines.slice(0, entries[donor].bodyLines.length - block.length);
  Object.assign(entries[donor], parseEntry(entries[donor].header, entries[donor].bodyLines, vocab));
  if (entries[donor].type === 'feat') entries[donor].category = featCategory(entries[donor].traits);
  entry.bodyLines = block.concat(entry.bodyLines);
  const repaired = parseEntry(entry.header, entry.bodyLines, vocab);
  if (repaired.text.length > entry.text.length) {
    Object.assign(entry, repaired, { name: entry.name, nameFixed: entry.nameFixed, header: entry.header, bodyLines: entry.bodyLines });
    if (entry.type === 'feat') entry.category = featCategory(entry.traits);
  } else {
    // devolve o bloco ao doador se a troca não melhorou
    entries[donor].bodyLines = entries[donor].bodyLines.concat(block);
    Object.assign(entries[donor], parseEntry(entries[donor].header, entries[donor].bodyLines, vocab));
    if (entries[donor].type === 'feat') entries[donor].category = featCategory(entries[donor].traits);
  }
}
for (const entry of entries) { delete entry.header; delete entry.bodyLines; }

// ---------- livros novos: todos os tipos de cabeçalho (funções em scripts/srd-books.mjs) ----------
const NEW_CLASS_NAMES = ['Inventor', 'Pistoleiro', 'Psíquico', 'Taumaturgo', 'Cineticista'];
// Traços de origem dos livros novos: ancestralidade do Autômato (PE), heranças versáteis do FR, desviantes e consequências (AO).
const NEW_CATEGORY_TOKENS = new Map([...CATEGORY_TOKENS, ...NEW_CLASS_NAMES.map(n => [squeeze(n), 'classe: ' + n]),
  ['automato', 'ancestralidade: Autômato'], ['ardande', 'herança versátil: Ardande'], ['talos', 'herança versátil: Talos'],
  ['desviante', 'desviante'], ['consequencia', 'consequência']]);
const newFeatCategory = traits => [...new Set(traits.map(trait => NEW_CATEGORY_TOKENS.get(squeeze(trait))).filter(Boolean))].join(' | ');
// Criatura, perigo, aflição e veículo: traços em maiúsculas e o bloco de estatísticas como texto, uma linha por campo.
function buildStatEntry(header, body, traitVocab) {
  const traits = [];
  let i = 0;
  while (i < body.length && i < 3 && isUpperLine(body[i].text)) { traits.push(...splitTraits(body[i].text, traitVocab)); i++; }
  const entry = { name: header.nameRaw, type: header.type, level: header.level, traits, book: header.book, page: header.page,
    text: body.slice(i).map(line => normalizeStatLine(respaceLine(line.page, line.text))).join('\n').trim() };
  if (header.type === 'affliction') entry.category = header.kind === 'DOENÇA' ? 'doença' : 'maldição';
  return entry;
}

const newEntries = [], newItems = [];
const newVocab = buildTraitVocab(NEW_BOOKS.flatMap(book => byBook[book]));
for (const book of NEW_BOOKS) {
  const furniture = furnitureOf(byBook[book]);
  const lines = byBook[book].flatMap(page => dropFurniture(page.raw.split('\n'), furniture).map(text => ({ page, text })));
  const found = [];
  lines.forEach((line, index) => {
    const header = parseBookHeader(line.text);
    if (header) found.push({ ...header, index, book, page: line.page.page, pageObj: line.page });
  });
  const keys = new Set();
  for (let h = 0; h < found.length; h++) {
    const header = found[h], next = found[h + 1];
    // Nenhuma entrada passa de duas páginas depois da do cabeçalho: sem isso, a última antes de um apêndice levaria o livro todo.
    const limit = lines.findIndex((line, i) => i > header.index && line.page.page > header.page + 2);
    const end = Math.min(next ? next.index : lines.length, limit < 0 ? lines.length : limit);
    const { body, rest } = splitBody(lines, header.index + 1, end, next && next.index === end ? next.nameRaw : null);
    if (next && rest.length && squeeze(rest[0].text) === squeeze(next.nameRaw)) next.description = rest.slice(1).map(line => respaceLine(line.page, line.text)).join('\n').trim();
    let entry;
    if (header.type === 'item') {
      entry = buildTreasureItem({ page: header.pageObj, nameRaw: header.nameRaw, level: header.level, plus: header.plus, section: { RUNA: 'runa', ARAPUCA: 'arapuca' }[header.kind] || '', body: body.map(line => respaceLine(line.page, line.text)) });
    } else {
      entry = STAT_TYPES.has(header.type) ? buildStatEntry(header, body, newVocab) : parseEntry(header, body.map(line => respaceLine(line.page, line.text)), newVocab);
      const fixed = fixName(header.pageObj, header.nameRaw, NEW_ANCHOR);
      entry.name = fixed || header.nameRaw;
      entry.nameFixed = !!fixed;
      if (entry.type === 'feat') entry.category = newFeatCategory(entry.traits);
      if (entry.type === 'spell') tidySpell(entry);
    }
    if (header.description) entry.description = header.description;
    const key = entry.type + '|' + squeeze(entry.name) + '|' + entry.level;
    if (keys.has(key)) continue;
    keys.add(key);
    (entry.type === 'item' ? newItems : newEntries).push(entry);
  }
}

// ---------- classes ----------
const CLASS_DEFS = [
  ...['Bardo', 94, 'Bruxo', 108, 'Clérigo', 122, 'Druida', 136, 'Guerreiro', 150, 'Ladino', 166, 'Mago', 180, 'Patrulheiro', 194]
    .reduce((acc, v, i, arr) => (i % 2 === 0 && acc.push({ name: arr[i], page: arr[i + 1] }), acc), [])
    .map(d => ({ ...d, book: 'livro1' })),
  ...['Alquimista', 56, 'Bárbaro', 70, 'Campeão', 86, 'Espadachim', 100, 'Feiticeiro', 112, 'Investigador', 126, 'Monge', 140, 'Oráculo', 154]
    .reduce((acc, v, i, arr) => (i % 2 === 0 && acc.push({ name: arr[i], page: arr[i + 1] }), acc), [])
    .map(d => ({ ...d, book: 'livro2' })),
];
// Classes dos livros novos (página impressa onde a classe começa). Nelas os rótulos vêm também em caixa baixa
// ("Atributo-chave") e os PV como "8+modificador de Constituição": por isso a leitura tolerante (loose).
const NEW_CLASS_DEFS = [
  { name: 'Psíquico', book: 'ocultos', page: 9 }, { name: 'Taumaturgo', book: 'ocultos', page: 31 },
  { name: 'Cineticista', book: 'elementos', page: 13 }, { name: 'Inventor', book: 'polvora', page: 15 }, { name: 'Pistoleiro', book: 'polvora', page: 105 },
];
function parseClasses(defs = CLASS_DEFS, loose = false) {
  const out = [];
  for (const def of defs) {
    if (!byBook[def.book]?.length) continue;
    const section = byBook[def.book].filter(p => p.page >= def.page && p.page <= def.page + 16);
    const raw = section.map(p => p.raw).join('\n');
    const grab = re => { const m = raw.match(re); return m ? m[1].trim() : ''; };
    const hp = Number(grab(loose ? /pontos\s*de\s*vida\s*\n?\s*(\d+)/i : new RegExp('PONTOS\\s*DE\\s*VIDA\\s*\\n\\s*(\\d+)'))) || null;
    const keyAttr = grab(loose ? /^\s*atributo-?\s*chave\*?\s*$\n\s*([^\n]+)/im : /ATRIBUTO-CHAVE\s*\n\s*([^\n]+)/).replace(/\.$/, '');
    const profMatch = raw.match(new RegExp('PROFICIÊNCIAS\\s*INICIAIS\\s*\\n([\\s\\S]{0,900}?)(?:Talentos\\s|Subclasse|Ferramentas|Estatísticas|\\n\\s*[A-ZÀ-Ü]{4,})'));
    const progMatch = raw.match(new RegExp('PROGRESSÃO\\s*DE\\s*' + accentClass(def.name) + '\\s*\\n'));
    const progression = [];
    if (progMatch || /Seun[íi]vel/.test(raw)) {
      // fallback: sem heading, a tabela começa na linha "Seu nível / Características de classe"
      const start = progMatch ? progMatch.index + progMatch[0].length : raw.search(/Seun[íi]vel[^\n]*\n/);
      const tail = raw.slice(start >= 0 ? start : 0);
      for (const line of tail.split('\n')) {
        const row = line.match(/^\s*(\d{1,2})\s{1,3}(.+)$/);
        if (row && Number(row[1]) >= 1 && Number(row[1]) <= 20) {
          if (Number(row[1]) === progression.length + 1) progression.push({ level: Number(row[1]), features: row[2].trim() });
          else if (progression.length && Number(row[1]) === progression[progression.length - 1].level) progression[progression.length - 1].features += ' ' + row[2].trim();
        } else if (progression.length && line.trim() && !/^[A-ZÀ-Ü]{4,}/.test(line.trim())) {
          progression[progression.length - 1].features += ' ' + line.trim();
        }
        if (progression.length >= 20) break;
      }
    }
    out.push({
      type: 'class', name: def.name, book: def.book, page: def.page, level: null,
      hpPerLevel: hp, keyAttribute: keyAttr,
      proficiencies: profMatch ? profMatch[1].trim() : '',
      progression,
    });
    // Livros novos: a tabela vem com palavras coladas ("Talentodepistoleiro"); os espaços voltam pelo layout das páginas da classe.
    if (loose) for (const row of progression) row.features = section.reduce((text, page) => respaceLine(page, text), row.features);
  }
  return out;
}

// ---------- ancestralidades ----------
const ANCESTRY_DEFS = [
  ...['Anão', 42, 'Elfo', 46, 'Gnomo', 50, 'Goblin', 54, 'Halfling', 58, 'Humano', 62, 'Leshy', 66, 'Orc', 70]
    .reduce((acc, v, i, arr) => (i % 2 === 0 && acc.push({ name: arr[i], page: arr[i + 1] }), acc), [])
    .map(d => ({ ...d, book: 'livro1' })),
  ...['Amurrun', 8, 'Hobgoblin', 12, 'Iruxi', 16, 'Kholo', 20, 'Kobold', 24, 'Tengu', 28, 'Tripkee', 32, 'Ysoki', 36]
    .reduce((acc, v, i, arr) => (i % 2 === 0 && acc.push({ name: arr[i], page: arr[i + 1] }), acc), [])
    .map(d => ({ ...d, book: 'livro2' })),
];
const SECTION_STOP = /^(IDIOMAS|TRAÇOS|Talentos|IMPULSOS|TAMANHO|DESLOCAMENTO|VELOCIDADE|PONTOS)/;
const NAME_STOP = /^(Você|Os|Se|Sua|Suas|No|Em|Para|Como|Talento|Talentos|Idiomas|Impulsos|Herança|PONTOS|TAMANHO|DESLOCAMENTO|TRAÇOS|Ancestralidades|Um|Uma|•|IMPULSOS|Além|Na|Ao|Os|De|Do|Da|Livro)/i;
// Percorre o statblock da ancestralidade rótulo a rótulo (rótulos maiúsculos, às vezes despaçados).
function walkStatblock(raw) {
  const LABELS = { pontosdevida: 'hp', tamanho: 'size', velocidade: 'speed', deslocamento: 'speed', melhoriasdeatributo: 'boosts', defeitodeatributo: 'flaws', penalidadedeatributo: 'flaws', idiomas: 'languages', traos: 'traits' };
  const out = { hp: null, size: '', speed: '', boosts: [], flaws: [], languages: '', traits: [] };
  let current = null;
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    const sq = squeeze(t);
    if (LABELS[sq] && sq !== 'traos') { current = LABELS[sq]; continue; }
    if (sq === 'traos' || sq === 'tracos') { current = 'traits'; continue; }
    if (!current) continue;
    if (current === 'hp' && out.hp === null && /^\d+$/.test(t)) { out.hp = Number(t); current = null; continue; }
    if (current === 'size' && !out.size && /^(Pequeno|Médio|Medio)$/i.test(t)) { out.size = t === 'Medio' ? 'Médio' : t; current = null; continue; }
    if (current === 'speed' && !out.speed) { out.speed = t; current = null; continue; }
    if (current === 'boosts') { if (t.length <= 60) out.boosts.push(t); else current = null; continue; }
    if (current === 'flaws') { if (t.length <= 40) out.flaws.push(t); else current = null; continue; }
    if (current === 'languages') { if (t.length <= 28 && out.languages.split(',').length < 6) out.languages = out.languages ? out.languages + ', ' + t : t; else current = null; continue; }
    if (current === 'traits') {
      // traços são palavras curtas em Title Case ("Anão", "Humanoide"); qualquer outra coisa encerra
      if (/^[A-ZÀ-Ü][a-zà-ü]{2,20}(?: [A-ZÀ-Ü][a-zà-ü]{2,20})?$/.test(t)) out.traits.push(...t.split(/[,/]/));
      else current = null;
      continue;
    }
  }
  out.boosts = [...new Set(out.boosts.map(s => s.trim()))].filter(Boolean);
  out.flaws = [...new Set(out.flaws.map(s => s.trim()))].filter(Boolean);
  out.traits = [...new Set(out.traits.map(s => s.trim()))].filter(Boolean);
  return out;
}
function parseAncestries() {
  const out = [];
  for (const def of ANCESTRY_DEFS) {
    const section = byBook[def.book].filter(p => p.page >= def.page && p.page <= def.page + 3);
    const raw = section.map(p => p.raw).join('\n');
    let start = -1;
    for (const line of raw.split('\n')) {
      if (squeeze(line.trim()) === 'pontosdevida') { start = raw.indexOf(line); break; }
    }
    const block = start >= 0 ? raw.slice(start, start + 900) : '';
    const stats = walkStatblock(block);
    const ancestry = { type: 'ancestry', name: def.name, book: def.book, page: def.page, level: null, ...stats };
    const heritages = [];
    // plural irregular ("anão" → "anões", com ã→õ): radical com classes vocálicas combinadas
    const ANY_VOWEL = { A: '[AEIOUÁÉÍÓÚÀÂÊÔÃÕÄËÏÖÜ]', E: '[AEIOUÁÉÍÓÚÀÂÊÔÃÕÄËÏÖÜ]', I: '[AEIOUÁÉÍÓÚÀÂÊÔÃÕÄËÏÖÜ]', O: '[AEIOUÁÉÍÓÚÀÂÊÔÃÕÄËÏÖÜ]', U: '[AEIOUÁÉÍÓÚÀÂÊÔÃÕÄËÏÖÜ]' };
    const stem = deaccent(def.name).toUpperCase().slice(0, 3).split('').map(c => ANY_VOWEL[c] || c).join('\\s*');
    const hStart = raw.match(new RegExp('Heranças\\s+(?:d[aeo]s?\\s+)?' + stem + '[a-zà-ü]{0,8}\\b', 'i'));
    if (hStart) {
      const lines = raw.slice(hStart.index).split('\n');
      for (let i = 1; i < lines.length && heritages.length < 12; i++) {
        const t = lines[i].trim();
        if (/^[A-ZÀ-Ü][a-zà-ü0-9](?:[a-zà-ü0-9' -]{2,40})$/.test(t) && !NAME_STOP.test(t) && !SECTION_STOP.test(t)) {
          const body = [];
          for (let j = i + 1; j < lines.length; j++) {
            const nt = lines[j].trim();
            if (SECTION_STOP.test(nt) || /^[A-ZÀ-Ü][A-ZÀ-Ü ]{3,}$/.test(nt)) { i = lines.length; break; }
            if (/^[A-ZÀ-Ü][a-zà-ü0-9](?:[a-zà-ü0-9' -]{2,40})$/.test(nt) && !NAME_STOP.test(nt)) break;
            body.push(nt);
          }
          heritages.push({ name: fixNameLoose(section, t) || t, text: body.join(' ').trim() });
        }
      }
    }
    ancestry.heritages = heritages;
    out.push(ancestry);
  }
  return out;
}

// ---------- condições (nomes verificados contra o apêndice do Livro 1, p. 442-447) ----------
const CONDITION_NAMES = ['Acelerado', 'Agarrado', 'Amistoso', 'Assustado', 'Atordoado', 'Cegado', 'Condenado',
  'Confuso', 'Controlado', 'Dano persistente', 'Desacelerado', 'Desajeitado', 'Despercebido', 'Desprevenido',
  'Drenado', 'Enfraquecido', 'Enjoado', 'Ensurdecido', 'Escondido', 'Estupefato', 'Fascinado', 'Fatigado',
  'Ferido', 'Fugindo', 'Hostil', 'Imobilizado', 'Inamistoso', 'Inconsciente', 'Indetectado', 'Indiferente',
  'Invisível', 'Morrendo', 'Observado', 'Ocultado', 'Ofuscado', 'Paralisado', 'Petrificado', 'Prestativo',
  'Prostrado', 'Quebrado', 'Restringido', 'Sobrecarregado'];
function parseConditions() {
  const appendix = byBook.livro1.filter(p => p.page >= 442 && p.page <= 447);
  const raw = appendix.map(p => `@@${p.page}@@\n${p.raw}`).join('\n');
  const nameSet = new Set(CONDITION_NAMES.map(squeeze));
  const found = [];
  for (const name of CONDITION_NAMES) {
    const re = new RegExp('(^|\\n)([^\\n@]*?)(' + name.split('').map(c => /[a-zà-ü]/i.test(c) ? charDeaccent(c) : c).join('\\s*') + ')\\s*(?=\\n)', 'gi');
    // acha a linha cujo conteúdo despaçado é exatamente o nome
    const lineRe = new RegExp('^' + name.split('').map(c => charDeaccent(c).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*') + '\\s*$', 'im');
    const m = raw.match(lineRe);
    if (!m) continue;
    const after = raw.slice(m.index + m[0].length + 1);
    const body = [];
    for (const line of after.split('\n')) {
      const t = line.trim();
      if (!t) { if (body.length) break; continue; }
      if (/^@@\d+@@$/.test(t)) continue;
      if ([...t.matchAll(/^[^\n]+$/gm)]) {
        const sq = squeeze(t.split(' ')[0] + (t.split(' ')[1] ? ' ' + t.split(' ')[1] : ''));
        if (nameSet.has(squeeze(t))) break;
      }
      if (/^[A-ZÀ-Ü][A-ZÀ-Ü ,]{4,}$/.test(t)) break;
      body.push(t);
      if (body.length > 60) break;
    }
    const page = Number((raw.slice(0, m.index).match(/@@(\d+)@@/g) || []).at(-1)?.replace(/\D/g, '')) || 442;
    found.push({ type: 'condition', name, book: 'livro1', page, level: null, text: body.join('\n').replace(/\n{2,}/g, '\n').trim() });
  }
  return found;
}

// ---------- montagem final ----------
const classes = parseClasses();
const ancestries = parseAncestries();
const conditions = parseConditions();
const spells = entries.filter(e => e.type === 'spell' || e.type === 'focus' || e.type === 'ritual');
const feats = entries.filter(e => e.type === 'feat');
// Itens (scripts/srd-items.mjs): tabelas de armas, armaduras e escudos do Livro 1 e itens mágicos/alquímicos do Livro 2.
const items = [
  ...parseEquipmentTables(byBook.livro1.filter(p => p.chapter === 'Equipamento')),
  ...parseTreasureItems(byBook.livro2.filter(p => p.chapter === 'Pilha de tesouros')),
];
// Livros novos: entradas e itens montados no caminho deles, mais as classes novas.
const newClasses = parseClasses(NEW_CLASS_DEFS, true);
// Livros legados (de antes do Remaster): cada entrada sai adaptada, com o selo e a lista do que mudou (scripts/remaster.mjs).
const LEGACY_BOOKS = new Set(LIVROS.filter(book => book.legacy).map(book => book.id));
for (const entry of [...newEntries, ...newItems, ...newClasses]) if (LEGACY_BOOKS.has(entry.book)) adaptarRemaster(entry);
const isSpellish = e => e.type === 'spell' || e.type === 'focus' || e.type === 'ritual';
const creatures = newEntries.filter(e => e.type === 'creature');
const statOthers = newEntries.filter(e => STAT_TYPES.has(e.type) && e.type !== 'creature');

for (const [name, list] of Object.entries({ spells: [...spells, ...newEntries.filter(isSpellish)], feats: [...feats, ...newEntries.filter(e => e.type === 'feat')],
  classes: [...classes, ...newClasses], ancestries, conditions, items: [...items, ...newItems], creatures, perigos: statOthers })) {
  fs.writeFileSync(path.join(dataDir, `${name}.json`), JSON.stringify(list, null, 1));
}

// ---------- relatório de auditoria ----------
const report = [];
report.push('# Auditoria da extração — ' + new Date().toISOString(), '');
report.push('| Categoria | Entradas |', '| --- | --- |');
report.push(`| Magias/Truques | ${spells.filter(e => e.type === 'spell').length} |`);
report.push(`| Magias de foco | ${spells.filter(e => e.type === 'focus').length} |`);
report.push(`| Rituais | ${spells.filter(e => e.type === 'ritual').length} |`);
report.push(`| Talentos | ${feats.length} |`);
report.push(`| Classes | ${classes.length} |`);
report.push(`| Ancestralidades | ${ancestries.length} |`);
report.push(`| Condições | ${conditions.length} |`);
const noText = entries.filter(e => !e.text || e.text.length < 20);
report.push('', `## Entradas com corpo suspeito (<20 caracteres): ${noText.length}`);
for (const e of noText.slice(0, 25)) report.push(`- ${e.type} "${e.name}" (${e.book} p.${e.page})`);
report.push('', `## Nomes não recuperados do layout (despaçados): ${unfixed.length}`);
for (const line of unfixed.slice(0, 40)) report.push('- ' + line);
const noTrad = spells.filter(e => e.type === 'spell' && !e.traditions);
report.push('', `## Magias sem tradições: ${noTrad.length}`);
for (const e of noTrad.slice(0, 20)) report.push(`- "${e.name}" (${e.book} p.${e.page})`);
const noCat = feats.filter(e => !e.category);
report.push('', `## Talentos sem categoria derivada: ${noCat.length}`);
for (const e of noCat.slice(0, 25)) report.push(`- "${e.name}" (${e.book} p.${e.page}) traits=[${e.traits.join(',')}]`);
const badProg = classes.filter(c => c.progression.length !== 20 || !c.hpPerLevel || !c.keyAttribute);
report.push('', `## Classes com problemas: ${badProg.length}`);
for (const c of badProg) report.push(`- ${c.name}: progressão=${c.progression.length}/20 níveis, PV=${c.hpPerLevel}, atributo="${c.keyAttribute}"`);
const badAnc = ancestries.filter(a => !a.hp || !a.heritages.length);
report.push('', `## Ancestralidades com problemas: ${badAnc.length}`);
for (const a of badAnc) report.push(`- ${a.name}: PV=${a.hp}, tamanho="${a.size}", heranças=${a.heritages.length}, traços=${a.traits.join(',')}`);
const noCond = conditions.filter(c => !c.text || c.text.length < 20);
report.push('', `## Condições com corpo curto: ${noCond.length}`);
for (const c of noCond) report.push(`- ${c.name} (p.${c.page}): ${(c.text || '').slice(0, 60)}`);
const itemCategories = items.reduce((acc, item) => acc.set(item.category, (acc.get(item.category) || 0) + 1), new Map());
report.push('', `## Itens: ${items.length}`, '', '| Categoria | Itens |', '| --- | --- |');
for (const [category, count] of [...itemCategories].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'))) report.push(`| ${category} | ${count} |`);
const badItems = items.filter(item => !item.price || (item.book === 'livro2' && (!item.nameFixed || item.text.length < 40 || item.text.length > 2200)));
report.push('', `## Itens suspeitos (sem preço, nome não recuperado ou corpo fora do normal): ${badItems.length}`);
for (const item of badItems) report.push(`- "${item.name}" (${item.book} p.${item.page}): preço="${item.price}", texto=${item.text.length}`);
// Livros novos: contagem por livro e tipo, e o que parece fora do normal.
const TYPE_ORDER = ['creature', 'hazard', 'affliction', 'vehicle', 'spell', 'focus', 'ritual', 'feat', 'item', 'class'];
const newAll = [...newEntries, ...newItems, ...newClasses];
report.push('', '## Livros novos', '', '| Livro | ' + TYPE_ORDER.join(' | ') + ' |', '| --- |' + TYPE_ORDER.map(() => ' --- |').join(''));
for (const book of NEW_BOOKS) report.push(`| ${book} | ` + TYPE_ORDER.map(type => newAll.filter(e => e.book === book && e.type === type).length).join(' | ') + ' |');
const badCreatures = creatures.filter(e => !/^CA\s*\d/m.test(e.text) || !/^PV\s*\d/m.test(e.text) || !/^Percep/m.test(e.text));
report.push('', `## Criaturas sem Percepção, CA ou PV no bloco: ${badCreatures.length}`);
for (const e of badCreatures.slice(0, 40)) report.push(`- "${e.name}" (${e.book} p.${e.page}) texto=${e.text.length}`);
const newUnfixed = newEntries.filter(e => !e.nameFixed && /\S{14,}/.test(e.name));
report.push('', `## Nomes possivelmente despaçados nos livros novos: ${newUnfixed.length}`);
for (const e of newUnfixed.slice(0, 40)) report.push(`- ${e.type} "${e.name}" (${e.book} p.${e.page})`);
const badNewClasses = newClasses.filter(c => c.progression.length !== 20 || !c.hpPerLevel || !c.keyAttribute);
report.push('', `## Classes novas com problemas: ${badNewClasses.length}`);
for (const c of badNewClasses) report.push(`- ${c.name}: progressão=${c.progression.length}/20 níveis, PV=${c.hpPerLevel}, atributo="${c.keyAttribute}"`);
fs.writeFileSync(path.join(dataDir, 'srd-report.md'), report.join('\n'));

console.log(`Magias: ${spells.filter(e => e.type === 'spell').length} | Foco: ${spells.filter(e => e.type === 'focus').length} | Rituais: ${spells.filter(e => e.type === 'ritual').length} | Talentos: ${feats.length}`);
console.log(`Classes: ${classes.length} (problemáticas: ${badProg.length}) | Ancestralidades: ${ancestries.length} (problemáticas: ${badAnc.length}) | Condições: ${conditions.length}`);
console.log(`Sem corpo: ${noText.length} | Nomes despaçados: ${unfixed.length} | Sem categoria: ${noCat.length} | Sem tradições: ${noTrad.length}`);
console.log(`Itens: ${items.length} (Livro 1: ${items.filter(i => i.book === 'livro1').length}, Livro 2: ${items.filter(i => i.book === 'livro2').length}) | suspeitos: ${badItems.length}`);
console.log(`Livros novos: ${newAll.length} entradas (${TYPE_ORDER.map(type => `${type} ${newAll.filter(e => e.type === type).length}`).join(', ')}) | criaturas sem CA/PV/Percepção: ${badCreatures.length} | classes novas com problema: ${badNewClasses.length}`);

// ---------- carga no banco ----------
const db = openLocalDb();
const insertEntry = db.prepare('INSERT INTO srd_entries (id, type, name, norm, level, category, category_norm, traits, traits_norm, book, page, data) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
const insertFts = db.prepare('INSERT INTO srd_fts (rowid, name, text) VALUES (?,?,?)');
const insertPage = db.prepare('INSERT INTO srd_pages (book, page, chapter, norm, text) VALUES (?,?,?,?,?)');
const insertPageFts = db.prepare('INSERT INTO srd_pages_fts (rowid, text) SELECT rowid, text FROM srd_pages WHERE rowid = last_insert_rowid()');
// Itens e livros novos por último: as linhas que já existiam mantêm o mesmo rowid no índice de texto.
const all = [...entries, ...classes, ...ancestries, ...conditions, ...items, ...newEntries, ...newClasses, ...newItems];
// O catálogo inteiro é trocado numa transação só: se algo falhar no meio, o anterior continua valendo.
let insertFail = 0;
db.exec('BEGIN');
try {
db.exec('DELETE FROM srd_entries');
db.exec('DELETE FROM srd_fts');
let rowid = 0;
const idCount = new Map();
for (const entry of all) {
  rowid++;
  const base = `${entry.type}-${squeeze(entry.name)}-${entry.book}${entry.level != null ? '-' + entry.level : ''}`;
  const n = (idCount.get(base) || 0) + 1;
  idCount.set(base, n);
  const id = n === 1 ? base : `${base}-${n}`;
  const text = [entry.text, entry.heightened?.map(hh => `Elevada (+${hh.plus}) ${hh.text}`).join('\n'),
    entry.progression ? 'Progressão: ' + entry.progression.map(p => `${p.level} ${p.features}`).join(' | ') : '',
    entry.heritages ? 'Heranças: ' + entry.heritages.map(hh => `${hh.name}. ${hh.text}`).join(' | ') : '',
    entry.traditions, entry.range, entry.targets, entry.area, entry.defense, entry.duration, entry.prerequisites, entry.description,
    ...(entry.type === 'item' ? [entry.category, entry.price, [entry.damage, entry.damageType].filter(Boolean).join(' '), entry.group, entry.usage, entry.activate, ...(entry.variants || []).map(v => `${v.name} ${v.text}`)] : [])]
    .filter(Boolean).join('\n');
  try {
    insertEntry.run(id, entry.type, entry.name, squeeze(entry.name), entry.level ?? null, entry.category || null,
      entry.category ? squeeze(entry.category) : null,
      (entry.traits || []).join(', ') || null, squeeze((entry.traits || []).join(',')) || null,
      entry.book, entry.page, JSON.stringify(entry));
    insertFts.run(rowid, entry.name, text);
  } catch (error) {
    insertFail++;
    console.error('falha ao inserir', id, error.message);
  }
}
db.exec('DELETE FROM srd_pages');
db.exec('DELETE FROM srd_pages_fts');
for (const page of pages) {
  insertPage.run(page.book, page.page, page.chapter, squeeze(page.raw), page.raw);
  insertPageFts.run();
}
db.exec('COMMIT');
} catch (error) { db.exec('ROLLBACK'); throw error; }
console.log(`Banco atualizado: ${all.length} entradas, ${pages.length} páginas indexadas, falhas: ${insertFail}.`);
