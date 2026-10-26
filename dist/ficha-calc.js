// Contas puras da ficha para as páginas Sessão e Grupo (window.FichaCalc): sem DOM e sem rede.
// Os valores da ficha são texto ('17', '+7', '', '7,5', até lixo): toda conta tolera isso e devolve texto.
(() => {
  const toInt = value => { const match = String(value ?? '').trim().replace(/^\+/, '').replace(/^[−–]/, '-').match(/^-?\d+/); return match ? Number(match[0]) : null; };
  // Contagem com milhar à brasileira: "1.750" e "1 750" valem 1750 (ponto ou espaço seguido de 3 dígitos é milhar); o resto, como toInt.
  const toCount = value => {
    const text = String(value ?? '').trim().replace(/^\+/, '').replace(/^[−–]/, '-'), grouped = text.match(/^(-?\d+)((?:[.   ]\d{3})+)(?!\d)/);
    return grouped ? Number(grouped[1] + grouped[2].replace(/\D/g, '')) : toInt(text);
  };
  const deaccent = value => String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
  const normalizeName = value => deaccent(value).toLowerCase().replace(/[^a-z0-9]/g, '');

  function formatModifier(value) {
    const n = toInt(value);
    return n == null ? '—' : n >= 0 ? '+' + n : '−' + Math.abs(n);
  }

  // Penalidade de ataques múltiplos: −5/−10, ou −4/−8 com o traço ágil.
  function mapSequence(bonus, traits) {
    const n = toInt(bonus);
    if (n == null) return null;
    const step = /(^|[^a-z])agil([^a-z]|$)/.test(deaccent(traits).toLowerCase()) ? 4 : 5;
    return [n, n - step, n - 2 * step].map(formatModifier);
  }

  function hpState(stats = {}) {
    const current = toInt(stats.hpCurrent) ?? 0, max = toInt(stats.hpMax), temp = Math.max(0, toInt(stats.hpTemp) ?? 0);
    const percent = max > 0 ? Math.max(0, Math.min(100, Math.round(current / max * 100))) : null;
    const state = current <= 0 ? 'caido' : percent == null ? 'ok' : percent <= 25 ? 'critico' : percent < 100 ? 'ferido' : 'ok';
    return { current, max, temp, percent, state };
  }

  // Dano consome primeiro os PV temporários; os PV nunca ficam negativos.
  function applyDamage(stats = {}, amount) {
    const n = Math.max(0, toInt(amount) ?? 0);
    let temp = Math.max(0, toInt(stats.hpTemp) ?? 0), current = toInt(stats.hpCurrent) ?? 0;
    const absorbed = Math.min(temp, n);
    temp -= absorbed;
    current = Math.max(0, current - (n - absorbed));
    return { hpCurrent: String(current), hpTemp: String(temp) };
  }

  // Cura não passa do máximo (quando o máximo está preenchido).
  function applyHealing(stats = {}, amount) {
    const n = Math.max(0, toInt(amount) ?? 0), max = toInt(stats.hpMax);
    const current = Math.max(0, toInt(stats.hpCurrent) ?? 0) + n;
    return { hpCurrent: String(max > 0 ? Math.min(max, current) : current) };
  }

  // PV temporários não se somam: fica o maior valor.
  function applyTemp(stats = {}, amount) {
    return { hpTemp: String(Math.max(Math.max(0, toInt(stats.hpTemp) ?? 0), Math.max(0, toInt(amount) ?? 0))) };
  }

  // Espaços de magia dos ranques 1 a 10 que têm máximo preenchido.
  function slotRanks(spellcasting = {}) {
    const slots = spellcasting.slots || {}, ranks = [];
    for (let rank = 1; rank <= 10; rank++) {
      const slot = slots[rank] || {}, max = Math.max(0, toInt(slot.max) ?? 0);
      if (max) ranks.push({ rank, max, used: Math.min(max, Math.max(0, toInt(slot.used) ?? 0)) });
    }
    return ranks;
  }

  // Descanso diário: todos os espaços voltam a ficar livres e o foco volta ao máximo.
  function dailyRest(spellcasting = {}) {
    const slots = {};
    for (const [rank, slot] of Object.entries(spellcasting.slots || {})) slots[rank] = { ...slot, used: '0' };
    const focus = spellcasting.focus || {};
    return { ...spellcasting, slots, focus: { ...focus, current: String(Math.max(0, toInt(focus.max) ?? 0)) } };
  }

  // Tipo da magia a partir da entrada do catálogo: o traço TRUQUE marca truques (às vezes vem colado: "TRUQUEMÁGICO").
  function spellKind(entry = {}) {
    if (entry.type === 'focus') return 'foco';
    if (entry.type === 'ritual') return 'ritual';
    const traits = Array.isArray(entry.traits) ? entry.traits : String(entry.traits || '').split(',');
    return traits.some(trait => normalizeName(trait).startsWith('truque')) ? 'truque' : 'magia';
  }

  const KIND_ORDER = ['truque', 'magia', 'foco', 'ritual'];
  const KIND_LABELS = { truque: 'Truques', foco: 'Magias de foco', ritual: 'Rituais' };
  // Magias em grupos (truques, ranques em ordem, foco, rituais), guardando a posição original na lista.
  function groupSpells(spells = []) {
    const groups = new Map();
    spells.forEach((spell, index) => {
      const kind = KIND_ORDER.includes(spell.kind) ? spell.kind : 'magia';
      const rank = kind === 'magia' ? Math.max(1, toInt(spell.rank) ?? 1) : null;
      const key = kind === 'magia' ? 'magia-' + rank : kind;
      if (!groups.has(key)) groups.set(key, { key, kind, rank, label: KIND_LABELS[kind] || rank + 'º ranque', spells: [] });
      groups.get(key).spells.push({ ...spell, index });
    });
    return [...groups.values()].sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || (a.rank ?? 0) - (b.rank ?? 0));
  }

  // Nomes do catálogo vêm EM MAIÚSCULAS ("BOLA DE FOGO"); na ficha ficam "Bola de Fogo". Texto já misto não muda.
  const SMALL_WORDS = new Set(['a', 'o', 'as', 'os', 'e', 'de', 'da', 'do', 'das', 'dos', 'em', 'na', 'no', 'nas', 'nos', 'com', 'por', 'para', 'ao', 'à']);
  function displayName(name) {
    const text = String(name ?? '').trim();
    if (!text || /[a-zà-ÿ]/.test(text)) return text;
    return text.toLowerCase().split(/(\s+|-)/).map((part, i) => /^(\s+|-)$/.test(part) || (i > 0 && SMALL_WORDS.has(part)) ? part : part.charAt(0).toUpperCase() + part.slice(1)).join('');
  }

  // "Arremesso Enfurecido — Livro 2, p. 77" → "Arremesso Enfurecido".
  function featName(text) { return String(text ?? '').split(/\s+[—–]\s+/)[0].trim(); }

  // Botões [−] [+]: soma o passo e prende entre o mínimo e o máximo; vazio conta 0.
  function stepValue(value, delta, min = 0, max = Infinity) { return String(Math.min(max, Math.max(min, (toCount(value) ?? 0) + (toCount(delta) ?? 0)))); }
  // O nível só muda pelos botões, de 1 a 20; vazio conta 1.
  function levelStep(level, delta) { return stepValue(toCount(level) ?? 1, delta, 1, 20); }

  // Volume por unidade: travessão ou 0 = '0', L = 'L', inteiro = ele mesmo; o resto ('1,5', '2L', texto) fica '' ("?").
  function normalizeBulk(value) {
    const text = String(value ?? '').trim();
    if (/^[—–-]$/.test(text)) return '0';
    if (/^l$/i.test(text)) return 'L';
    return /^\d+$/.test(text) ? String(Number(text)) : '';
  }
  // Moedas: 1 PL = 10 PO = 100 PP = 1.000 PC; o que não é número conta 0.
  function coinsTotal(coins = {}) {
    const count = key => Math.max(0, toCount(coins?.[key]) ?? 0), pl = count('pl'), po = count('po'), pp = count('pp'), pc = count('pc'), copper = pl * 1000 + po * 100 + pp * 10 + pc;
    return { copper, po: copper / 100, count: pl + po + pp + pc };
  }
  // Volume do livro: 10 itens L = 1 (a fração cai) e 1.000 moedas = 1; sobrecarregado acima de 5 + For, máximo 10 + For.
  // Item sem Volume conhecido ('' = "?") não pesa e entra em unknown.
  function bulkSummary(items = [], { coins = {}, str = '0' } = {}) {
    let whole = 0, lightCount = 0, unknown = 0;
    for (const item of items || []) {
      const qty = Math.max(0, toCount(item?.qty) ?? 1), bulk = normalizeBulk(item?.bulk);
      if (!qty) continue;
      if (!bulk) unknown++; else if (bulk === 'L') lightCount += qty; else whole += Number(bulk) * qty;
    }
    const coinBulk = Math.floor(coinsTotal(coins).count / 1000), strMod = toInt(str) ?? 0, limit = 5 + strMod, max = 10 + strMod, bulk = whole + Math.floor(lightCount / 10) + coinBulk;
    return { bulk, light: lightCount % 10, unknown, coinBulk, limit, max, state: bulk > max ? 'acima-do-maximo' : bulk > limit ? 'sobrecarregado' : 'ok' };
  }

  // Notas de item separadas por " · ", sem repetir.
  const splitNotes = value => String(value ?? '').split(' · ').map(note => note.trim()).filter(Boolean);
  const joinNotes = (...values) => [...new Set(values.flatMap(splitNotes))].join(' · ');
  const BULK_TOKEN = /^(?:[—–-]|0|L|\d+\s*L|\d+)$/i;
  // Uma linha do inventário antigo: "Giz ×10* (0)", "Rubi** (8 PO, L)", "Mochila (*) (L)", "Kit (1) — investido".
  // "(*)" diz que o item guarda os marcados com "*". O Volume anotado é o total da linha: com quantidade maior que 1,
  // só 0 e "nL" com n igual à quantidade viram Volume por unidade; o resto fica "?" e a anotação vai para as notas.
  function parseInventoryLine(line) {
    let text = String(line ?? '').trim(), invested = false, holds = '', marker = '', token = '';
    const dashNotes = [], parenNotes = [];
    const unmark = part => String(part).replace(/\*+/g, run => { if (run.length > marker.length) marker = run; return ''; }).replace(/\s+/g, ' ').trim();
    const dropInvested = () => { text = text.replace(/\s+[—–]\s*investid[oa]\s*$/i, () => { invested = true; return ''; }).trim(); };
    dropInvested();
    for (let group; (group = text.match(/\(([^()]*)\)\s*$/)); ) {
      text = text.slice(0, group.index).trim();
      const content = group[1].trim();
      if (/^\*+$/.test(content)) { holds ||= content; continue; }
      const pieces = content.split(',').map(unmark).filter(Boolean), at = token ? -1 : pieces.findIndex(piece => BULK_TOKEN.test(piece));
      if (at >= 0) token = pieces.splice(at, 1)[0];
      if (pieces.length) parenNotes.unshift(at >= 0 ? pieces.join(', ') : unmark(content));
    }
    dropInvested();
    // Travessão com espaços separa nome e nota; hífen nunca ("Meio-orc" fica inteiro).
    const dash = text.match(/\s+[—–]\s+/);
    if (dash) { dashNotes.push(unmark(text.slice(dash.index + dash[0].length))); text = text.slice(0, dash.index); }
    let name = unmark(text), qty = '1';
    const times = name.match(/(?:^|\s|(?=×))[×xX]\s?(\d+)(?=\s|$)/), lead = name.match(/^(\d+)\s+(?=\S)/);
    if (times) { qty = String(Number(times[1])); name = (name.slice(0, times.index) + ' ' + name.slice(times.index + times[0].length)).replace(/\s+/g, ' ').trim(); }
    else if (lead) { qty = String(Number(lead[1])); name = name.slice(lead[0].length); }
    if (!name) return null;
    let bulk = '';
    if (token) {
      const n = Number(qty), light = token.match(/^(\d+)\s*L$/i);
      bulk = n <= 1 ? (light ? (Number(light[1]) === 1 ? 'L' : '') : normalizeBulk(token)) : normalizeBulk(token) === '0' ? '0' : light && Number(light[1]) === n ? 'L' : '';
      if (!bulk) parenNotes.push('Volume anotado: ' + token);
    }
    return { name: name.charAt(0).toUpperCase() + name.slice(1), qty, bulk, invested, notes: joinNotes(...dashNotes, ...parenNotes), marker, holds };
  }

  const INVENTORY_SECTIONS = [['carried', 'carregavel'], ['consumables', 'consumivel'], ['equipped', 'equipado']];
  const STOPWORDS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'com', 'para', 'a', 'o', 'as', 'os', 'em', 'na', 'no', 'nas', 'nos']);
  const itemKey = name => normalizeName(name) || String(name ?? '').trim().toLowerCase();
  const nameWords = name => deaccent(name).toLowerCase().split(/[^a-z0-9]+/).filter(word => word.length >= 2 && !/^\d+$/.test(word) && !STOPWORDS.has(word));
  // "Adaga" casa com "Adagas"; "orc" com "órquica": a palavra curta (até 3 letras) só precisa dividir as 2 primeiras.
  const wordMatch = (a, b) => { const [short, long] = a.length <= b.length ? [a, b] : [b, a]; return long.startsWith(short) || (short.length <= 3 && long.startsWith(short.slice(0, 2))); };
  const similarNames = (a, b) => { const x = nameWords(a), y = nameWords(b), [few, many] = x.length <= y.length ? [x, y] : [y, x]; return few.length > 0 && few.every(word => many.some(other => wordMatch(word, other))); };
  // Inventário antigo (três caixas de texto e a de riqueza) para items[] com aba e moedas; os textos antigos ficam como estão.
  // Casa com os itens que já existem: nome idêntico na lista toda primeiro, depois por palavras, só com par único dos dois lados.
  // O item que já existia mantém id, Volume, investido e quantidade; o nome vem do texto. Rodar de novo no resultado não muda nada.
  function migrateInventory(inventory = {}, items = []) {
    const lines = text => String(text ?? '').split(/\r?\n/), parsed = [], sums = { pl: 0, po: 0, pp: 0, pc: 0 };
    for (const [key, section] of INVENTORY_SECTIONS) for (const line of lines(inventory?.[key])) { const row = parseInventoryLine(line); if (row) parsed.push({ ...row, section }); }
    // Riqueza: "PO: 76" vira moeda (linhas repetidas somam); "PP: confirmar" e "Volume…" ficam só no texto antigo; o resto é item.
    for (const line of lines(inventory?.wealth)) {
      const coin = line.match(/^\s*(PL|PO|PP|PC)\s*:\s*(.*)$/i);
      if (coin) { const n = toCount(coin[2]); if (n != null) sums[coin[1].toLowerCase()] += n; continue; }
      const row = /^\s*volume/i.test(line) ? null : parseInventoryLine(line);
      if (row) parsed.push({ ...row, section: 'carregavel' });
    }
    const holders = new Map();
    for (const row of parsed) if (row.holds && !holders.has(row.holds)) holders.set(row.holds, row);
    const rows = parsed.map(row => {
      const { marker, holds, ...rest } = row, holder = holders.get(marker);
      return { id: '', ...rest, notes: joinNotes(rest.notes, !marker || holder === row ? '' : holder ? 'na ' + holder.name : 'marcado com ' + marker) };
    });
    const pool = (items || []).filter(item => item && typeof item === 'object'), used = new Set(), pairs = rows.map(() => -1);
    rows.forEach((row, r) => { const i = pool.findIndex((item, j) => !used.has(j) && itemKey(item.name) === itemKey(row.name)); if (i >= 0) { pairs[r] = i; used.add(i); } });
    for (let progress = true; progress; ) {
      progress = false;
      pool.forEach((item, i) => {
        if (used.has(i)) return;
        const free = rows.map((row, r) => r).filter(r => pairs[r] < 0 && similarNames(item.name, rows[r].name));
        if (free.length !== 1 || pool.filter((other, j) => !used.has(j) && similarNames(other.name, rows[free[0]].name)).length !== 1) return;
        pairs[free[0]] = i; used.add(i); progress = true;
      });
    }
    const merged = rows.map((row, r) => {
      const item = pool[pairs[r]];
      return !item ? row : { ...item, id: item.id || '', name: row.name, qty: String(item.qty ?? '').trim() ? item.qty : row.qty, bulk: normalizeBulk(item.bulk) ? item.bulk : row.bulk, invested: !!(item.invested || row.invested), notes: joinNotes(item.notes, row.notes), section: row.section };
    });
    const others = pool.filter((item, i) => !used.has(i)).map(item => ({ ...item, section: item.section || 'carregavel' }));
    return { items: [...merged, ...others], coins: Object.fromEntries(Object.entries(sums).map(([key, n]) => [key, String(Math.max(0, n))])) };
  }

  // Condições que têm valor numérico (Assustado 2, Ferido 1…).
  const VALUED_CONDITIONS = ['Assustado', 'Atordoado', 'Condenado', 'Desacelerado', 'Desajeitado', 'Drenado', 'Enfraquecido', 'Estupefato', 'Ferido', 'Morrendo'].map(normalizeName);
  function conditionHasValue(name) { return VALUED_CONDITIONS.includes(normalizeName(name)); }

  const formatNumber = n => String(n).replace('.', ',');

  // Painel do grupo: por nome, ou PV mais baixo primeiro (proporção do máximo; sem máximo vai para o fim).
  function sortSheets(sheets = [], mode = 'nome') {
    const byName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR');
    if (mode !== 'pv') return [...sheets].sort(byName);
    const percent = sheet => hpState(sheet.stats).percent ?? Infinity;
    return [...sheets].sort((a, b) => percent(a) - percent(b) || byName(a, b));
  }

  // Escolhas de talento a partir dos campos antigos feats.* (feats.ancestry, a habilidade da ancestralidade, fica de fora).
  // Citar outro livro ("livro A") marca a escolha como manual (fora dos livros); o texto original fica na nota.
  const FEAT_SLOTS = [['ancestryTalent', 'ancestralidade', '1'], ['background', 'biografia', '1'], ['class1', 'classe', '1'], ['class2', 'classe', '2'], ['skill2', 'pericia', '2'], ['archetype', 'arquetipo', '2']];
  function choicesFromFeats(feats = {}) {
    return FEAT_SLOTS.flatMap(([key, slot, level]) => {
      const text = String(feats?.[key] ?? '').trim(), short = featName(text), name = short.replace(/\s*\([^()]*\)\s*$/, '').trim() || short;
      if (!text) return [];
      const manual = [...deaccent(text).matchAll(/\blivro(?!s\b)\s*(?:do\s+jogador\s*)?([a-z0-9]+)/gi)].some(match => !/^0*[12]$/.test(match[1]));
      return [{ id: '', name, slot, level, manual, note: text === name ? '' : text }];
    });
  }

  // Heranças versáteis dos livros: valem para qualquer ancestralidade.
  const VERSATILE_HERITAGES = Object.freeze(['Aiuvarin', 'Cambiante', 'Crepusculante', 'Dampiro', 'Dracano', 'Dromaar', 'Nefilim']);
  // Gênero na ficha: "Maga" = "Mago", "Elfa" = "Elfo", "Anã" = "Anão", "Investigadora" = "Investigador".
  const genderStem = word => (word.length > 2 ? word.replace(/(?:ao|a|o)$/, '') : word);
  const catalogWords = value => deaccent(value).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).map(genderStem);
  // Nome do catálogo que aparece inteiro, em palavras seguidas, no texto livre ("Cambiante Humano" → "Humano"); o mais longo vence.
  function matchCatalogName(text, names = []) {
    const words = catalogWords(text);
    let best = '';
    for (const name of names || []) {
      const target = catalogWords(name);
      if (!target.length || String(name).length <= best.length) continue;
      for (let i = 0; i + target.length <= words.length; i++) if (target.every((word, j) => words[i + j] === word)) { best = String(name); break; }
    }
    return best;
  }
  // Vaga de talento → filtro da busca: categorias do catálogo e nível máximo (o da vaga, sem passar o do personagem).
  // Classe ou ancestralidade fora do catálogo dá null: a escolha só entra à mão.
  const FIXED_SLOTS = new Map([['pericia', [['geral | perícia'], 'Talentos de perícia']], ['biografia', [['geral | perícia'], 'Talentos de perícia']], ['geral', [['geral'], 'Talentos gerais']], ['arquetipo', [['arquétipo'], 'Arquétipos']]]);
  function choiceQuery(choice = {}, profile = {}, { classes = [], ancestries = [] } = {}) {
    const slot = choice?.slot, maxLevel = slot === 'biografia' ? '1' : String(Math.max(1, Math.min(toCount(choice?.level) ?? 1, toCount(profile?.level) ?? 1))), until = ', nível até ' + maxLevel;
    if (slot === 'classe') { const cls = matchCatalogName(profile?.className, classes); return cls ? { categories: ['classe: ' + cls], maxLevel, label: cls + until } : null; }
    if (slot === 'ancestralidade') {
      const text = (profile?.ancestry ?? '') + ' ' + (profile?.heritage ?? ''), anc = matchCatalogName(text, ancestries), her = matchCatalogName(text, VERSATILE_HERITAGES);
      const categories = [anc && 'ancestralidade: ' + anc, her && 'herança versátil: ' + her].filter(Boolean);
      return categories.length ? { categories, maxLevel, label: [anc, her].filter(Boolean).join(' e ') + until } : null;
    }
    const fixed = FIXED_SLOTS.get(slot);
    return fixed ? { categories: [...fixed[0]], maxLevel, label: fixed[1] + until } : null;
  }
  // Entrada da busca para o nome anotado, só nas categorias da vaga (comparadas como o servidor: sem acento, pontuação nem espaço).
  // "Acrobata" acha "Dedicação de Acrobata", e vice-versa.
  function pickFeat(entries = [], name, categories = []) {
    const wanted = (categories || []).map(normalizeName).filter(Boolean), target = normalizeName(name);
    if (!wanted.length || !target) return null;
    const names = new Set([target, target.replace(/^dedicacaode/, ''), 'dedicacaode' + target].filter(Boolean));
    return (entries || []).find(entry => entry && names.has(normalizeName(entry.name)) && wanted.some(category => normalizeName(entry.category).includes(category))) || null;
  }

  // Subir de nível: o que a tabela da classe dá num nível ("Talento de bárbaro, talento de perícia, …"), separado em vagas
  // de talento (classe, perícia, geral, ancestralidade), incremento de perícia, melhorias de atributo e o resto. A extração do
  // PDF às vezes cola as palavras ("talentogeral"): compara sem espaço nem acento.
  function levelGains(features) {
    const slots = [], other = [];
    let skillIncrease = false, attributeBoosts = false;
    for (const piece of String(features ?? '').split(',').map(part => part.trim()).filter(Boolean)) {
      const key = normalizeName(piece);
      const slot = key.startsWith('talentodepericia') ? 'pericia' : key.startsWith('talentodeancestralidade') ? 'ancestralidade' : key.startsWith('talentogeral') ? 'geral' : key.startsWith('talentode') ? 'classe' : '';
      if (key === 'talento' || key === 'talentode') continue; // sobra da linha cortada na extração do PDF (nível 20)
      if (slot) { if (!slots.includes(slot)) slots.push(slot); }
      else if (key.startsWith('incrementodepericia')) skillIncrease = true;
      else if (key.startsWith('melhoriasdeatributo') || key.startsWith('melhoriadeatributo')) attributeBoosts = true;
      else other.push(piece.charAt(0).toUpperCase() + piece.slice(1));
    }
    return { slots, skillIncrease, attributeBoosts, other };
  }
  // PV ganhos ao subir um nível: os da classe + Constituição (pelo menos 1).
  function hpGain(hpPerLevel, con) { return Math.max(1, (toInt(hpPerLevel) ?? 0) + (toInt(con) ?? 0)); }
  // PV de nível. extra.pvAte é o nível até onde os PV já estão na ficha; sem a marca vale o nível atual, porque a ficha
  // convertida já traz os PV. extra.pvNiveis guarda o que o Somar pôs em cada nível, para o − desfazer só isso.
  const sheetLevel = d => Math.min(20, Math.max(1, toCount(d.profile?.level) ?? 1));
  function hpCountedTo(d) { return toInt(d.extra?.pvAte) ?? sheetLevel(d); }
  // Somar: os PV de cada nível que falta, de pvAte + 1 até o atual. Devolve o total somado (0 se nada faltava).
  function sumLevelHp(d, gain) {
    const level = sheetLevel(d), from = hpCountedTo(d);
    if (level <= from || !(gain > 0)) return 0;
    const extra = d.extra ||= {}, levels = extra.pvNiveis ||= {};
    for (let n = from + 1; n <= level; n++) levels[n] = String(gain);
    const total = gain * (level - from);
    d.stats.hpMax = String((toInt(d.stats.hpMax) ?? 0) + total);
    d.stats.hpCurrent = String((toInt(d.stats.hpCurrent) ?? 0) + total);
    extra.pvAte = String(level);
    return total;
  }
  // Subir e descer gravam a marca antes de mudar o nível. Descer desfaz só a soma daquele nível: PV que já estavam na
  // ficha continuam nela e não voltam a ser oferecidos.
  function levelUp(d) { (d.extra ||= {}).pvAte = String(hpCountedTo(d)); d.profile.level = levelStep(d.profile.level, 1); }
  function levelDown(d) {
    const level = sheetLevel(d), extra = d.extra ||= {}, summed = toInt(extra.pvNiveis?.[level]);
    extra.pvAte = String(hpCountedTo(d));
    if (summed) {
      const max = Math.max(0, (toInt(d.stats.hpMax) ?? 0) - summed);
      d.stats.hpMax = String(max);
      d.stats.hpCurrent = String(Math.min(max, Math.max(0, (toInt(d.stats.hpCurrent) ?? 0) - summed)));
      delete extra.pvNiveis[level];
      extra.pvAte = String(level - 1);
    }
    d.profile.level = levelStep(d.profile.level, -1);
  }

  // Morrendo, Ferido, Condenado e Inconsciente (Remaster), gravados em conditions com os ids do catálogo.
  const conditionOf = (conditions, key) => (conditions || []).find(condition => condition && normalizeName(condition.name) === key);
  const conditionValue = (conditions, key) => { const found = conditionOf(conditions, key); return found ? Math.max(0, toInt(found.value) ?? 1) : 0; };
  // Morre com Morrendo igual a 4 − Condenado (no mínimo 1).
  function dyingState(conditions = []) {
    const dying = conditionValue(conditions, 'morrendo'), wounded = conditionValue(conditions, 'ferido'), doomed = conditionValue(conditions, 'condenado'), limit = Math.max(1, 4 - doomed);
    return { dying, wounded, doomed, unconscious: !!conditionOf(conditions, 'inconsciente'), limit, dead: dying >= limit };
  }
  // Valor maior que 0 grava (no mesmo lugar da lista, ou no fim); 0 ou menos tira a condição. Devolve lista nova.
  function setConditionValue(conditions = [], key, value) {
    const list = (conditions || []).filter(Boolean), n = value === true ? 1 : Math.max(0, toInt(value) ?? 0), at = list.findIndex(condition => normalizeName(condition.name) === key);
    const rest = list.filter(condition => normalizeName(condition.name) !== key);
    if (!n) return rest;
    rest.splice(at < 0 ? rest.length : at, 0, { ...list[at], id: `condition-${key}-livro1`, name: key.charAt(0).toUpperCase() + key.slice(1), value: key === 'inconsciente' ? '' : String(n) });
    return rest;
  }
  // Perder Morrendo (chegar a 0) dá Ferido +1; Inconsciente continua.
  function setDying(conditions = [], value) {
    const { dying, wounded } = dyingState(conditions), next = setConditionValue(conditions, 'morrendo', value);
    return dying > 0 && !conditionOf(next, 'morrendo') ? setConditionValue(next, 'ferido', wounded + 1) : next;
  }
  // Dano que tira PV (o que os temporários absorvem não conta): com Morrendo, +1 (crítico +2); caindo a 0 PV, ou levando dano
  // estável em 0, Morrendo 1 (crítico 2) + Ferido, e Inconsciente. Morrendo para em 4, que já é a morte.
  function afterDamage(conditions = [], { hpAfter, hpDamage, critical = false } = {}) {
    const list = (conditions || []).filter(Boolean), { dying, wounded } = dyingState(list), step = critical ? 2 : 1;
    if ((toInt(hpDamage) ?? 0) <= 0) return list;
    if (dying > 0) return setConditionValue(list, 'morrendo', Math.min(4, dying + step));
    if ((toInt(hpAfter) ?? 0) <= 0) return setConditionValue(setConditionValue(list, 'morrendo', Math.min(4, step + wounded)), 'inconsciente', 1);
    return list;
  }
  // Cura de 0 PV para 1 ou mais: com Morrendo, tira Morrendo e Inconsciente e dá Ferido +1; estável, só acorda.
  function afterHealing(conditions = [], { hpBefore, hpAfter } = {}) {
    const list = (conditions || []).filter(Boolean);
    if ((toInt(hpBefore) ?? 0) > 0 || (toInt(hpAfter) ?? 0) <= 0) return list;
    return setConditionValue(dyingState(list).dying > 0 ? setDying(list, 0) : list, 'inconsciente', 0);
  }

  // Proficiência: destreinado (U) 0; treinado, especialista, mestre e lendário somam o nível + 2, 4, 6 ou 8.
  const PROF_STEP = new Map([['T', 2], ['E', 4], ['M', 6], ['L', 8]]);
  function profBonus(rank, level) { const step = PROF_STEP.get(String(rank ?? '').trim().toUpperCase()); return step ? Math.max(1, toCount(level) ?? 1) + step : 0; }
  const ARMOR_CATEGORIES = ['unarmored', 'light', 'medium', 'heavy'], RANKS = ['U', 'T', 'E', 'M', 'L'];
  // CA do livro: 10 + Des (limitada pela armadura; limite vazio = sem limite) + proficiência na categoria + item.
  // Só sai a conta com categoria e grau preenchidos; é conferência, nunca troca stats.ac sozinha.
  function acFormula({ stats = {}, profile = {}, defense = {} } = {}) {
    const ac = defense?.ac || {}, category = ARMOR_CATEGORIES.includes(ac.category) ? ac.category : '', grade = category ? String(defense?.armorProf?.[category] ?? '').trim().toUpperCase() : '', rank = RANKS.includes(grade) ? grade : '';
    const cap = String(ac.dexCap ?? '').trim() ? toInt(ac.dexCap) : null, dex = Math.min(cap ?? Infinity, toInt(stats?.dex) ?? 0), item = toInt(ac.item) ?? 0, complete = !!(category && rank), prof = complete ? profBonus(rank, profile?.level) : 0;
    return { complete, total: complete ? 10 + dex + prof + item : null, dex, prof, item, rank, category };
  }
  // Escudo: Quebrado com PV até o LQ, Destruído com 0; só soma na CA erguido e inteiro. PV atual vazio = cheio.
  function shieldState(shield = {}) {
    const bonus = toInt(shield?.bonus) ?? 0, hpMax = toCount(shield?.hpMax), hp = toCount(shield?.hp) ?? hpMax, bt = toCount(shield?.bt), hardness = toCount(shield?.hardness);
    const has = bonus > 0, destroyed = hpMax != null && hp != null && hp <= 0, broken = !destroyed && bt != null && hp != null && hp <= bt, raised = !!shield?.raised;
    return { has, bonus, hp, hpMax, bt, hardness, broken, destroyed, raised, active: has && raised && !broken && !destroyed };
  }
  // CA total da mesa: a CA da ficha + escudo erguido + CA adicional (pode ser negativa), com o detalhe "17 + escudo 2".
  function effectiveAc({ stats = {}, defense = {} } = {}) {
    const base = toInt(stats?.ac);
    if (base == null) return null;
    const state = shieldState(defense?.shield), shield = state.active ? state.bonus : 0, extra = toInt(defense?.acBonus) ?? 0;
    const text = [String(base), shield ? '+ escudo ' + shield : '', extra > 0 ? '+ ' + extra : extra < 0 ? '− ' + -extra : ''].filter(Boolean).join(' ');
    return { total: base + shield + extra, base, shield, extra, text };
  }
  // Entrada do catálogo (GET /api/entries/:id) → campos da Defesa; sem número no catálogo (itens mágicos) dá null.
  const entryCategory = entry => normalizeName(entry?.category || entry?.data?.category);
  const entryField = (entry, key) => entry?.data?.[key] ?? entry?.[key];
  const ARMOR_KINDS = new Map([['armaduraleve', 'light'], ['armaduramedia', 'medium'], ['armadurapesada', 'heavy']]);
  function armorFromEntry(entry) {
    const category = ARMOR_KINDS.get(entryCategory(entry)), bonus = toInt(entryField(entry, 'acBonus')), cap = String(entryField(entry, 'dexCap') ?? '').trim();
    return category && bonus != null ? { category, dexCap: toInt(cap) == null ? '' : cap, item: String(bonus) } : null;
  }
  // "+2/+4" é o escudo de corpo (+4 ao Buscar Cobertura); "12 (6)" são PV máximos e LQ.
  function shieldFromEntry(entry) {
    const bonus = String(entryField(entry, 'acBonus') ?? '').match(/^\s*([+−–-]?\d+)(?:\s*\/\s*\+?(\d+))?/), hp = String(entryField(entry, 'hitPoints') ?? '').match(/^\s*(\d+)(?:\s*\((\d+)\))?/), hardness = toCount(entryField(entry, 'hardness'));
    if (!entryCategory(entry).startsWith('escudo') || !bonus || !hp || hardness == null) return null;
    return { bonus: String(toInt(bonus[1])), cover: bonus[2] ? String(Number(bonus[2])) : '', hardness: String(hardness), hpMax: String(Number(hp[1])), bt: hp[2] ? String(Number(hp[2])) : '' };
  }

  window.FichaCalc = {
    toInt, toCount, normalizeName, formatModifier, mapSequence, hpState, applyDamage, applyHealing, applyTemp, slotRanks, dailyRest, spellKind, groupSpells, displayName, featName, conditionHasValue, formatNumber, sortSheets,
    stepValue, levelStep, normalizeBulk, bulkSummary, coinsTotal, parseInventoryLine, migrateInventory,
    choicesFromFeats, VERSATILE_HERITAGES, matchCatalogName, choiceQuery, pickFeat, levelGains, hpGain, hpCountedTo, sumLevelHp, levelUp, levelDown,
    dyingState, setConditionValue, setDying, afterDamage, afterHealing,
    profBonus, acFormula, shieldState, effectiveAc, armorFromEntry, shieldFromEntry,
  };
})();
