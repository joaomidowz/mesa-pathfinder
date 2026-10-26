// Página do personagem, organizada pelo que se quer fazer: Combate (batalhar), Habilidades (consultar regras e o que o
// personagem sabe), Evoluir (subir de nível), Itens e Ficha (identidade e anotações), com o topo fixo e o botão Salvar.
// Lê e grava a mesma ficha do app.js (window.Mesa, docs/modelo-da-ficha.md): altera Mesa.data e chama Mesa.dirty(), que
// só marca a ficha como não salva (ela vai para a nuvem no Salvar ou quando a página perde o foco).
// Os campos editáveis ficam fixos no HTML (data-bind do app.js); aqui só se desenham as partes de exibição, e só quando o
// HTML delas muda, para ninguém perder o foco nem sentir a página travar no meio da digitação.
(() => {
  const { escapeHtml, bodyHtml, bookLink, metaLine, TYPE_LABELS, BOOK_NAMES } = window.Regras;
  const C = window.FichaCalc;
  const root = document.querySelector('[data-session]');
  const ruleDialog = document.getElementById('rule-dialog');
  const pickerDialog = document.getElementById('picker-dialog');
  const entryCache = new Map();
  const catalog = { classes: [], ancestries: [], classEntries: [], loaded: false };
  let ruleToken = 0, pickerToken = 0, searchToken = 0, tab = 'combate', invTab = 'carregavel', conversionPending = false;

  const TABS = ['combate', 'habilidades', 'evoluir', 'itens', 'ficha'];
  const ATTRIBUTES = [['str', 'Força'], ['dex', 'Destreza'], ['con', 'Constituição'], ['int', 'Inteligência'], ['wis', 'Sabedoria'], ['cha', 'Carisma']];
  const HP_LABELS = { ok: 'PV cheios', ferido: 'Com dano', critico: 'Em perigo', caido: '0 PV' };
  const TRADITIONS = { arcana: 'Arcana', divina: 'Divina', ocultista: 'Ocultista', primal: 'Primal' };
  const SECTIONS = [['carregavel', 'Carregável'], ['consumivel', 'Consumíveis'], ['equipado', 'Equipados']];
  const SLOT_LABELS = { classe: 'Talento de classe', ancestralidade: 'Talento de ancestralidade', pericia: 'Talento de perícia', geral: 'Talento geral', arquetipo: 'Arquétipo', biografia: 'Talento da biografia' };
  const SLOT_SHORT = { classe: 'Classe', ancestralidade: 'Ancestralidade', pericia: 'Perícia', geral: 'Geral', arquetipo: 'Arquétipo', biografia: 'Biografia' };
  const BULKS = ['', '0', 'L', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
  // Morrendo e Ferido têm controle próprio no Combate: ficam fora da lista e da busca de condições.
  const OWN_CONTROL = new Set(['Morrendo', 'Ferido'].map(C.normalizeName));
  const ARMOR_SVG = '<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><path d="M22 6l10 5 10-5 16 9-5 16-7-3v26c-9 5-19 5-28 0V28l-7 3-5-16z" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/></svg>';
  const SHIELD_SVG = '<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><path d="M32 5l23 8v17c0 15-10 25-23 30C19 55 9 45 9 30V13z" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/></svg>';
  const SKULL_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" fill-rule="evenodd" d="M12 2C7.03 2 3 5.8 3 10.5c0 2.9 1.5 5 3.5 6.2V20a1 1 0 0 0 1 1h1.5v-2.2h1.5V21h3v-2.2h1.5V21h1.5a1 1 0 0 0 1-1v-3.3c2-1.2 3.5-3.3 3.5-6.2C21 5.8 16.97 2 12 2zM8.5 9a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm7 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM12 13.2l-1.3 2.3h2.6z"/></svg>';

  const data = () => window.Mesa.data;
  const readOnly = () => window.Mesa.readOnly();
  const q = selector => root.querySelector(selector);
  const lock = () => readOnly() ? 'disabled' : '';
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
  const signed = n => n > 0 ? '+' + n : n < 0 ? '−' + Math.abs(n) : '0';
  const sectionOf = item => SECTIONS.some(([key]) => key === item?.section) ? item.section : 'carregavel';
  const charLevel = () => Math.min(20, Math.max(1, C.toCount(data().profile?.level) ?? 1));
  const tile = (label, value, extra = '') => `<div class="tile ${extra}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || '—')}</strong></div>`;
  const counter = ({ label, value, dec, inc, extra = '' }) => `<div class="counter ${extra}"><span class="counter-label">${escapeHtml(label)}</span><button type="button" class="mini" data-action="${dec}" data-mutate aria-label="Diminuir ${escapeHtml(label)}">−</button><output>${escapeHtml(String(value))}</output><button type="button" class="mini" data-action="${inc}" data-mutate aria-label="Aumentar ${escapeHtml(label)}">+</button></div>`;
  const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  // Só troca o HTML quando ele mudou: redesenhar o que já está igual custa repintura e trava o celular.
  function setHtml(el, html) { if (!el || el.__html === html) return false; el.innerHTML = html; el.__html = html; return true; }
  // out(seletor).html = … desenha em todos os lugares com aquele seletor (a mesma parte pode estar em duas abas).
  const out = selector => ({ set html(value) { root.querySelectorAll(selector).forEach(el => setHtml(el, value)); } });
  const view = el => ({ set html(value) { setHtml(el, value); } });

  function getEntry(id) {
    if (!entryCache.has(id)) entryCache.set(id, window.Mesa.api('entries/' + encodeURIComponent(id)).catch(error => { entryCache.delete(id); throw error; }));
    return entryCache.get(id);
  }

  // Monta /api/search: category pode repetir (OU no servidor) e maxLevel limita pelo nível do personagem.
  function searchPath({ type = '', term = '', categories = [], maxLevel = '', limit = 60 } = {}) {
    const params = new URLSearchParams();
    if (type) params.set('type', type);
    if (term) params.set('q', term);
    for (const category of categories) params.append('category', category);
    if (maxLevel) params.set('maxLevel', maxLevel);
    params.set('limit', String(limit));
    return 'search?' + params;
  }

  // --- Desenho por partes: só exibição, nenhum campo que alguém esteja digitando ---
  function renderTop() {
    const d = data(), profile = d.profile || {}, stats = d.stats || {};
    const hp = C.hpState(stats), ac = C.effectiveAc({ stats, defense: d.defense || {} }), dying = C.dyingState(d.conditions || []);
    const className = String(profile.className || '').trim(), name = profile.name || 'Personagem sem nome';
    const subtitle = [className ? `${className} ${charLevel()}` : `Nível ${charLevel()}`, profile.ancestry].filter(Boolean).join(' · ');
    if (q('[data-name]').textContent !== name) q('[data-name]').textContent = name;
    if (q('[data-subtitle]').textContent !== subtitle) q('[data-subtitle]').textContent = subtitle;
    out('[data-top-vitals]').html = `<span class="top-hp" data-state="${hp.state}"><span class="top-label">PV</span><strong>${hp.current}</strong><span class="muted">/${hp.max ?? '—'}</span>${hp.temp ? `<span class="top-temp">+${hp.temp}</span>` : ''}<span class="top-bar"><span style="width:${hp.percent ?? 100}%"></span></span></span><span class="top-ac"><span class="top-label">CA</span><strong>${ac ? ac.total : '—'}</strong></span><span class="top-skulls">${[1, 2, 3, 4].map(n => `<span class="skull-icon ${n <= dying.dying ? 'on' : ''} ${n >= dying.limit ? 'fatal' : ''}">${SKULL_SVG}</span>`).join('')}</span>${dying.wounded ? `<span class="top-wounded">Ferido ${dying.wounded}</span>` : ''}${dying.dead ? '<span class="top-dead">Morto</span>' : ''}`;
    const label = `PV ${hp.current} de ${hp.max ?? '—'}${hp.temp ? `, ${hp.temp} temporários` : ''}, CA ${ac ? ac.total : '—'}, Morrendo ${dying.dying}${dying.wounded ? `, Ferido ${dying.wounded}` : ''}. Abrir o Combate`;
    if (q('[data-top-vitals]').getAttribute('aria-label') !== label) q('[data-top-vitals]').setAttribute('aria-label', label);
    q('[data-readonly-chip]').hidden = !readOnly();
    root.classList.toggle('is-readonly', readOnly());
    if (document.title !== name + ' · Mesa Pathfinder') document.title = name + ' · Mesa Pathfinder';
  }

  function renderHp() {
    const hp = C.hpState(data().stats || {});
    out('[data-hp-display]').html = `<div class="hp" data-state="${hp.state}"><div class="hp-numbers"><span class="hp-current">${hp.current}</span><span class="hp-max">/ ${hp.max ?? '—'} PV</span><span class="hp-state">${hp.max == null ? '' : HP_LABELS[hp.state]}</span></div><div class="hp-bar"><span style="width:${hp.percent ?? 100}%"></span></div></div>`;
    out('[data-temp-counter]').html = counter({ label: 'Temporários', value: hp.temp, dec: 'temp-dec', inc: 'temp-inc' }) + '<span class="small muted">Não se somam: fica o maior.</span>';
  }

  function renderAcCard() {
    const d = data(), ac = C.effectiveAc({ stats: d.stats || {}, defense: d.defense || {} });
    const detail = !ac ? 'Preencha a CA em Evoluir' : ac.text !== String(ac.total) ? ac.text : '';
    out('[data-ac-card]').html = `<div class="badge ac-badge">${ARMOR_SVG}<strong>${ac ? ac.total : '—'}</strong></div><div class="badge-label">CA</div>${detail ? `<small class="badge-detail">${escapeHtml(detail)}</small>` : ''}`;
  }

  function renderShield() {
    const s = C.shieldState(data().defense?.shield || {}), card = q('[data-shield-card]');
    card.hidden = !s.has;
    if (!s.has) { setHtml(card, ''); return; }
    const status = s.destroyed ? 'Destruído' : s.broken ? 'Quebrado' : s.raised ? 'Erguido' : 'Abaixado';
    const hpText = s.hpMax != null ? `${s.hp}/${s.hpMax}` : String(s.hp ?? '—');
    view(card).html = `<button type="button" class="badge shield-badge ${s.active ? 'on' : ''}" data-action="shield-raise" aria-pressed="${s.active}" aria-label="Escudo +${s.bonus}: ${status}. Tocar ergue ou abaixa" ${s.broken || s.destroyed || readOnly() ? 'disabled' : ''}>${SHIELD_SVG}<strong>+${s.bonus}</strong></button><div class="badge-label">Escudo</div><small class="badge-detail">${status} · PV ${hpText}</small>`;
  }

  // Faixa do Combate: salvamentos à vista, CA adicional, controles do escudo e o aviso de carga.
  function renderCombatStrip() {
    const d = data(), stats = d.stats || {}, defense = d.defense || {}, s = C.shieldState(defense.shield || {});
    const extra = C.toInt(defense.acBonus) ?? 0, sum = C.bulkSummary(d.items || [], { coins: d.inventory?.coins || {}, str: stats.str });
    const save = (label, value) => `<div class="save-chip"><span>${label}</span><strong>${C.formatModifier(value)}</strong></div>`;
    const hpText = s.hpMax != null ? `${s.hp}/${s.hpMax}` : String(s.hp ?? '—'), broken = s.destroyed ? 'Destruído' : s.broken ? 'Quebrado' : '';
    const cover = C.toInt(defense.shield?.cover);
    out('[data-combat-strip]').html = `<div class="save-chips">${save('Fortitude', stats.fort)}${save('Reflexos', stats.reflex)}${save('Vontade', stats.will)}</div>`
      + `<div class="strip-row">${counter({ label: 'CA adicional', value: signed(extra), dec: 'acb-dec', inc: 'acb-inc' })}${s.active && extra > 0 ? '<span class="small accent">Escudo e cobertura não se somam: vale o maior.</span>' : ''}</div>`
      + (s.has ? `<div class="strip-row">${counter({ label: 'PV do escudo', value: hpText, dec: 'shp-dec', inc: 'shp-inc' })}<span class="chip">Dureza <strong>${s.hardness ?? '—'}</strong></span><span class="chip">LQ <strong>${s.bt ?? '—'}</strong></span>${broken ? `<span class="chip danger-chip">${broken}: não soma na CA</span>` : ''}</div><p class="small muted" data-mutate>Toque no escudo para erguer ou abaixar; erguido vale até o começo do seu próximo turno.${cover ? ` Escudo de corpo: +${cover} ao Buscar Cobertura.` : ''}</p>` : '')
      + (sum.state === 'ok' ? '' : `<p class="encumbered">${sum.state === 'sobrecarregado' ? 'Sobrecarregado: Desajeitado 1 e −3 m de deslocamento.' : 'Acima do máximo de Volume: não dá para carregar tudo.'}</p>`);
  }

  function renderPerception() {
    out('[data-perception-card]').html = `<div class="badge perception-badge"><strong>${C.formatModifier(data().stats?.perception)}</strong></div><div class="badge-label">Percepção</div>`;
  }

  function renderDying() {
    const d = data(), s = C.dyingState(d.conditions || []), hero = Math.max(0, Math.min(3, C.toInt(d.heroPoints) ?? 0));
    const skulls = [1, 2, 3, 4].map(n => `<button type="button" class="skull ${n <= s.dying ? 'on' : ''} ${n >= s.limit ? 'fatal' : ''}" data-action="dying" data-value="${n}" aria-pressed="${n <= s.dying}" aria-label="Morrendo ${n}${n >= s.limit ? ': morte' : ''}" ${lock()}>${SKULL_SVG}</button>`).join('');
    const state = s.dead ? '<strong class="danger">Morto</strong>' : s.dying ? `Morrendo ${s.dying}${s.unconscious ? ' · inconsciente' : ''}` : s.unconscious ? 'Estável e inconsciente' : 'Fora de perigo';
    q('[data-dying-card]').classList.toggle('is-dying', s.dying > 0 || s.dead);
    out('[data-dying-card]').html = `<div class="dying-grid"><div><div class="panel-head"><h2>Morrendo</h2><span class="small muted">${state}</span></div><div class="skulls">${skulls}</div>${s.doomed ? `<p class="small muted">Condenado ${s.doomed}: morre em Morrendo ${s.limit}.</p>` : ''}<p class="small muted" data-mutate>Cair a 0 PV marca sozinho; toque numa caveira para ajustar.</p></div><div class="dying-side">${counter({ label: 'Ferido', value: s.wounded, dec: 'wounded-dec', inc: 'wounded-inc' })}<div class="hero-points"><span>Heroísmo</span><div class="pips">${[0, 1, 2].map(i => `<button type="button" class="pip ${i < hero ? '' : 'spent'}" data-action="hero" data-index="${i}" aria-label="Ponto de heroísmo ${i + 1}: ${i < hero ? 'disponível' : 'vazio'}" ${lock()}></button>`).join('')}</div></div>${counter({ label: 'Sorte', value: Math.max(0, C.toCount(d.luck) ?? 0), dec: 'luck-dec', inc: 'luck-inc' })}</div></div>`;
  }

  function renderDefenses() {
    const stats = data().stats || {}, speed = String(stats.speed ?? '').trim();
    out('[data-defenses]').html = `<div class="panel-head"><h2>Atributos</h2></div><div class="tiles">${ATTRIBUTES.map(([key, label]) => tile(label, C.formatModifier(stats[key]))).join('')}${tile('Deslocamento', speed ? speed + ' m' : '')}${tile('CD de classe', stats.classDc)}</div>`;
  }

  function renderConditions() {
    const list = (data().conditions || []).map((condition, index) => ({ ...condition, index })).filter(condition => !OWN_CONTROL.has(C.normalizeName(condition.name)));
    out('[data-conditions]').html = `<div class="panel-head"><div><h2>Condições</h2><p>Toque no nome para ler a regra.</p></div><button type="button" class="btn" data-action="condition-add" data-mutate>+ Condição</button></div>
      <div class="condition-list">${list.length ? list.map(condition => `<div class="condition"><button type="button" class="condition-name" data-action="condition-open" data-index="${condition.index}">${escapeHtml(condition.name)}${condition.value ? ` <strong>${escapeHtml(condition.value)}</strong>` : ''}</button>${C.conditionHasValue(condition.name) ? `<button type="button" class="mini" data-action="condition-dec" data-index="${condition.index}" data-mutate aria-label="Diminuir ${escapeHtml(condition.name)}">−</button><button type="button" class="mini" data-action="condition-inc" data-index="${condition.index}" data-mutate aria-label="Aumentar ${escapeHtml(condition.name)}">+</button>` : ''}<button type="button" class="mini" data-action="condition-remove" data-index="${condition.index}" data-mutate aria-label="Tirar ${escapeHtml(condition.name)}">×</button></div>`).join('') : '<p class="empty">Nenhuma condição ativa.</p>'}</div>`;
  }

  function renderStrikes() {
    const attacks = data().attacks || [];
    out('[data-strikes]').html = `<div class="panel-head"><div><h2>Golpes</h2><p>Bônus do 1º, 2º e 3º ataque no turno, com a penalidade de ataques múltiplos.</p></div></div>${attacks.length ? attacks.map(attack => {
      const sequence = C.mapSequence(attack.bonus, attack.traits);
      return `<article class="strike"><div class="strike-head"><h3>${escapeHtml(attack.name || 'Golpe')}</h3>${sequence ? `<div class="strike-map">${sequence.map((value, i) => `<span class="${i ? 'later' : ''}">${value}</span>`).join('<span class="sep">/</span>')}</div>` : ''}</div>${attack.damage ? `<p class="strike-damage">${escapeHtml(attack.damage)}</p>` : ''}${attack.traits ? `<p class="small muted">${escapeHtml(attack.traits)}</p>` : ''}${attack.notes ? `<p class="small">${escapeHtml(attack.notes)}</p>` : ''}</article>`;
    }).join('') : '<p class="empty">Nenhum golpe ainda. Cadastre em <strong>Editar armas e ataques</strong>, logo abaixo.</p>'}`;
  }

  function renderSkills() {
    const skills = data().skills || {};
    const rows = Object.entries(window.Mesa.skillInfo).map(([key, [name]]) => ({ key, name, value: skills[key] })).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    out('[data-skill-list]').html = `<div class="panel-head"><div><h2>Perícias</h2><p>Toque para ver para que serve cada uma.</p></div></div><div class="skill-grid">${rows.map(row => `<button type="button" class="skill ${(C.toInt(row.value) ?? 0) <= 0 ? 'low' : ''}" data-action="skill" data-key="${row.key}"><span>${escapeHtml(row.name)}</span><strong>${C.formatModifier(row.value)}</strong></button>`).join('')}</div>`;
  }

  function spellList(spells) {
    return `<div class="row-list">${C.groupSpells(spells).map(group => `<h3 class="group-title">${escapeHtml(group.label)}</h3>${group.spells.map(spell => `<button type="button" class="row-button" data-action="spell-open" data-index="${spell.index}"><span>${escapeHtml(C.displayName(spell.name) || 'Magia sem nome')}</span>${spell.notes ? `<small>${escapeHtml(spell.notes)}</small>` : ''}</button>`).join('')}`).join('')}</div>`;
  }

  // Combate: o que se usa no turno (ataque, CD, espaços, foco, descanso). A gestão fica na Ficha.
  function renderSpellsUse() {
    const d = data(), casting = d.spellcasting || {}, spells = d.spells || [], ranks = C.slotRanks(casting);
    const focusMax = Math.max(0, C.toInt(casting.focus?.max) ?? 0), focusNow = Math.min(focusMax, Math.max(0, C.toInt(casting.focus?.current) ?? 0));
    const summary = [TRADITIONS[casting.tradition] || casting.tradition, casting.kind].filter(Boolean).join(' · ');
    const pips = (count, filled, action, label, extra = '') => Array.from({ length: count }, (_, i) => `<button type="button" class="pip ${filled(i) ? '' : 'spent'}" data-action="${action}" data-index="${i}" ${extra} aria-label="${label(i)}" ${lock()}></button>`).join('');
    const box = q('[data-spells-use]');
    const hasCasting = summary || casting.attack || casting.dc || ranks.length || focusMax || spells.length;
    box.hidden = !hasCasting;
    if (!hasCasting) { view(box).html = ''; return; }
    view(box).html = `<div class="panel-head"><div><h2>Magias</h2><p>${escapeHtml(summary || 'Toque numa magia para ler o texto completo.')}</p></div></div>
      ${casting.attack || casting.dc ? `<div class="tiles">${tile('Ataque de magia', C.formatModifier(casting.attack))}${tile('CD de magia', casting.dc, 'accent')}</div>` : ''}
      ${ranks.length || focusMax ? `<div class="slots">${ranks.map(slot => `<div class="slot-row"><span class="slot-label">${slot.rank}º</span><div class="pips">${pips(slot.max, i => i >= slot.used, 'slot', i => `Espaço ${i + 1} de ${slot.rank}º ranque: ${i < slot.used ? 'usado' : 'livre'}`, `data-rank="${slot.rank}"`)}</div><span class="small muted">${plural(slot.max - slot.used, 'livre', 'livres')}</span></div>`).join('')}${focusMax ? `<div class="slot-row"><span class="slot-label">Foco</span><div class="pips">${pips(focusMax, i => i < focusNow, 'focus', i => `Ponto de foco ${i + 1}: ${i < focusNow ? 'disponível' : 'gasto'}`)}</div><span class="small muted">${focusNow}/${focusMax}</span></div>` : ''}<div class="head-actions section-space"><button type="button" class="btn" data-action="rest" data-mutate>Descanso diário</button></div></div>` : ''}
      ${spells.length ? spellList(spells) : ''}`;
  }

  function renderSpellBook() {
    const spells = data().spells || [];
    out('[data-spell-book]').html = spells.length ? spellList(spells) : `<p class="empty">${readOnly() ? 'Sem magias nesta ficha.' : 'Nenhuma magia ainda. Use + Magia para trazer do catálogo.'}</p>`;
  }

  // Combate: talentos (Escolhas) e habilidades, para ler a regra no meio do turno.
  function renderFeats() {
    const d = data(), choices = (d.choices || []).map((choice, index) => ({ ...choice, index })).filter(choice => String(choice.name || '').trim());
    // Habilidade antiga com o mesmo nome de uma escolha (a conversão trouxe as duas) não aparece duas vezes.
    const chosen = new Set(choices.map(choice => C.normalizeName(C.featName(choice.name))));
    const abilities = Object.entries(d.abilities || {}).filter(([, ability]) => !chosen.has(C.normalizeName(C.featName(ability.name || ''))));
    out('[data-feat-list]').html = `<div class="panel-head"><div><h2>Talentos e habilidades</h2><p>Toque para ler a regra do livro ou a sua anotação.</p></div></div>${choices.length || abilities.length ? `<div class="row-list">${choices.length ? `<h3 class="group-title">Escolhas</h3>${choices.map(choice => `<button type="button" class="row-button" data-action="choice-open" data-index="${choice.index}"><span>${escapeHtml(C.displayName(choice.name))}</span><small>${escapeHtml(SLOT_SHORT[choice.slot] || '')}${choice.level ? ' · nível ' + escapeHtml(choice.level) : ''}</small></button>`).join('')}` : ''}${abilities.length ? `<h3 class="group-title">Habilidades e ações</h3>${abilities.map(([key, ability]) => `<button type="button" class="row-button" data-action="ability-open" data-key="${escapeHtml(key)}"><span>${escapeHtml(ability.name || 'Habilidade')}</span>${ability.source ? `<small>${escapeHtml(ability.source)}</small>` : ''}</button>`).join('')}` : ''}</div>` : '<p class="empty">Nada anotado ainda. Os talentos entram em <a class="accent" href="#evoluir">Evoluir</a> e as habilidades em <strong>Editar habilidades e ações</strong>.</p>'}`;
  }

  // Ficha: a conta do livro confere a CA; só o botão Usar troca a CA da ficha.
  function renderAcCheck() {
    const d = data(), f = C.acFormula({ stats: d.stats || {}, profile: d.profile || {}, defense: d.defense || {} });
    q('[data-formula="dex"]').textContent = f.dex == null ? '—' : C.formatModifier(f.dex);
    out('[data-formula="prof"]').html = f.complete ? `${C.formatModifier(f.prof)}<sup>${f.rank === 'U' ? '—' : escapeHtml(f.rank)}</sup>` : '—';
    const box = q('[data-ac-check]'), sheet = C.toInt(d.stats?.ac);
    if (!f.complete) { view(box).html = 'Escolha a armadura usada e a proficiência nela para conferir a CA.'; return; }
    view(box).html = `Conta do livro: <strong>${f.total}</strong>` + (sheet === f.total ? ' · confere com a ficha.' : ` · a ficha diz ${sheet ?? '—'} <button type="button" class="btn small-btn" data-action="ac-use" data-mutate>Usar ${f.total}</button>`);
  }

  function renderChoices() {
    const list = (data().choices || []).map((choice, index) => ({ ...choice, index }));
    const groups = new Map();
    for (const choice of list) { const level = C.toCount(choice.level) ?? 0; if (!groups.has(level)) groups.set(level, []); groups.get(level).push(choice); }
    out('[data-choices]').html = list.length ? [...groups.keys()].sort((a, b) => a - b).map(level => `<h3 class="group-title">${level ? 'Nível ' + level : 'Sem nível'}</h3>${groups.get(level).map(choice => `<div class="choice-row"><button type="button" class="row-button" data-action="choice-open" data-index="${choice.index}"><span>${escapeHtml(C.displayName(choice.name) || 'Escolha sem nome')}</span><small>${escapeHtml(SLOT_SHORT[choice.slot] || choice.slot || '')}${choice.manual ? ' <span class="seal">fora dos livros</span>' : ''}</small></button><button type="button" class="info-button" data-action="choice-swap" data-index="${choice.index}" data-mutate>Trocar</button><button type="button" class="mini" data-action="choice-remove" data-index="${choice.index}" data-mutate aria-label="Remover ${escapeHtml(choice.name)}">×</button></div>`).join('')}`).join('') : `<p class="empty">${readOnly() ? 'Nenhuma escolha nesta ficha.' : 'Nenhuma escolha ainda. Escolha a vaga e o nível e toque em + Escolha.'}</p>`;
  }

  function choiceHint(slot) {
    if (!catalog.loaded) return 'Carregando os nomes dos livros…';
    if (slot === 'classe') return 'Classe fora dos livros ou não reconhecida em Identidade: a escolha entra à mão e fica marcada para o mestre.';
    return 'Ancestralidade não reconhecida em Identidade: confira o nome, ou anote à mão (fica marcada para o mestre).';
  }

  let choiceFormLevel = 0;
  function renderChoiceForm() {
    const slot = q('[data-choice-slot]'), levelSelect = q('[data-choice-level]'), max = charLevel();
    // Subiu ou desceu de nível: a vaga nova passa a ser a do nível atual.
    if (max !== choiceFormLevel) { levelSelect.innerHTML = Array.from({ length: max }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join(''); levelSelect.value = String(max); choiceFormLevel = max; }
    if (slot.value === 'biografia') levelSelect.value = '1';
    else if (!levelSelect.value || Number(levelSelect.value) > max) levelSelect.value = String(max);
    levelSelect.disabled = readOnly() || slot.value === 'biografia';
    const query = C.choiceQuery({ slot: slot.value, level: levelSelect.value }, data().profile || {}, catalog);
    q('[data-choice-hint]').textContent = query ? 'Lista para: ' + query.label + '.' : choiceHint(slot.value);
  }

  function bulkOptions(current) {
    const value = String(current ?? '');
    return (BULKS.includes(value) ? BULKS : [...BULKS, value]).map(option => `<option value="${escapeHtml(option)}">${option === '' ? '?' : escapeHtml(option)}</option>`).join('');
  }

  // Tabela do inventário: redesenhada só ao incluir, tirar ou trocar de aba; quantidade e Volume se editam no lugar.
  function renderInventory() {
    const items = data().items || [];
    const counts = Object.fromEntries(SECTIONS.map(([key]) => [key, 0]));
    items.forEach(item => counts[sectionOf(item)]++);
    out('[data-inv-tabs]').html = SECTIONS.map(([key, label]) => `<button type="button" role="tab" aria-selected="${key === invTab}" data-action="inv-tab" data-section="${key}">${label} <span class="count">${counts[key]}</span></button>`).join('');
    const rows = items.map((item, index) => ({ item, index })).filter(({ item }) => sectionOf(item) === invTab);
    const body = q('[data-inv-body]');
    const html = rows.length ? `<div class="inv-head" aria-hidden="true"><span>Item</span><span>Qtd</span><span>Volume</span></div>${rows.map(({ item, index }) => {
      const name = C.displayName(item.name) || 'Item', extra = [item.invested ? 'investido' : '', item.notes].filter(Boolean).join(' · ');
      return `<div class="inv-row"><button type="button" class="inv-name" data-action="item-open" data-index="${index}"><span>${escapeHtml(name)}</span>${extra ? `<small>${escapeHtml(extra)}</small>` : ''}</button><div class="stepper"><button type="button" class="mini" data-action="qty-dec" data-index="${index}" data-mutate aria-label="Menos ${escapeHtml(name)}">−</button><input class="qty" data-bind="items.${index}.qty" inputmode="numeric" aria-label="Quantidade de ${escapeHtml(name)}"><button type="button" class="mini" data-action="qty-inc" data-index="${index}" data-mutate aria-label="Mais ${escapeHtml(name)}">+</button></div><select class="bulk" data-bind="items.${index}.bulk" aria-label="Volume de ${escapeHtml(name)}">${bulkOptions(item.bulk)}</select></div>`;
    }).join('')}` : `<p class="empty">${readOnly() ? 'Nada nesta aba.' : 'Nada nesta aba ainda. Use + Item para trazer do catálogo ou anotar à mão.'}</p>`;
    if (setHtml(body, html)) window.Mesa.bindAll(body);
    renderTotals();
  }

  function renderTotals() {
    const d = data(), sum = C.bulkSummary(d.items || [], { coins: d.inventory?.coins || {}, str: d.stats?.str });
    const state = { sobrecarregado: ' · <strong class="accent">Sobrecarregado</strong>: Desajeitado 1 e −3 m de deslocamento', 'acima-do-maximo': ' · <strong class="danger">Acima do máximo</strong>: não dá para carregar tudo' }[sum.state] || '';
    out('[data-bulk-total]').html = `Volume <strong>${sum.bulk}</strong>${sum.light ? ` e ${sum.light} L` : ''} · sobrecarregado acima de ${sum.limit} · máximo ${sum.max}${sum.coinBulk ? ` · moedas contam ${sum.coinBulk}` : ''}${state}${sum.unknown ? ` · <span class="accent">${plural(sum.unknown, 'item', 'itens')} com Volume "?"</span>` : ''}`;
    const coins = C.coinsTotal(d.inventory?.coins || {});
    const po = coins.copper % 100 === 0 ? String(coins.copper / 100) : C.formatNumber((coins.copper / 100).toFixed(2));
    q('[data-coins-total]').textContent = coins.count ? `Total: ${po} PO em ${plural(coins.count, 'moeda', 'moedas')}.` : 'Sem moedas.';
  }

  function renderLegacy() {
    const inventory = data().inventory || {};
    const parts = [['Carregados', inventory.carried], ['Consumíveis', inventory.consumables], ['Equipados', inventory.equipped], ['Riqueza', inventory.wealth]].filter(([, value]) => String(value || '').trim());
    q('[data-legacy]').hidden = !parts.length;
    out('[data-legacy-body]').html = parts.map(([label, value]) => `<div><dt>${label}</dt><dd>${escapeHtml(value)}</dd></div>`).join('');
  }

  // Magias para consultar (aba Habilidades): ataque e CD, e a lista que abre a regra.
  function renderSpellRead() {
    const d = data(), casting = d.spellcasting || {}, spells = d.spells || [], box = q('[data-spell-read]');
    box.hidden = !spells.length;
    if (!spells.length) { setHtml(box, ''); return; }
    const summary = [TRADITIONS[casting.tradition] || casting.tradition, casting.kind].filter(Boolean).join(' · ');
    view(box).html = `<div class="panel-head"><div><h2>Magias</h2><p>${escapeHtml(summary || 'Toque numa magia para ler o texto completo.')}</p></div></div>${casting.attack || casting.dc ? `<div class="tiles">${tile('Ataque de magia', C.formatModifier(casting.attack))}${tile('CD de magia', casting.dc, 'accent')}</div>` : ''}<div class="section-space">${spellList(spells)}</div>`;
  }

  // --- Subir de nível: a tabela da classe no catálogo diz o que cada nível dá; os atalhos levam a cada escolha ---
  const classInfo = { key: '', status: 'idle', name: '', hpPerLevel: null, progression: [] };
  async function loadClassInfo() {
    const className = data().profile?.className || '', key = C.normalizeName(className);
    if (classInfo.key === key && classInfo.status !== 'idle') return;
    Object.assign(classInfo, { key, status: 'loading', name: '', hpPerLevel: null, progression: [] });
    if (!catalog.loaded) { classInfo.status = 'idle'; return; }
    const match = C.matchCatalogName(className, catalog.classEntries.map(entry => C.displayName(entry.name)));
    const entry = match && catalog.classEntries.find(item => C.displayName(item.name) === match);
    if (!entry) { classInfo.status = 'missing'; draw(['levelCard']); return; }
    try {
      const full = await getEntry(entry.id);
      if (classInfo.key !== key) return;
      Object.assign(classInfo, { status: 'ok', name: C.displayName(full.name), hpPerLevel: full.data?.hpPerLevel ?? null, progression: full.data?.progression || [] });
    } catch { if (classInfo.key !== key) return; classInfo.status = 'error'; }
    draw(['levelCard']);
  }
  const gainsAt = level => classInfo.progression.find(row => Number(row.level) === level)?.features || '';
  const SLOT_GAIN = { classe: 'Talento de classe', pericia: 'Talento de perícia', geral: 'Talento geral', ancestralidade: 'Talento de ancestralidade' };
  function renderLevelCard() {
    const d = data(), level = charLevel(), choices = d.choices || [];
    const head = `<div class="level-head"><div class="level-now"><span class="eyebrow">Nível</span><strong>${level}</strong></div><div class="level-actions" data-mutate><button type="button" class="mini" data-action="level-dec" aria-label="Descer um nível" ${level <= 1 ? 'disabled' : ''}>−</button><button type="button" class="btn primary" data-action="level-inc" ${level >= 20 ? 'disabled' : ''}>${level >= 20 ? 'Nível máximo' : `Subir para o nível ${level + 1}`}</button></div></div>`;
    let body = '';
    if (classInfo.status === 'ok') {
      const gains = C.levelGains(gainsAt(level)), next = gainsAt(level + 1);
      const rows = gains.slots.map(slot => {
        const done = choices.filter(choice => choice.slot === slot && String(choice.level) === String(level));
        return `<li class="gain"><span class="gain-name">${SLOT_GAIN[slot]}</span>${done.length ? `<span class="gain-done">✓ ${escapeHtml(done.map(choice => C.displayName(choice.name)).join(', '))}</span>` : readOnly() ? '<span class="gain-pending">a escolher</span>' : `<button type="button" class="btn small-btn" data-action="gain-choice" data-slot="${slot}" data-level="${level}">Escolher</button>`}</li>`;
      });
      if (gains.skillIncrease) rows.push('<li class="gain"><span class="gain-name">Incremento de perícia</span><button type="button" class="btn ghost small-btn" data-action="jump" data-target="evoluir-pericias">Perícias</button></li>');
      if (gains.attributeBoosts) rows.push('<li class="gain"><span class="gain-name">Melhorias de atributo</span><button type="button" class="btn ghost small-btn" data-action="jump" data-target="evoluir-atributos">Atributos</button></li>');
      for (const feature of gains.other) rows.push(`<li class="gain other"><span class="gain-name">${escapeHtml(feature)}</span></li>`);
      // O Somar aparece quando a ficha passou do nível até onde os PV já foram contados (extra.pvAte; fichas convertidas já
      // trazem os PV do nível que têm) e soma de uma vez todos os níveis que faltam.
      const hp = level > 1 && classInfo.hpPerLevel != null ? C.hpGain(classInfo.hpPerLevel, d.stats?.con) : null, summed = d.extra?.pvNiveis?.[level];
      const missing = level - C.hpCountedTo(d), hpMax = C.toInt(d.stats?.hpMax) ?? 0, first = level - missing + 1;
      const sumLabel = missing > 1 ? `Somar +${hp * missing} dos níveis ${first} ${missing === 2 ? 'e' : 'a'} ${level}` : `Somar +${hp}`;
      const hpLine = hp == null ? '' : `<div class="hp-gain"><span>PV por nível: ${classInfo.hpPerLevel} da classe ${signed(C.toInt(d.stats?.con) ?? 0)} de Constituição = <strong>+${hp}</strong></span>${summed ? `<span class="gain-done">✓ +${escapeHtml(summed)} somados neste nível</span>` : missing > 0 ? `<button type="button" class="btn small-btn" data-action="hp-gain" data-mutate>${sumLabel} (PV máx ${hpMax} → ${hpMax + hp * missing})</button>` : ''}</div>`;
      body = `<h3 class="group-title">O que o nível ${level} dá (${escapeHtml(classInfo.name)})</h3><ul class="gain-list">${rows.join('') || '<li class="gain other"><span class="gain-name">Nada novo na tabela da classe.</span></li>'}</ul>${hpLine}${next ? `<p class="small muted section-space">No nível ${level + 1}: ${escapeHtml(next)}.</p>` : ''}`;
    } else if (classInfo.status === 'missing') body = String(d.profile?.className || '').trim() ? `<p class="small muted">${escapeHtml(d.profile.className)} não está nos livros: confira o que o nível dá no seu livro e anote nas Escolhas (fica marcado para o mestre).</p>` : '<p class="small muted">Preencha a classe na aba Ficha para ver o que cada nível dá.</p>';
    else if (classInfo.status === 'error') body = '<p class="small muted">Não deu para ler a tabela da classe agora. Recarregue a página para tentar de novo.</p>';
    else body = '<p class="small muted">Lendo a tabela da classe nos livros…</p>';
    out('[data-level-card]').html = head + body;
  }

  const PARTS = { top: renderTop, hp: renderHp, ac: renderAcCard, shield: renderShield, perception: renderPerception, combatStrip: renderCombatStrip, dying: renderDying, defenses: renderDefenses, conditions: renderConditions, strikes: renderStrikes, skills: renderSkills, spellsUse: renderSpellsUse, feats: renderFeats, spellRead: renderSpellRead, levelCard: renderLevelCard, acCheck: renderAcCheck, choices: renderChoices, choiceForm: renderChoiceForm, spellBook: renderSpellBook, inventory: renderInventory, totals: renderTotals, legacy: renderLegacy };
  const TAB_PARTS = {
    combate: ['hp', 'ac', 'shield', 'perception', 'combatStrip', 'strikes', 'conditions', 'dying', 'spellsUse', 'skills', 'defenses'],
    habilidades: ['feats', 'spellRead', 'skills'],
    evoluir: ['levelCard', 'choices', 'choiceForm', 'acCheck', 'spellBook'],
    itens: ['inventory', 'legacy'],
    ficha: [],
  };
  const ALL_PARTS = ['top', ...new Set(Object.values(TAB_PARTS).flat())];

  // Redesenhar troca elementos: devolve o foco (e o cursor) ao campo de mesmo data-bind, se ele foi recriado.
  const ACTION_KEYS = ['action', 'index', 'slot', 'level', 'value', 'tab', 'section', 'key'];
  const actionId = el => ACTION_KEYS.map(name => el.dataset[name] ?? '').join('|');
  function keepFocus(fn) {
    const active = document.activeElement, key = active?.dataset?.bind, action = !key && active?.dataset?.action ? actionId(active) : '';
    let start = null, end = null;
    try { start = active?.selectionStart ?? null; end = active?.selectionEnd ?? null; } catch { /* campo sem seleção */ }
    fn();
    if ((!key && !action) || (active && document.contains(active))) return;
    const next = key ? [...root.querySelectorAll('[data-bind]')].find(el => el.dataset.bind === key) : [...root.querySelectorAll('[data-action]')].find(el => actionId(el) === action);
    if (!next) return;
    next.focus();
    try { if (start != null) next.setSelectionRange(start, end); } catch { /* select não tem cursor */ }
  }
  function draw(parts) { keepFocus(() => { for (const part of new Set(parts)) PARTS[part]?.(); }); }
  function render() { draw(ALL_PARTS); }

  // Campos fixos ligados pelo app.js: depois de uma mudança por botão, mostram o valor novo (menos o que está em foco).
  function syncAllBound() {
    const d = data();
    root.querySelectorAll('[data-bind]').forEach(el => {
      if (el === document.activeElement) return;
      const value = el.dataset.bind.split('.').reduce((current, key) => current?.[key], d) ?? '';
      if (el.type === 'checkbox') { if (el.checked !== !!value) el.checked = !!value; }
      else if ('value' in el && el.value !== String(value)) el.value = value;
    });
  }

  // Toda mudança por botão passa por aqui: grava na ficha viva, agenda o salvamento e redesenha só o que mudou.
  function change(mutate, parts = ALL_PARTS) {
    if (readOnly()) return;
    mutate(data());
    window.Mesa.dirty();
    draw(parts);
    syncAllBound();
  }

  // --- Abas ---
  // Endereços antigos: #pesquisa virou a aba Habilidades.
  const TAB_ALIASES = { pesquisa: 'habilidades' };
  const tabName = value => { const name = TAB_ALIASES[value] || value; return TABS.includes(name) ? name : ''; };
  function readTab() {
    const fromHash = tabName(location.hash.slice(1));
    if (fromHash) return fromHash;
    try { const saved = tabName(localStorage.getItem('mesa-aba-v2')); if (saved) return saved; } catch { /* sem memória do aparelho */ }
    return 'combate';
  }
  function showTab(next, { scroll = false } = {}) {
    tab = tabName(next) || 'combate';
    root.querySelectorAll('[data-tab]').forEach(button => { const on = button.dataset.tab === tab; button.setAttribute('aria-selected', String(on)); button.tabIndex = on ? 0 : -1; });
    root.querySelectorAll('[data-panel]').forEach(panel => { panel.hidden = panel.dataset.panel !== tab; });
    if (location.hash.slice(1) !== tab) history.replaceState(null, '', location.pathname + location.search + '#' + tab);
    try { localStorage.setItem('mesa-aba-v2', tab); } catch { /* sem memória do aparelho */ }
    draw(TAB_PARTS[tab]);
    if (scroll) { const top = root.getBoundingClientRect().top + window.scrollY; if (window.scrollY > top) window.scrollTo(0, top); }
  }

  // --- Migração: fichas de antes da página única (texto livre no inventário e talentos em feats.*) ---
  function migrate() {
    const d = data();
    if (d.sheetVersion === '2') return null;
    const result = C.migrateInventory(d.inventory || {}, d.items || []);
    // "—" (Volume desprezível no livro) vira '0', como na tabela; valor que não dá para ler fica como estava ("?").
    d.items = result.items.map(item => ({ ...item, bulk: C.normalizeBulk(item.bulk) || item.bulk || '' }));
    d.inventory ||= {};
    const coins = d.inventory.coins || {};
    if (!['pl', 'po', 'pp', 'pc'].some(key => (C.toCount(coins[key]) ?? 0) > 0)) d.inventory.coins = { ...coins, ...result.coins };
    if (!(d.choices || []).length) d.choices = C.choicesFromFeats(d.feats || {});
    d.sheetVersion = '2';
    // Na visão do mestre (só leitura) a conversão fica só na tela; em conflito, nada é salvo por cima. O salvamento sai
    // depois que os ids das escolhas forem achados (finishAutoSave), num PUT só.
    if (!readOnly() && !window.Mesa.conflict) { window.Mesa.dirty(); conversionPending = true; }
    return { items: d.items.length, unknown: d.items.filter(item => !C.normalizeBulk(item.bulk)).length };
  }

  function showMigrationNote(report) {
    const box = q('[data-migration-note]');
    if (!report || readOnly()) return;
    const message = report.failed ? 'Não deu para converter o inventário antigo: o texto continua guardado no fim da aba Itens.' : `Ficha atualizada para a página nova: o inventário virou tabela (${plural(report.items, 'item', 'itens')}${report.unknown ? `, ${report.unknown} com Volume "?" para conferir` : ''}) e as Escolhas vieram dos talentos anotados. O texto antigo continua guardado no fim da aba Itens.`;
    box.innerHTML = `<span>${escapeHtml(message)}</span><button type="button" class="btn ghost small-btn" data-action="note-close">Entendi</button>`;
    box.hidden = false;
  }

  // Escolhas sem id: procura o talento só nas categorias da vaga (o mesmo nome existe em classes diferentes).
  // Sem acerto vira "fora dos livros"; erro de rede deixa para a próxima abertura.
  async function resolveChoiceIds() {
    const d = data(), pending = (d.choices || []).filter(choice => !choice.id && !choice.manual && String(choice.name || '').trim());
    if (!pending.length) return;
    let changed = false;
    for (const choice of pending) {
      const query = C.choiceQuery(choice, d.profile || {}, catalog);
      if (!query) { choice.manual = true; changed = true; continue; }
      try {
        const term = String(choice.name).replace(/^dedica[çc][ãa]o\s+de\s+/i, '');
        const result = await window.Mesa.api(searchPath({ type: 'feat', term, categories: query.categories, maxLevel: query.maxLevel, limit: 20 }));
        const entry = C.pickFeat(result.entries || [], choice.name, query.categories);
        if (entry) { choice.id = entry.id; choice.name = C.displayName(entry.name); } else choice.manual = true;
        changed = true;
      } catch { /* sem rede: tenta de novo na próxima abertura */ }
    }
    if (!changed) return;
    if (!readOnly()) { window.Mesa.dirty(); conversionPending = true; }
    draw(['choices', 'feats', 'levelCard']);
  }

  // Correções automáticas da abertura (conversão, ids das escolhas) vão para a nuvem num salvamento só, sem esperar o
  // jogador: não são edições dele, e a ficha não deve abrir "não salva".
  function finishAutoSave() {
    if (!conversionPending || readOnly() || window.Mesa.conflict) return;
    conversionPending = false;
    window.Mesa.saveData();
  }

  async function loadCatalogNames() {
    try {
      const [classes, ancestries] = await Promise.all(['class', 'ancestry'].map(type => window.Mesa.api(searchPath({ type, limit: 60 }))));
      catalog.classEntries = classes.entries;
      catalog.classes = classes.entries.map(entry => C.displayName(entry.name));
      catalog.ancestries = ancestries.entries.map(entry => C.displayName(entry.name));
      catalog.loaded = true;
      const fill = (id, names) => { const list = document.getElementById(id); if (list) list.innerHTML = names.map(name => `<option value="${escapeHtml(name)}"></option>`).join(''); };
      fill('lista-classes', catalog.classes);
      fill('lista-ancestralidades', catalog.ancestries);
      fill('lista-herancas', C.VERSATILE_HERITAGES);
    } catch { /* sem catálogo: as escolhas esperam a próxima abertura */ }
    draw(['choiceForm']);
    if (!catalog.loaded) { classInfo.status = 'error'; draw(['levelCard']); finishAutoSave(); return; }
    loadClassInfo();
    await resolveChoiceIds();
    finishAutoSave();
  }

  // Magias gravadas sem o tipo (fichas antigas ou digitadas): o catálogo diz se é truque, foco ou ritual.
  async function completeSpellKinds() {
    const missing = (data().spells || []).filter(spell => spell.id && !spell.kind);
    if (!missing.length) return;
    await Promise.all(missing.map(async spell => { try { spell.kind = C.spellKind(await getEntry(spell.id)); } catch { /* fica como magia comum */ } }));
    draw(['spellBook', 'spellsUse', 'spellRead']);
  }

  // --- Janela da regra: texto do catálogo, anotação do jogador e campos editáveis ---
  function referenceLink(ref) {
    if (!ref?.book || !Number(ref.page)) return '';
    if (!window.Regras.PAGE_IMAGES.has(ref.book)) return bookLink(ref);
    return `<a class="btn" href="livro.html?book=${encodeURIComponent(ref.book)}&page=${Number(ref.page)}" target="_blank" rel="noopener">Ver no livro ↗</a>`;
  }
  // Magias falam em ranque (como o livro); truques não têm ranque; o resto, nível.
  function levelLabel(entry) {
    if (entry.level == null) return '';
    if (['spell', 'focus', 'ritual'].includes(entry.type)) return C.spellKind(entry) === 'truque' ? 'truque' : entry.level + 'º ranque';
    return 'nível ' + entry.level;
  }
  function kindLabel(entry) {
    if (entry.type === 'spell') return C.spellKind(entry) === 'truque' ? 'Truque' : `Magia · ${entry.level}º ranque`;
    return (TYPE_LABELS[entry.type] || entry.type) + (entry.level != null ? ' · nível ' + entry.level : '');
  }
  async function openRule({ id = '', title, note = '', link = null, edit = '', actions = '' }) {
    const token = ++ruleToken;
    ruleDialog.innerHTML = `<div class="rule-head"><div><div class="eyebrow" data-rule-kicker></div><h2 data-rule-title>${escapeHtml(title)}</h2><p class="small muted" data-rule-meta></p></div><button type="button" class="btn ghost" data-action="dialog-close">Fechar</button></div><div class="rule-body" data-rule-body>${id ? '<p class="muted">Carregando a regra…</p>' : note ? '' : '<p class="muted">Sem regra do catálogo ligada a isto.</p>'}</div>${note ? `<h3 class="group-title">${id ? 'Sua anotação' : 'Anotação da ficha'}</h3><p class="rule-note">${escapeHtml(note)}</p>` : ''}${edit ? `<div class="rule-edit">${edit}</div>` : ''}<div class="rule-actions" data-rule-actions>${id ? '' : referenceLink(link)}${actions}</div>`;
    window.Mesa.bindAll(ruleDialog);
    if (!ruleDialog.open) ruleDialog.showModal();
    if (!id) return;
    try {
      const entry = await getEntry(id);
      if (token !== ruleToken) return;
      ruleDialog.querySelector('[data-rule-kicker]').textContent = kindLabel(entry);
      ruleDialog.querySelector('[data-rule-title]').textContent = C.displayName(entry.name);
      ruleDialog.querySelector('[data-rule-meta]').textContent = metaLine(entry);
      ruleDialog.querySelector('[data-rule-body]').innerHTML = (entry.traits?.length ? `<div class="chips">${entry.traits.map(trait => `<span class="chip">${escapeHtml(trait)}</span>`).join('')}</div>` : '') + bodyHtml(entry);
      ruleDialog.querySelector('[data-rule-actions]').insertAdjacentHTML('afterbegin', bookLink(entry));
    } catch (error) {
      if (token === ruleToken) ruleDialog.querySelector('[data-rule-body]').innerHTML = `<p class="muted">${escapeHtml(error.message)}</p>`;
    }
  }

  // Habilidades sem id: abre com a anotação e troca pela regra do catálogo se o nome bater.
  async function openFeat({ name, note, link }) {
    openRule({ title: name, note, link });
    const token = ruleToken;
    try {
      const result = await window.Mesa.api(searchPath({ type: 'feat', term: name, limit: 10 }));
      const match = result.entries.find(entry => C.normalizeName(entry.name) === C.normalizeName(name));
      if (match && token === ruleToken && ruleDialog.open) openRule({ id: match.id, title: name, note });
    } catch { /* sem catálogo, fica a anotação */ }
  }

  // --- Janela de busca no catálogo: condições, magias, itens e escolhas (filtradas pela vaga) ---
  function openPicker({ title, types, placeholder, limit = 60, filters = {}, hint = '', term = '', manualLabel = '', manualAfterEmpty = false, manualOnly = false, exclude = null, onPick = null, onManual = null }) {
    pickerDialog.innerHTML = `<div class="rule-head"><div><div class="eyebrow">Catálogo dos livros</div><h2>${escapeHtml(title)}</h2></div><button type="button" class="btn ghost" data-action="dialog-close">Fechar</button></div>${hint ? `<p class="small accent">${escapeHtml(hint)}</p>` : ''}<div class="picker-tools ${types.length > 1 ? 'with-type' : ''}"><input type="search" data-picker-q placeholder="${escapeHtml(placeholder)}" autocomplete="off" aria-label="${manualOnly ? 'Nome' : 'Buscar no catálogo'}">${types.length > 1 ? `<select data-picker-type aria-label="Tipo">${types.map(([value, label]) => `<option value="${value}">${escapeHtml(label)}</option>`).join('')}</select>` : ''}</div><p class="small muted" data-picker-status role="status"></p><div class="picker-results" data-picker-results></div>${onManual ? `<button type="button" class="btn ghost" data-picker-manual ${manualAfterEmpty ? 'hidden' : ''}>${escapeHtml(manualLabel)}</button>` : ''}`;
    const input = pickerDialog.querySelector('[data-picker-q]'), select = pickerDialog.querySelector('[data-picker-type]');
    const results = pickerDialog.querySelector('[data-picker-results]'), status = pickerDialog.querySelector('[data-picker-status]');
    const manualButton = pickerDialog.querySelector('[data-picker-manual]');
    input.value = term;
    let timer, found = [];
    async function search() {
      const token = ++pickerToken, type = select ? select.value : types[0][0], text = input.value.trim();
      status.textContent = 'Buscando…';
      try {
        const result = await window.Mesa.api(searchPath({ type, term: text, categories: filters.categories || [], maxLevel: filters.maxLevel || '', limit }));
        if (token !== pickerToken) return;
        found = exclude ? result.entries.filter(entry => !exclude(entry)) : result.entries;
        status.textContent = found.length ? (result.entries.length >= limit ? `Mostrando ${limit}: digite para filtrar.` : '') : text ? 'Nada encontrado com esse nome.' : 'Nada deste tipo no catálogo.';
        if (manualButton && manualAfterEmpty) manualButton.hidden = !(text && !found.length);
        results.innerHTML = found.map((entry, i) => `<button type="button" class="row-button" data-pick="${i}"><span>${escapeHtml(C.displayName(entry.name))}</span><small>${escapeHtml([levelLabel(entry), entry.category, String(entry.traits || '').split(',').slice(0, 3).join(',')].filter(Boolean).join(' · '))}</small></button>`).join('');
      } catch (error) { if (token === pickerToken) status.textContent = error.message; }
    }
    if (!manualOnly) {
      input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(search, 220); });
      select?.addEventListener('change', search);
    }
    results.addEventListener('click', async event => {
      const button = event.target.closest('[data-pick]');
      if (!button || !onPick) return;
      button.disabled = true;
      try { await onPick(found[Number(button.dataset.pick)]); pickerDialog.close(); } catch (error) { status.textContent = error.message; button.disabled = false; }
    });
    manualButton?.addEventListener('click', () => {
      const name = input.value.trim();
      if (!name) { status.textContent = 'Digite o nome no campo acima e toque de novo.'; input.focus(); return; }
      onManual(name);
      pickerDialog.close();
    });
    pickerDialog.showModal();
    input.focus();
    if (!manualOnly) search();
  }

  function openChoicePicker({ slot, level, replace = null }) {
    const query = C.choiceQuery({ slot, level }, data().profile || {}, catalog);
    const base = { slot, level: String(level) };
    const apply = choice => change(d => { d.choices ||= []; if (replace != null && d.choices[replace]) d.choices[replace] = choice; else d.choices.push(choice); }, ['choices', 'feats', 'levelCard']);
    const title = `${replace != null ? 'Trocar' : 'Escolher'}: ${SLOT_LABELS[slot] || slot}, nível ${level}`;
    if (!query) return openPicker({ title, types: [['feat', 'Talentos']], placeholder: 'Nome do talento', manualOnly: true, hint: choiceHint(slot), manualLabel: 'Anotar à mão (fica marcada para o mestre)', onManual: name => apply({ ...base, id: '', name, manual: true, note: '' }) });
    openPicker({ title, types: [['feat', 'Talentos']], placeholder: 'Filtrar pelo nome…', limit: 200, filters: { categories: query.categories, maxLevel: query.maxLevel }, hint: 'Lista para: ' + query.label + '.', manualLabel: 'Não está nos livros: anotar à mão (fica marcada)', manualAfterEmpty: true, onPick: entry => apply({ ...base, id: entry.id, name: C.displayName(entry.name), manual: false, note: '' }), onManual: name => apply({ ...base, id: '', name, manual: true, note: '' }) });
  }

  // Armadura e escudo ligados ao catálogo em Equipados preenchem a Defesa; sem números no catálogo, nada muda.
  async function fillFromEquipped() {
    const d = data(), status = q('[data-fill-status]');
    const linked = (d.items || []).filter(item => sectionOf(item) === 'equipado' && item.id);
    if (!linked.length) { status.textContent = 'Nenhum item equipado está ligado ao catálogo. Toque na armadura ou no escudo no Inventário e use Ligar ao catálogo.'; return; }
    status.textContent = 'Lendo o catálogo…';
    let armor = null, shield = null, armorName = '', shieldName = '';
    for (const item of linked) {
      try {
        const entry = await getEntry(item.id);
        if (!armor) { const found = C.armorFromEntry(entry); if (found) { armor = found; armorName = C.displayName(entry.name); } }
        if (!shield) { const found = C.shieldFromEntry(entry); if (found) { shield = found; shieldName = C.displayName(entry.name); } }
      } catch { /* item sem regra legível */ }
    }
    if (!armor && !shield) { status.textContent = 'Os itens equipados não têm números de armadura ou escudo no catálogo (roupas e itens mágicos ficam à mão).'; return; }
    change(next => {
      next.defense ||= {};
      if (armor) next.defense.ac = { ...(next.defense.ac || {}), category: armor.category, dexCap: armor.dexCap, item: armor.item };
      if (shield) {
        const current = next.defense.shield || {};
        next.defense.shield = { ...current, bonus: shield.bonus, hardness: shield.hardness, hpMax: shield.hpMax, bt: shield.bt, cover: shield.cover || '' };
        if (!String(current.hp ?? '').trim()) next.defense.shield.hp = shield.hpMax;
      }
    }, ['acCheck', 'ac', 'shield', 'top']);
    status.textContent = [armor ? `Armadura: ${armorName}` : 'Nenhuma armadura com números no catálogo', shield ? `Escudo: ${shieldName}` : ''].filter(Boolean).join(' · ') + '. Confira a proficiência e a conta.';
  }

  // --- Ações (um único ouvinte para a página e as duas janelas) ---
  const clampInt = (value, max = Infinity) => Math.min(max, Math.max(0, C.toInt(value) ?? 0));
  function applyHp(kind) {
    const input = document.getElementById('hp-amount'), amount = C.toInt(input?.value);
    if (!amount || amount < 0) { input?.focus(); return; }
    change(d => {
      d.stats ||= {};
      const before = C.hpState(d.stats).current, temp = Math.max(0, C.toInt(d.stats.hpTemp) ?? 0);
      if (kind === 'damage') {
        Object.assign(d.stats, C.applyDamage(d.stats, amount));
        // Só o dano que passa dos temporários conta para cair (ou piorar) em Morrendo.
        d.conditions = C.afterDamage(d.conditions || [], { hpBefore: before, hpAfter: C.hpState(d.stats).current, hpDamage: Math.max(0, amount - temp) });
      } else if (kind === 'heal') {
        Object.assign(d.stats, C.applyHealing(d.stats, amount));
        d.conditions = C.afterHealing(d.conditions || [], { hpBefore: before, hpAfter: C.hpState(d.stats).current });
      } else Object.assign(d.stats, C.applyTemp(d.stats, amount));
    }, ['top', 'hp', 'dying', 'conditions']);
    input.value = '';
  }
  const conditionParts = ['conditions', 'dying', 'top'];
  const shieldOf = d => (d.defense ||= {}, d.defense.shield ||= {});

  const ACTIONS = {
    'dialog-close': el => el.closest('dialog').close(),
    'note-close': () => { q('[data-migration-note]').hidden = true; },
    tab: el => showTab(el.dataset.tab || el.dataset.tabTarget, { scroll: true }),
    jump: el => document.getElementById(el.dataset.target)?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' }),
    // Descer desfaz só o que o Somar pôs neste nível; os PV do nível novo ficam à espera do Somar (ficha-calc: levelUp/levelDown).
    'level-dec': () => { change(d => { C.levelDown(d); }, ['top', 'hp', 'levelCard', 'acCheck', 'choiceForm']); window.Mesa.updateCalculations(); },
    'level-inc': () => { change(d => { C.levelUp(d); }, ['top', 'levelCard', 'acCheck', 'choiceForm']); window.Mesa.updateCalculations(); },
    // Ganho do nível: abre a lista já filtrada para aquela vaga e aquele nível.
    'gain-choice': el => openChoicePicker({ slot: el.dataset.slot, level: el.dataset.level }),
    // PV dos níveis que faltam (classe + Constituição), somados no máximo e nos atuais.
    'hp-gain': () => {
      if (classInfo.status !== 'ok' || classInfo.hpPerLevel == null) return;
      change(d => { C.sumLevelHp(d, C.hpGain(classInfo.hpPerLevel, d.stats.con)); }, ['top', 'hp', 'levelCard']);
    },
    // XP com o ponto do milhar, como o jogador escreve ("1.760").
    'xp-add': el => change(d => { d.profile.xp = (C.toCount(C.stepValue(d.profile.xp, Number(el.dataset.amount) || 0)) ?? 0).toLocaleString('pt-BR'); }, []),
    damage: () => applyHp('damage'),
    heal: () => applyHp('heal'),
    temp: () => applyHp('temp'),
    'temp-dec': () => change(d => { d.stats.hpTemp = C.stepValue(d.stats.hpTemp, -1); }, ['hp', 'top']),
    'temp-inc': () => change(d => { d.stats.hpTemp = C.stepValue(d.stats.hpTemp, 1); }, ['hp', 'top']),
    'acb-dec': () => change(d => { d.defense ||= {}; d.defense.acBonus = C.stepValue(d.defense.acBonus, -1, -20, 20); }, ['ac', 'top']),
    'acb-inc': () => change(d => { d.defense ||= {}; d.defense.acBonus = C.stepValue(d.defense.acBonus, 1, -20, 20); }, ['ac', 'top']),
    'shield-raise': () => change(d => { const shield = shieldOf(d), state = C.shieldState(shield); shield.raised = state.broken || state.destroyed ? false : !shield.raised; }, ['ac', 'shield', 'top']),
    'shp-dec': () => change(d => { const shield = shieldOf(d), state = C.shieldState(shield); shield.hp = C.stepValue(String(state.hp ?? 0), -1, 0, state.hpMax ?? Infinity); if (C.shieldState(shield).broken || C.shieldState(shield).destroyed) shield.raised = false; }, ['ac', 'shield', 'top']),
    'shp-inc': () => change(d => { const shield = shieldOf(d), state = C.shieldState(shield); shield.hp = C.stepValue(String(state.hp ?? 0), 1, 0, state.hpMax ?? Infinity); }, ['ac', 'shield', 'top']),
    dying: el => change(d => { const current = C.dyingState(d.conditions || []).dying, value = Number(el.dataset.value); d.conditions = C.setDying(d.conditions || [], value === current ? value - 1 : value); }, conditionParts),
    'wounded-dec': () => change(d => { d.conditions = C.setConditionValue(d.conditions || [], 'ferido', C.dyingState(d.conditions || []).wounded - 1); }, conditionParts),
    'wounded-inc': () => change(d => { d.conditions = C.setConditionValue(d.conditions || [], 'ferido', C.dyingState(d.conditions || []).wounded + 1); }, conditionParts),
    hero: (el, i) => change(d => { d.heroPoints = String(clampInt(d.heroPoints, 3) === i + 1 ? i : i + 1); }, ['dying']),
    'luck-dec': () => change(d => { d.luck = C.stepValue(d.luck, -1); }, ['dying']),
    'luck-inc': () => change(d => { d.luck = C.stepValue(d.luck, 1); }, ['dying']),
    'condition-add': () => openPicker({ title: 'Adicionar condição', types: [['condition', 'Condições']], limit: 100, placeholder: 'Ex.: assustado, desprevenido…', exclude: entry => OWN_CONTROL.has(C.normalizeName(entry.name)), onPick: entry => change(d => { if (!d.conditions.some(item => C.normalizeName(item.name) === C.normalizeName(entry.name))) d.conditions.push({ id: entry.id, name: entry.name, value: C.conditionHasValue(entry.name) ? '1' : '' }); }, conditionParts) }),
    'condition-open': (el, i) => { const condition = data().conditions[i]; openRule({ id: condition.id, title: condition.name + (condition.value ? ' ' + condition.value : '') }); },
    'condition-inc': (el, i) => change(d => { d.conditions[i].value = String(clampInt(d.conditions[i].value) + 1); }, conditionParts),
    'condition-dec': (el, i) => change(d => { const value = clampInt(d.conditions[i].value) - 1; if (value <= 0) d.conditions.splice(i, 1); else d.conditions[i].value = String(value); }, conditionParts),
    'condition-remove': (el, i) => change(d => { d.conditions.splice(i, 1); }, conditionParts),
    skill: el => window.Mesa.openHelp(...window.Mesa.skillInfo[el.dataset.key]),
    slot: (el, i) => change(d => { const slot = d.spellcasting.slots[el.dataset.rank] ||= {}; slot.used = String(i < clampInt(slot.used) ? i : i + 1); }, ['spellsUse']),
    focus: (el, i) => change(d => { const focus = d.spellcasting.focus ||= {}; focus.current = String(i < clampInt(focus.current) ? i : i + 1); }, ['spellsUse']),
    rest: () => { if (confirm('Descanso diário: todos os espaços de magia voltam a ficar livres e o foco volta ao máximo. Confirmar?')) change(d => { d.spellcasting = C.dailyRest(d.spellcasting); }, ['spellsUse']); },
    'spell-add': () => openPicker({ title: 'Adicionar magia', types: [['spell', 'Magias e truques'], ['focus', 'Magias de foco'], ['ritual', 'Rituais']], placeholder: 'Ex.: escudo, bola de fogo…', manualLabel: 'Adicionar com o nome digitado (sem regra)', onPick: entry => change(d => { d.spells.push({ id: entry.id, name: entry.name, rank: String(entry.level ?? 1), kind: C.spellKind(entry), notes: '' }); }, ['spellBook', 'spellsUse']), onManual: name => change(d => { d.spells.push({ id: '', name, rank: '1', kind: 'magia', notes: '' }); }, ['spellBook', 'spellsUse']) }),
    'spell-open': (el, i) => {
      const spell = data().spells[i], canEdit = !readOnly();
      openRule({ id: spell.id, title: C.displayName(spell.name), note: canEdit ? '' : spell.notes, edit: canEdit ? `${(spell.kind || 'magia') === 'magia' ? `<label class="field">Ranque em que você a usa<input data-bind="spells.${i}.rank" inputmode="numeric"></label>` : ''}<label class="field">Notas<input data-bind="spells.${i}.notes" placeholder="Ex.: preparada 2x"></label>` : '', actions: canEdit ? `<button type="button" class="btn remove" data-action="spell-remove" data-index="${i}">Remover magia</button>` : '' });
    },
    'spell-remove': (el, i) => { if (!confirm(`Remover ${C.displayName(data().spells[i].name)} da lista?`)) return; ruleDialog.close(); change(d => { d.spells.splice(i, 1); }, ['spellBook', 'spellsUse']); },
    'choice-add': () => openChoicePicker({ slot: q('[data-choice-slot]').value, level: q('[data-choice-level]').value || '1' }),
    'choice-swap': (el, i) => { const choice = data().choices[i]; if (choice) openChoicePicker({ slot: choice.slot, level: choice.level || '1', replace: i }); },
    'choice-remove': (el, i) => { const choice = data().choices[i]; if (choice && confirm(`Remover ${C.displayName(choice.name)} das escolhas?`)) change(d => { d.choices.splice(i, 1); }, ['choices', 'feats', 'levelCard']); },
    'choice-open': (el, i) => {
      const choice = data().choices[i];
      if (!choice) return;
      const note = [choice.manual ? 'Fora dos livros: confira com o mestre.' : '', choice.note].filter(Boolean).join('\n\n');
      if (choice.id) openRule({ id: choice.id, title: C.displayName(choice.name), note: choice.note });
      else openFeat({ name: C.displayName(choice.name), note });
    },
    'ability-open': el => { const ability = data().abilities[el.dataset.key] || {}; openFeat({ name: ability.name || 'Habilidade', note: [ability.effect, ability.source].filter(Boolean).join('\n\n'), link: ability.reference }); },
    'ac-use': () => { const d = data(), formula = C.acFormula({ stats: d.stats || {}, profile: d.profile || {}, defense: d.defense || {} }); if (formula.complete) change(next => { next.stats.ac = String(formula.total); }, ['acCheck', 'ac', 'top']); },
    'fill-equipped': () => { if (!readOnly()) fillFromEquipped(); },
    'inv-tab': el => { invTab = el.dataset.section; draw(['inventory']); },
    'item-add': () => openPicker({ title: 'Adicionar item', types: [['item', 'Itens']], placeholder: 'Ex.: espada longa, poção de cura…', manualLabel: 'Adicionar com o nome digitado (sem regra)', onPick: async entry => { let bulk = ''; try { bulk = C.normalizeBulk((await getEntry(entry.id)).data?.bulk); } catch { /* Volume fica "?" */ } change(d => { d.items.push({ id: entry.id, name: C.displayName(entry.name), qty: '1', bulk, invested: false, notes: '', section: invTab }); }, ['inventory']); }, onManual: name => change(d => { d.items.push({ id: '', name, qty: '1', bulk: '', invested: false, notes: '', section: invTab }); }, ['inventory']) }),
    'item-open': (el, i) => {
      const item = data().items[i], canEdit = !readOnly();
      openRule({ id: item.id, title: C.displayName(item.name) || 'Item', note: canEdit ? '' : [item.invested ? 'Investido.' : '', item.notes].filter(Boolean).join('\n'), edit: canEdit ? `<label class="field">Nome<input data-bind="items.${i}.name"></label><div class="form-grid"><label class="field">Quantidade<input data-bind="items.${i}.qty" inputmode="numeric"></label><label class="field">Volume (cada)<select data-bind="items.${i}.bulk">${bulkOptions(item.bulk)}</select></label><label class="field">Aba<select data-bind="items.${i}.section">${SECTIONS.map(([key, label]) => `<option value="${key}">${label}</option>`).join('')}</select></label><label class="check invested-check"><input type="checkbox" data-bind="items.${i}.invested">Investido</label></div><label class="field">Notas<input data-bind="items.${i}.notes" placeholder="Runas, cargas, de onde veio…"></label>` : '', actions: canEdit ? `<button type="button" class="btn" data-action="item-link" data-index="${i}">${item.id ? 'Trocar a regra' : 'Ligar ao catálogo'}</button><button type="button" class="btn remove" data-action="item-remove" data-index="${i}">Remover item</button>` : '' });
      if (canEdit) { const section = ruleDialog.querySelector(`[data-bind="items.${i}.section"]`); if (section) section.value = sectionOf(item); }
    },
    'item-link': (el, i) => {
      const item = data().items[i];
      ruleDialog.close();
      openPicker({ title: 'Ligar ao catálogo', types: [['item', 'Itens']], term: item.name, placeholder: 'Nome do item no livro', onPick: async entry => { let bulk = ''; try { bulk = C.normalizeBulk((await getEntry(entry.id)).data?.bulk); } catch { /* sem Volume no catálogo */ } change(d => { const target = d.items[i]; if (!target) return; target.id = entry.id; if (!C.normalizeBulk(target.bulk) && bulk) target.bulk = bulk; }, ['inventory']); } });
    },
    'item-remove': (el, i) => { if (!confirm(`Remover ${C.displayName(data().items[i].name)}?`)) return; ruleDialog.close(); change(d => { d.items.splice(i, 1); }, ['inventory']); },
    'qty-dec': (el, i) => change(d => { const item = d.items[i]; item.qty = C.stepValue(String(item.qty ?? '').trim() === '' ? '1' : item.qty, -1); }, ['totals']),
    'qty-inc': (el, i) => change(d => { const item = d.items[i]; item.qty = C.stepValue(String(item.qty ?? '').trim() === '' ? '1' : item.qty, 1); }, ['totals']),
    'legacy-clear': () => { if (confirm('Apagar o texto antigo do inventário? A tabela e as moedas não mudam.')) change(d => { Object.assign(d.inventory, { carried: '', consumables: '', equipped: '', wealth: '' }); }, ['legacy']); },
  };

  document.addEventListener('click', event => {
    const el = event.target.closest('[data-action]');
    if (!el || !ACTIONS[el.dataset.action]) return;
    if (!root.contains(el) && !ruleDialog.contains(el) && !pickerDialog.contains(el)) return;
    // No celular, tocar num botão não tira o foco do campo: soltar antes deixa o campo mostrar o valor novo (ex.: XP +30).
    const active = document.activeElement;
    if (active !== el && active?.matches?.('input, textarea, select') && root.contains(active)) active.blur();
    ACTIONS[el.dataset.action](el, Number(el.dataset.index));
  });

  // Campos ligados pelo app.js: o app.js grava; aqui só se atualizam, no máximo uma vez por quadro, as partes de exibição
  // que dependem daquele campo. Anotações e outros textos longos não redesenham nada.
  const PATH_PARTS = [
    [/^profile\.(name|className|ancestry|heritage)$/, ['top', 'choiceForm']],
    [/^stats\.(hpCurrent|hpMax|hpTemp)$/, ['top', 'hp']],
    [/^stats\.(ac|dex)$/, ['top', 'ac', 'acCheck']],
    [/^stats\.perception$/, ['perception']],
    [/^stats\.(fort|reflex|will|speed|classDc|str|dex|con|int|wis|cha)$/, ['defenses']],
    [/^stats\.str$/, ['totals']],
    [/^stats\.con$/, ['levelCard']],
    [/^defense\./, ['top', 'ac', 'shield', 'acCheck']],
    [/^(items\.|inventory\.coins\.)/, ['totals']],
    [/^spellcasting\./, ['spellsUse', 'spellRead']],
    [/^skills\./, ['skills']],
    [/^attacks\./, ['strikes']],
    [/^abilities\./, ['feats']],
  ];
  const queued = new Set();
  let frame = 0;
  document.addEventListener('input', event => {
    const path = event.target?.dataset?.bind;
    if (!path || !(root.contains(event.target) || ruleDialog.contains(event.target))) return;
    for (const [pattern, parts] of PATH_PARTS) if (pattern.test(path)) parts.forEach(part => queued.add(part));
    if (!queued.size || frame) return;
    frame = requestAnimationFrame(() => { frame = 0; const parts = [...queued]; queued.clear(); draw(parts); });
  });
  root.addEventListener('change', event => {
    if (event.target.matches('[data-choice-slot], [data-choice-level]')) renderChoiceForm();
    // Classe trocada na Identidade: a tabela de progressão é outra.
    if (event.target.dataset?.bind === 'profile.className') { classInfo.status = 'idle'; loadClassInfo(); }
  });
  // Setas do teclado trocam de aba, como em qualquer lista de abas.
  root.querySelector('[role="tablist"]').addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const index = TABS.indexOf(tab), next = event.key === 'Home' ? 0 : event.key === 'End' ? TABS.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length;
    showTab(TABS[next]);
    root.querySelector(`[data-tab="${TABS[next]}"]`).focus();
  });
  window.addEventListener('hashchange', () => { const name = tabName(location.hash.slice(1)); if (name && name !== tab) showTab(name, { scroll: true }); });
  ruleDialog.addEventListener('close', () => { render(); syncAllBound(); });
  // Tocar no fundo escuro, fora da janela, fecha (como qualquer folha do celular).
  for (const dialog of [ruleDialog, pickerDialog, document.getElementById('help-modal')]) dialog?.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
  });
  // Armas e habilidades acrescentadas ou tiradas pelos botões do app.js: Golpes e Talentos acompanham na hora.
  document.addEventListener('mesa:listas', () => { if (window.Mesa.data) draw(['strikes', 'feats']); });

  // Formulário de conjuração: desenhado uma vez e ligado pelo app.js (nunca é redesenhado).
  function setupCastingForm() {
    const box = q('[data-casting-form]'), d = data(), casting = d.spellcasting || {};
    // Quem não conjura vê a conjuração recolhida (era um bloco grande e vazio no celular).
    const hasCasting = casting.tradition || casting.kind || casting.attack || casting.dc || C.slotRanks(casting).length || (C.toInt(casting.focus?.max) ?? 0) > 0 || (d.spells || []).length;
    box.innerHTML = `<details class="casting-details" ${hasCasting ? 'open' : ''}><summary>Conjuração: tradição, CD e espaços por ranque</summary><div class="form-grid section-space"><label class="field">Tradição<select data-bind="spellcasting.tradition"><option value="">—</option>${Object.entries(TRADITIONS).map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}</select></label><label class="field">Tipo<select data-bind="spellcasting.kind"><option value="">—</option><option value="preparado">Preparado</option><option value="espontâneo">Espontâneo</option></select></label><label class="field">Ataque de magia<input data-bind="spellcasting.attack" inputmode="numeric" placeholder="+7"></label><label class="field">CD de magia<input data-bind="spellcasting.dc" inputmode="numeric" placeholder="17"></label><label class="field">Pontos de foco (máximo)<input data-bind="spellcasting.focus.max" inputmode="numeric" placeholder="0"></label></div><p class="small muted section-space">Espaços de magia por ranque (máximo por dia)</p><div class="slot-edit">${Array.from({ length: 10 }, (_, i) => `<label>${i + 1}º<input data-bind="spellcasting.slots.${i + 1}.max" inputmode="numeric" placeholder="0" aria-label="Espaços de ${i + 1}º ranque"></label>`).join('')}</div></details>`;
    window.Mesa.bindAll(box);
  }

  // Pesquisa: o campo é livre até na visão do mestre (data-free); os resultados abrem a janela de regra.
  function setupSearch() {
    const input = q('[data-search-q]'), type = q('[data-search-type]'), results = q('[data-search-results]'), status = q('[data-search-status]'), full = q('[data-search-full]');
    let timer, found = [];
    async function run() {
      const token = ++searchToken, term = input.value.trim(), kind = type.value;
      full.href = 'busca.html' + (term ? '?q=' + encodeURIComponent(term) : '');
      if (!term && !kind) { status.textContent = 'Digite para buscar.'; results.innerHTML = ''; return; }
      status.textContent = 'Buscando…';
      try {
        const result = await window.Mesa.api(searchPath({ type: kind, term, limit: 40 }));
        if (token !== searchToken) return;
        found = result.entries || [];
        const pages = result.pages || [];
        status.textContent = found.length || pages.length ? '' : 'Nada encontrado.';
        results.innerHTML = found.map((entry, i) => `<button type="button" class="row-button" data-search-pick="${i}"><span>${escapeHtml(C.displayName(entry.name))}</span><small>${escapeHtml([TYPE_LABELS[entry.type] || entry.type, levelLabel(entry)].filter(Boolean).join(' · '))}</small></button>`).join('') + (pages.length ? `<h3 class="group-title">Páginas dos livros</h3>${pages.map(page => `<a class="row-button" href="livro.html?book=${encodeURIComponent(page.book)}&page=${Number(page.page)}" target="_blank" rel="noopener"><span>${escapeHtml((BOOK_NAMES?.[page.book] || page.book) + ', p. ' + page.page)}</span><small>${escapeHtml(page.chapter || '')}</small></a>`).join('')}` : '');
      } catch (error) { if (token === searchToken) status.textContent = error.message; }
    }
    input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 220); });
    type.addEventListener('change', run);
    results.addEventListener('click', event => {
      const button = event.target.closest('[data-search-pick]');
      if (!button) return;
      const entry = found[Number(button.dataset.searchPick)];
      openRule({ id: entry.id, title: C.displayName(entry.name) });
    });
  }

  document.addEventListener('mesa:ficha', () => {
    let report = null;
    try { report = migrate(); } catch (error) { console.error('Migração da ficha:', error); report = { failed: true }; }
    setupCastingForm();
    setupSearch();
    syncAllBound();
    showTab(readTab());
    render();
    showMigrationNote(report);
    completeSpellKinds();
    loadCatalogNames();
  });
})();
