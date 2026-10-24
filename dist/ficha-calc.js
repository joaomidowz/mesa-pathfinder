// Contas puras da ficha para as páginas Sessão e Grupo (window.FichaCalc): sem DOM e sem rede.
// Os valores da ficha são texto ('17', '+7', '', '7,5', até lixo): toda conta tolera isso e devolve texto.
(() => {
  const toInt = value => { const match = String(value ?? '').trim().replace(/^\+/, '').replace(/^[−–]/, '-').match(/^-?\d+/); return match ? Number(match[0]) : null; };
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

  // Volume: L vale 0,1; vazio ou travessão vale 0; o resto, número (com vírgula ou ponto).
  function bulkValue(bulk) {
    const text = String(bulk ?? '').trim().toUpperCase();
    if (!text || text === '—' || text === '-') return 0;
    if (text === 'L') return 0.1;
    const n = Number(text.replace(',', '.'));
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  function totalBulk(items = []) {
    let total = 0, unknown = false;
    for (const item of items) {
      const each = bulkValue(item.bulk), qty = Math.max(0, toInt(item.qty) ?? 1);
      if (each == null) unknown = true; else total += each * qty;
    }
    return { total: Math.round(total * 10) / 10, unknown };
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

  window.FichaCalc = { toInt, normalizeName, formatModifier, mapSequence, hpState, applyDamage, applyHealing, applyTemp, slotRanks, dailyRest, spellKind, groupSpells, displayName, featName, bulkValue, totalBulk, conditionHasValue, formatNumber, sortSheets };
})();
