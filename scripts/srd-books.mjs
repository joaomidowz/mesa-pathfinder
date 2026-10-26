// Livros novos do catálogo SRD (todos menos os dois Livros do Jogador, que seguem pelo caminho original do parse-srd):
// cabeçalhos de todos os tipos, mobília de página, corte do corpo de cada entrada e acertos do texto colado pelo modo raw.
// Funções puras: recebem páginas já limpas pelo parse-srd ({ book, page, chapter, raw, layout }) ou linhas delas.
const deaccent = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '');
const squeeze = s => deaccent(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const isUpperLine = line => /[A-ZÀ-Ü]/.test(line) && !/[a-zà-ü]/.test(line.replace(/\[[^\]]*\]/g, ''));

// ---------- cabeçalhos ----------
// Os livros Remaster escrevem "TRUQUE MÁGICO 1"; runas e arapucas são itens; "CREATURE"/"CREITURA" são erros de digitação do MT.
export const NEW_KINDS = { MAGIA: 'spell', TRUQUE: 'spell', 'TRUQUEMÁGICO': 'spell', FOCO: 'focus', RITUAL: 'ritual', TALENTO: 'feat', TALENTOS: 'feat',
  CRIATURA: 'creature', CREATURE: 'creature', CREITURA: 'creature', PERIGO: 'hazard', 'OBSTÁCULO': 'hazard', 'MALDIÇÃO': 'affliction',
  'DOENÇA': 'affliction', 'VEÍCULO': 'vehicle', ITEM: 'item', MATERIAL: 'item', RUNA: 'item', ARAPUCA: 'item' };
export const STAT_TYPES = new Set(['creature', 'hazard', 'affliction', 'vehicle']);
const KIND_WORDS = 'MAGIA|TRUQUE\\s*MÁGICO|TRUQUE|FOCO|RITUAL|TALENTOS?|CRIATURA|CREATURE|CREITURA|PERIGO|OBSTÁCULO|MALDIÇÃO|DOENÇA|VEÍCULO|ITEM|MATERIAL|RUNA|ARAPUCA';
const GLYPH = '\\[(one-action|two-actions|three-actions|free-action|reaction)\\]';
// "SKÓRIA CRIATURA2", "SETAFÁSICA[two-actions] TRUQUEMÁGICO1", "RUNA DE GOLPE RUNA 4", "ESPADA ITEM 5+": nome em maiúsculas
// (às vezes sem espaços), glifo opcional, tipo e nível (pode ser -1).
const HEADER_RE = new RegExp(`^([A-ZÀ-Ü0-9'’!.,()-](?:[A-ZÀ-Ü0-9'’!.,()-]|\\s(?!\\s)){1,80}?)\\s*(?:${GLYPH})?\\s*(${KIND_WORDS})\\s*(\\+?)\\s*(-?\\d{1,2})\\s*(\\+?)\\s*$`);
// Âncora para recuperar o nome com espaços no layout: o tipo logo depois do nome.
export const NEW_ANCHOR = new RegExp(`^\\s*(?:${GLYPH}\\s*)?(${KIND_WORDS})\\s*\\+?\\s*-?\\d`);
export function parseBookHeader(text) {
  const match = String(text).trim().match(HEADER_RE);
  if (!match) return null;
  const [, nameRaw, glyph, kindRaw, plusBefore, level, plusAfter] = match;
  const kind = kindRaw.replace(/\s+/g, '');
  return { nameRaw: nameRaw.trim(), glyph, kind, type: NEW_KINDS[kind], level: Number(level), plus: Boolean(plusBefore || plusAfter) };
}

// ---------- mobília de página ----------
const PAGE_NUMBER = /^\d{1,3}(?:\s+\d{1,3})?$/;
const STAT_LABEL = /^(Percepção|Idiomas|Perícias|For\b|Itens|CA\b|PV\b|Velocidade|Corpo|Distância|Magias|Rituais|Tradições|Furtividade|Descrição|Desarmar|Rotina|Reinicialização|Salvamento|Início|Estágio|Sucesso|Falha|Elevad|Pré-requisitos|Frequência|Gatilho|Acionamento|Requerimentos|Efeito|Preço|Uso|Volume|Ativação)/;
// Cabeçalho corrido e barra lateral de navegação: linha curta que se repete em muitas páginas do livro. Em 35%+ das páginas
// ela sai sempre; entre 8% e 35% (abas de um capítulo) só sai em bloco de 3+ linhas seguidas, para não levar junto uma linha
// de regra que por acaso se repete. Linha com número ou rótulo de bloco de estatísticas nunca é mobília.
export function furnitureOf(bookPages) {
  const freq = new Map();
  for (const page of bookPages) for (const line of new Set(page.raw.split('\n').map(text => text.trim()).filter(Boolean))) freq.set(line, (freq.get(line) || 0) + 1);
  const strong = new Set(), weak = new Set();
  for (const [line, n] of freq) {
    if (line.length > 40 || /\d/.test(line) || STAT_LABEL.test(line)) continue;
    if (n >= bookPages.length * 0.35) strong.add(line);
    else if (n >= Math.max(8, bookPages.length * 0.08)) weak.add(line);
  }
  return { strong, weak };
}
// Linhas de uma página sem a mobília, já sem espaços nas pontas e sem linhas vazias.
export function dropFurniture(lines, { strong, weak }) {
  const trimmed = lines.map(text => text.trim());
  const kind = trimmed.map(t => (!t ? 'blank' : PAGE_NUMBER.test(t) || strong.has(t) ? 'drop' : weak.has(t) ? 'weak' : 'text'));
  const out = [];
  for (let i = 0; i < trimmed.length; i++) {
    if (kind[i] === 'blank' || kind[i] === 'drop') continue;
    if (kind[i] === 'weak') {
      let run = 1;
      for (let j = i - 1; j >= 0 && kind[j] !== 'text'; j--) if (kind[j] !== 'blank') run++;
      for (let j = i + 1; j < trimmed.length && kind[j] !== 'text'; j++) if (kind[j] !== 'blank') run++;
      if (run >= 3) continue;
    }
    out.push(trimmed[i]);
  }
  return out;
}

// ---------- texto colado ----------
function ensureIndex(page) {
  if (page._sq) return;
  const chars = [], map = [];
  for (let i = 0; i < page.layout.length; i++) if (!/\s/.test(page.layout[i])) { chars.push(page.layout[i]); map.push(i); }
  page._sq = chars.join('');
  page._map = map;
}
// Palavras coladas pelo modo raw ("CorpoaCorpo", "Efeitoatracar") voltam com os espaços do layout da mesma página, desde que o
// trecho apareça inteiro numa linha do layout (sem quebra de linha nem vão de coluna no meio).
export function respaceLine(page, text) {
  ensureIndex(page);
  return text.replace(/\S{8,}/g, token => {
    const at = page._sq.indexOf(token);
    if (at < 0) return token;
    const slice = page.layout.slice(page._map[at], page._map[at + token.length - 1] + 1);
    return /\n| {2,}/.test(slice) ? token : slice;
  });
}
// Rótulos colados ao número: "PV70"/"PVs 259" → "PV 70"/"PV 259", "Fort+7" → "Fort +7", "For+10,Des+9" → "For +10, Des +9".
export const normalizeStatLine = text => text
  .replace(/^PVs?\s*(?=\d)/, 'PV ')
  .replace(/^(CA|Velocidade|Percepção)(?=[+–-]?\d)/, '$1 ')
  .replace(/\b(Fort|Ref|Von)\s*([+–-]\d)/g, '$1 $2')
  .replace(/\b(For|Des|Con|Int|Sab|Car)\s*([+–-]\d+)\s*,?\s*(?=(?:Des|Con|Int|Sab|Car)\b|$)/g, (m, attr, value, offset, all) => `${attr} ${value}${/(Des|Con|Int|Sab|Car)\b/.test(all.slice(offset + m.length, offset + m.length + 3)) ? ', ' : ''}`);

// ---------- corpo de cada entrada ----------
const isTitleLine = text => text.replace(/[^A-Za-zÀ-ÿ]/g, '').length >= 6 && !/[a-zà-ÿ]/.test(text) && !/^(PV|CA|CD)\b/.test(text);
// Linha de bloco de estatísticas ou de regra: rótulo conhecido no começo, glifo de ação ou grau de sucesso.
const STAT_LINE = new RegExp(`^(Percep|Idiomas|Per[íi]cias|For\\s*[+–-]|Itens|CA\\s*\\d|PV\\s*\\d|Velocidade|Corpo\\s*a\\s*Corpo|Dist[âa]ncia\\s*\\[|Magias|Rituais|Imunidades|Fraquezas|Resist[êe]ncias|Furtividade|Desarmar|Rotina|Reinicializa|Salvamento|Est[áa]gio|In[íi]cio|Sucesso|Falha|Frequ[êe]ncia|Gatilho|Acionamento|Efeito|Requerimentos|Pr[ée]-requisitos|Elevad|Pre[çc]o|Uso|Ativa)|${GLYPH}`);
// Do cabeçalho até o próximo ({ text } de cada linha), pulando os traços em maiúsculas do começo. Corta num título em
// maiúsculas quando ele é o nome da próxima entrada ou quando nada de bloco/regra vem depois dele (apresentação da próxima
// criatura, família, quadro lateral no fim). Título com bloco depois é quadro lateral no meio da leitura: o corpo continua.
// `rest` (do título em diante) traz a apresentação da próxima entrada.
export function splitBody(lines, from, to, nextName) {
  const body = lines.slice(from, to);
  let k = 0;
  while (k < body.length && k < 3 && isUpperLine(body[k].text)) k++;
  const cut = body.findIndex((line, i) => i >= k && isTitleLine(line.text) &&
    ((nextName && squeeze(line.text) === squeeze(nextName)) || !body.slice(i + 1).some(after => STAT_LINE.test(after.text))));
  return cut < 0 ? { body, rest: [] } : { body: body.slice(0, cut), rest: body.slice(cut) };
}

// Magia dos livros novos: o traço "TRUQUEMÁGICO" partido em TRUQUE + MÁGICO volta a ser só TRUQUE (como no Livro do Jogador),
// e o "Alvo" no singular do Remaster, que ficou dentro da distância, vira o campo Alvos.
export function tidySpell(entry) {
  const at = entry.traits.findIndex((trait, i) => trait === 'TRUQUE' && entry.traits[i + 1] === 'MÁGICO');
  if (at >= 0) entry.traits.splice(at + 1, 1);
  const target = entry.range?.match(/^(.*?);\s*Alvos?\s+(.+)$/);
  if (target && !entry.targets) { entry.range = target[1].trim(); entry.targets = target[2].trim(); }
  return entry;
}
