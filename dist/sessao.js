// Página Sessão: a ficha para usar durante o jogo, com tudo à vista e a regra a um toque.
// Lê e grava a mesma ficha do app.js (window.Mesa, docs/modelo-da-ficha.md): altera Mesa.data e chama Mesa.dirty().
(() => {
  const { escapeHtml, bodyHtml, bookLink, metaLine, TYPE_LABELS } = window.Regras;
  const C = window.FichaCalc;
  const root = document.querySelector('[data-session]');
  const ruleDialog = document.getElementById('rule-dialog');
  const pickerDialog = document.getElementById('picker-dialog');
  const entryCache = new Map();
  let editingCasting = false, ruleToken = 0, pickerToken = 0;

  const ATTRIBUTES = [['str', 'Força'], ['dex', 'Destreza'], ['con', 'Constituição'], ['int', 'Inteligência'], ['wis', 'Sabedoria'], ['cha', 'Carisma']];
  const FEAT_LABELS = { ancestry: 'Ancestralidade e herança', ancestryTalent: 'Talento de ancestralidade', background: 'Talento da biografia', class1: 'Talento de classe · nível 1', class2: 'Talento de classe · nível 2', skill2: 'Talento de perícia · nível 2', archetype: 'Dedicação / arquétipo' };
  const HP_LABELS = { ok: 'PV cheios', ferido: 'Com dano', critico: 'Em perigo', caido: '0 PV' };
  const TRADITIONS = { arcana: 'Arcana', divina: 'Divina', ocultista: 'Ocultista', primal: 'Primal' };

  const data = () => window.Mesa.data;
  const readOnly = () => window.Mesa.readOnly();
  const q = selector => root.querySelector(selector);
  const lock = () => readOnly() ? 'disabled' : '';
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
  const editLink = page => page + '?character=' + encodeURIComponent(window.Mesa.character.id);
  const tile = (label, value, extra = '') => `<div class="tile ${extra}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || '—')}</strong></div>`;

  // Toda mudança passa por aqui: grava na ficha viva, agenda o salvamento automático e redesenha.
  function change(mutate) { if (readOnly()) return; mutate(data()); window.Mesa.dirty(); render(); }

  function getEntry(id) {
    if (!entryCache.has(id)) entryCache.set(id, window.Mesa.api('entries/' + encodeURIComponent(id)).catch(error => { entryCache.delete(id); throw error; }));
    return entryCache.get(id);
  }

  function renderHero() {
    const profile = data().profile || {};
    const origin = [profile.ancestry, profile.heritage].filter(Boolean).join(' · ');
    const klass = [profile.className, profile.level ? 'nível ' + profile.level : ''].filter(Boolean).join(' ');
    q('[data-name]').textContent = profile.name || 'Personagem sem nome';
    q('[data-subtitle]').textContent = [origin, klass, profile.background].filter(Boolean).join(' — ') || 'Complete a identidade na Ficha.';
    q('[data-player]').textContent = profile.player ? 'Jogador: ' + profile.player : '';
    q('[data-readonly-chip]').hidden = !readOnly();
    root.classList.toggle('is-readonly', readOnly());
    document.title = (profile.name || 'Personagem') + ' · Sessão · Mesa Pathfinder';
  }

  function renderVitals() {
    const d = data(), stats = d.stats || {}, hp = C.hpState(stats);
    const hero = Math.max(0, Math.min(3, C.toInt(d.heroPoints) ?? 0)), speed = String(stats.speed ?? '').trim();
    q('[data-vitals]').innerHTML = `<div class="panel-head"><h2>Vitais</h2><div class="hero-points"><span>Heroísmo</span><div class="pips">${[0, 1, 2].map(i => `<button type="button" class="pip ${i < hero ? '' : 'spent'}" data-action="hero" data-index="${i}" aria-label="Ponto de heroísmo ${i + 1}: ${i < hero ? 'disponível' : 'vazio'}" ${lock()}></button>`).join('')}</div></div></div>
      <div class="hp" data-state="${hp.state}">
        <div class="hp-numbers"><span class="hp-current">${hp.current}</span><span class="hp-max">/ ${hp.max ?? '—'} PV</span>${hp.temp ? `<span class="chip hp-temp">+${hp.temp} temporários</span>` : ''}<span class="hp-state">${hp.max == null ? '' : HP_LABELS[hp.state]}</span></div>
        <div class="hp-bar"><span style="width:${hp.percent ?? 100}%"></span></div>
        <div class="hp-controls" data-mutate><input id="hp-amount" type="number" inputmode="numeric" min="0" placeholder="PV" aria-label="Quantos PV de dano, cura ou temporários"><button type="button" class="btn damage" data-action="damage">Dano</button><button type="button" class="btn heal" data-action="heal">Cura</button><button type="button" class="btn" data-action="temp" title="PV temporários não se somam: fica o maior valor">Temp.</button></div>
      </div>
      <div class="tiles">${tile('CA', stats.ac, 'accent')}${tile('Percepção', C.formatModifier(stats.perception))}${tile('Fortitude', C.formatModifier(stats.fort))}${tile('Reflexos', C.formatModifier(stats.reflex))}${tile('Vontade', C.formatModifier(stats.will))}${tile('Deslocamento', speed ? speed + ' m' : '')}${tile('CD de classe', stats.classDc)}</div>`;
  }

  function renderConditions() {
    const list = data().conditions || [];
    q('[data-conditions]').innerHTML = `<div class="panel-head"><div><h2>Condições</h2><p>Toque no nome para ler a regra.</p></div><button type="button" class="btn" data-action="condition-add" data-mutate>+ Condição</button></div>
      <div class="condition-list">${list.length ? list.map((condition, i) => `<div class="condition"><button type="button" class="condition-name" data-action="condition-open" data-index="${i}">${escapeHtml(condition.name)}${condition.value ? ` <strong>${escapeHtml(condition.value)}</strong>` : ''}</button>${C.conditionHasValue(condition.name) ? `<button type="button" class="mini" data-action="condition-dec" data-index="${i}" data-mutate aria-label="Diminuir ${escapeHtml(condition.name)}">−</button><button type="button" class="mini" data-action="condition-inc" data-index="${i}" data-mutate aria-label="Aumentar ${escapeHtml(condition.name)}">+</button>` : ''}<button type="button" class="mini" data-action="condition-remove" data-index="${i}" data-mutate aria-label="Tirar ${escapeHtml(condition.name)}">×</button></div>`).join('') : '<p class="empty">Nenhuma condição ativa.</p>'}</div>`;
  }

  function renderAttributes() {
    const stats = data().stats || {};
    q('[data-attributes]').innerHTML = `<div class="panel-head"><h2>Atributos</h2></div><div class="tiles">${ATTRIBUTES.map(([key, label]) => tile(label, C.formatModifier(stats[key]))).join('')}</div>`;
  }

  function renderStrikes() {
    const attacks = data().attacks || [];
    q('[data-strikes]').innerHTML = `<div class="panel-head"><div><h2>Golpes</h2><p>Bônus do 1º, 2º e 3º ataque no turno, com a penalidade de ataques múltiplos.</p></div></div>${attacks.length ? attacks.map(attack => {
      const sequence = C.mapSequence(attack.bonus, attack.traits);
      return `<article class="strike"><div class="strike-head"><h3>${escapeHtml(attack.name || 'Golpe')}</h3>${sequence ? `<div class="strike-map">${sequence.map((value, i) => `<span class="${i ? 'later' : ''}">${value}</span>`).join('<span class="sep">/</span>')}</div>` : ''}</div>${attack.damage ? `<p class="strike-damage">${escapeHtml(attack.damage)}</p>` : ''}${attack.traits ? `<p class="small muted">${escapeHtml(attack.traits)}</p>` : ''}${attack.notes ? `<p class="small">${escapeHtml(attack.notes)}</p>` : ''}</article>`;
    }).join('') : `<p class="empty">Nenhum golpe ainda. Cadastre armas e ataques na <a class="accent" href="${editLink('index.html')}">Ficha</a>.</p>`}`;
  }

  function renderSkills() {
    const skills = data().skills || {};
    const rows = Object.entries(window.Mesa.skillInfo).map(([key, [name]]) => ({ key, name, value: skills[key] })).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    q('[data-skill-list]').innerHTML = `<div class="panel-head"><div><h2>Perícias</h2><p>Toque para ver para que serve cada uma.</p></div></div><div class="skill-grid">${rows.map(row => `<button type="button" class="skill ${(C.toInt(row.value) ?? 0) <= 0 ? 'low' : ''}" data-action="skill" data-key="${row.key}"><span>${escapeHtml(row.name)}</span><strong>${C.formatModifier(row.value)}</strong></button>`).join('')}</div>`;
  }

  function renderSpells() {
    const d = data(), casting = d.spellcasting || {}, spells = d.spells || [], ranks = C.slotRanks(casting);
    const focusMax = Math.max(0, C.toInt(casting.focus?.max) ?? 0), focusNow = Math.min(focusMax, Math.max(0, C.toInt(casting.focus?.current) ?? 0));
    const summary = [TRADITIONS[casting.tradition] || casting.tradition, casting.kind].filter(Boolean).join(' · ');
    const hasCasting = summary || casting.attack || casting.dc || ranks.length || focusMax || spells.length;
    const pips = (count, filled, action, label, extra = '') => Array.from({ length: count }, (_, i) => `<button type="button" class="pip ${filled(i) ? '' : 'spent'}" data-action="${action}" data-index="${i}" ${extra} aria-label="${label(i)}" ${lock()}></button>`).join('');
    q('[data-spell-summary]').innerHTML = `<div class="panel-head"><div><h2>Magias</h2><p>${escapeHtml(summary || 'Toque numa magia para ler o texto completo.')}</p></div><div class="head-actions"><button type="button" class="btn" data-action="spell-add" data-mutate>+ Magia</button><button type="button" class="btn ghost" data-action="casting-edit" data-mutate>${editingCasting ? 'Pronto' : 'Editar'}</button></div></div>
      ${hasCasting ? '' : `<p class="empty">${readOnly() ? 'Sem magias nesta ficha.' : 'Sem magias por enquanto. Use Editar para definir tradição, CD e espaços, e + Magia para trazer do catálogo.'}</p>`}
      ${casting.attack || casting.dc ? `<div class="tiles">${tile('Ataque de magia', C.formatModifier(casting.attack))}${tile('CD de magia', casting.dc, 'accent')}</div>` : ''}
      ${ranks.length || focusMax ? `<div class="slots">${ranks.map(slot => `<div class="slot-row"><span class="slot-label">${slot.rank}º</span><div class="pips">${pips(slot.max, i => i >= slot.used, 'slot', i => `Espaço ${i + 1} de ${slot.rank}º ranque: ${i < slot.used ? 'usado' : 'livre'}`, `data-rank="${slot.rank}"`)}</div><span class="small muted">${plural(slot.max - slot.used, 'livre', 'livres')}</span></div>`).join('')}${focusMax ? `<div class="slot-row"><span class="slot-label">Foco</span><div class="pips">${pips(focusMax, i => i < focusNow, 'focus', i => `Ponto de foco ${i + 1}: ${i < focusNow ? 'disponível' : 'gasto'}`)}</div><span class="small muted">${focusNow}/${focusMax}</span></div>` : ''}<div class="head-actions section-space"><button type="button" class="btn" data-action="rest" data-mutate>Descanso diário</button></div></div>` : ''}
      <div class="row-list">${C.groupSpells(spells).map(group => `<h3 class="group-title">${escapeHtml(group.label)}</h3>${group.spells.map(spell => `<button type="button" class="row-button" data-action="spell-open" data-index="${spell.index}"><span>${escapeHtml(C.displayName(spell.name) || 'Magia sem nome')}</span>${spell.notes ? `<small>${escapeHtml(spell.notes)}</small>` : ''}</button>`).join('')}`).join('')}</div>`;
    renderCastingEdit();
  }

  // Formulário de conjuração: desenhado uma vez por abertura, para não roubar o foco de quem está digitando.
  function renderCastingEdit() {
    const box = q('[data-spell-edit]');
    box.hidden = !editingCasting || readOnly();
    if (box.hidden) { box.innerHTML = ''; delete box.dataset.ready; return; }
    if (box.dataset.ready) return;
    box.dataset.ready = '1';
    box.className = 'spell-edit';
    box.innerHTML = `<div class="form-grid"><label class="field">Tradição<select data-bind="spellcasting.tradition"><option value="">—</option>${Object.entries(TRADITIONS).map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}</select></label><label class="field">Tipo<select data-bind="spellcasting.kind"><option value="">—</option><option value="preparado">Preparado</option><option value="espontâneo">Espontâneo</option></select></label><label class="field">Ataque de magia<input data-bind="spellcasting.attack" inputmode="numeric" placeholder="+7"></label><label class="field">CD de magia<input data-bind="spellcasting.dc" inputmode="numeric" placeholder="17"></label><label class="field">Pontos de foco (máximo)<input data-bind="spellcasting.focus.max" inputmode="numeric" placeholder="0"></label></div><p class="small muted section-space">Espaços de magia por ranque (máximo por dia)</p><div class="slot-edit">${Array.from({ length: 10 }, (_, i) => `<label>${i + 1}º<input data-bind="spellcasting.slots.${i + 1}.max" inputmode="numeric" placeholder="0" aria-label="Espaços de ${i + 1}º ranque"></label>`).join('')}</div>`;
    window.Mesa.bindAll(box);
  }

  function renderFeats() {
    const d = data();
    const feats = Object.entries(d.feats || {}).filter(([, value]) => String(value || '').trim()), abilities = Object.entries(d.abilities || {});
    q('[data-feat-list]').innerHTML = `<div class="panel-head"><div><h2>Talentos e habilidades</h2><p>Toque para ler a regra do livro ou a sua anotação.</p></div></div>${feats.length || abilities.length ? `<div class="row-list">${feats.length ? `<h3 class="group-title">Talentos</h3>${feats.map(([key, value]) => `<button type="button" class="row-button" data-action="feat-open" data-key="${escapeHtml(key)}"><span>${escapeHtml(C.featName(value))}</span><small>${escapeHtml(FEAT_LABELS[key] || key)}</small></button>`).join('')}` : ''}${abilities.length ? `<h3 class="group-title">Habilidades e ações</h3>${abilities.map(([key, ability]) => `<button type="button" class="row-button" data-action="ability-open" data-key="${escapeHtml(key)}"><span>${escapeHtml(ability.name || 'Habilidade')}</span>${ability.source ? `<small>${escapeHtml(ability.source)}</small>` : ''}</button>`).join('')}` : ''}</div>` : `<p class="empty">Nada anotado ainda. Talentos ficam em <a class="accent" href="${editLink('progressao.html')}">Progressão</a> e habilidades na <a class="accent" href="${editLink('index.html')}">Ficha</a>.</p>`}`;
  }

  function renderItems() {
    const d = data(), items = d.items || [], inventory = d.inventory || {}, bulk = C.totalBulk(items);
    const notes = [['Carregados', inventory.carried], ['Consumíveis', inventory.consumables], ['Equipados', inventory.equipped], ['Riqueza', inventory.wealth]].filter(([, value]) => String(value || '').trim());
    q('[data-item-list]').innerHTML = `<div class="panel-head"><div><h2>Itens</h2><p>Toque para ver a regra, a quantidade e as notas.</p></div><button type="button" class="btn" data-action="item-add" data-mutate>+ Item</button></div>
      ${items.length ? `<div class="row-list">${items.map((item, i) => `<div class="item-row"><button type="button" class="row-button" data-action="item-open" data-index="${i}"><span>${escapeHtml(C.displayName(item.name) || 'Item')}${(C.toInt(item.qty) ?? 1) > 1 ? ` <small>× ${escapeHtml(item.qty)}</small>` : ''}</span>${item.bulk ? `<small>Volume ${escapeHtml(item.bulk)}</small>` : ''}</button><label class="invested"><input type="checkbox" data-action="item-invested" data-index="${i}" ${item.invested ? 'checked' : ''} ${lock()}>Investido</label></div>`).join('')}</div><p class="bulk-total">Volume total: <strong>${C.formatNumber(bulk.total)}</strong>${bulk.unknown ? ' · há itens com volume que não é número' : ''}</p>` : `<p class="empty">${readOnly() ? 'Nenhum item com regra nesta ficha.' : 'Nenhum item com regra ainda. Use + Item para trazer do catálogo ou anotar à mão.'}</p>`}
      ${notes.length ? `<dl class="inventory-notes">${notes.map(([label, value]) => `<div><dt>${label}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl>` : ''}<p class="small muted section-space">O inventário em texto livre se edita em <a class="accent" href="${editLink('anotacoes.html')}">Anotações</a>.</p>`;
  }

  function render() { renderHero(); renderVitals(); renderConditions(); renderAttributes(); renderStrikes(); renderSkills(); renderSpells(); renderFeats(); renderItems(); }

  // Magias gravadas sem o tipo (fichas antigas ou digitadas): o catálogo diz se é truque, foco ou ritual.
  // Só completa a ficha em memória; o campo vai junto no próximo salvamento de quem pode editar.
  async function completeSpellKinds() {
    const missing = (data().spells || []).filter(spell => spell.id && !spell.kind);
    if (!missing.length) return;
    await Promise.all(missing.map(async spell => { try { spell.kind = C.spellKind(await getEntry(spell.id)); } catch { /* fica como magia comum */ } }));
    renderSpells();
  }

  // --- Janela da regra: texto do catálogo, anotação do jogador e campos editáveis ---
  function referenceLink(ref) {
    if (!ref?.book || !Number(ref.page)) return '';
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

  // Talentos e habilidades: abre já com a anotação e troca pela regra do catálogo se o nome bater.
  async function openFeat({ name, note, link }) {
    openRule({ title: name, note, link });
    const token = ruleToken;
    try {
      const result = await window.Mesa.api('search?type=feat&limit=10&q=' + encodeURIComponent(name));
      const match = result.entries.find(entry => C.normalizeName(entry.name) === C.normalizeName(name));
      if (match && token === ruleToken && ruleDialog.open) openRule({ id: match.id, title: name, note });
    } catch { /* sem catálogo, fica a anotação */ }
  }

  // --- Janela de busca no catálogo, para condições, magias e itens ---
  function openPicker({ title, types, placeholder, limit = 60, manualLabel = '', onPick, onManual = null }) {
    pickerDialog.innerHTML = `<div class="rule-head"><div><div class="eyebrow">Catálogo dos livros</div><h2>${escapeHtml(title)}</h2></div><button type="button" class="btn ghost" data-action="dialog-close">Fechar</button></div><div class="picker-tools ${types.length > 1 ? 'with-type' : ''}"><input type="search" data-picker-q placeholder="${escapeHtml(placeholder)}" autocomplete="off" aria-label="Buscar no catálogo">${types.length > 1 ? `<select data-picker-type aria-label="Tipo">${types.map(([value, label]) => `<option value="${value}">${escapeHtml(label)}</option>`).join('')}</select>` : ''}</div><p class="small muted" data-picker-status role="status"></p><div class="picker-results" data-picker-results></div>${onManual ? `<button type="button" class="btn ghost" data-picker-manual>${escapeHtml(manualLabel)}</button>` : ''}`;
    const input = pickerDialog.querySelector('[data-picker-q]'), select = pickerDialog.querySelector('[data-picker-type]');
    const results = pickerDialog.querySelector('[data-picker-results]'), status = pickerDialog.querySelector('[data-picker-status]');
    let timer, found = [];
    async function search() {
      const token = ++pickerToken, type = select ? select.value : types[0][0], term = input.value.trim();
      status.textContent = 'Buscando…';
      try {
        const result = await window.Mesa.api(`search?type=${type}&limit=${limit}${term ? '&q=' + encodeURIComponent(term) : ''}`);
        if (token !== pickerToken) return;
        found = result.entries;
        status.textContent = found.length ? '' : term ? 'Nada encontrado com esse nome.' : 'Ainda não há nada deste tipo no catálogo.';
        results.innerHTML = found.map((entry, i) => `<button type="button" class="row-button" data-pick="${i}"><span>${escapeHtml(C.displayName(entry.name))}</span><small>${escapeHtml([levelLabel(entry), entry.category, String(entry.traits || '').split(',').slice(0, 3).join(',')].filter(Boolean).join(' · '))}</small></button>`).join('');
      } catch (error) { if (token === pickerToken) status.textContent = error.message; }
    }
    input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(search, 220); });
    select?.addEventListener('change', search);
    results.addEventListener('click', async event => {
      const button = event.target.closest('[data-pick]');
      if (!button) return;
      button.disabled = true;
      try { await onPick(found[Number(button.dataset.pick)]); pickerDialog.close(); } catch (error) { status.textContent = error.message; button.disabled = false; }
    });
    pickerDialog.querySelector('[data-picker-manual]')?.addEventListener('click', () => {
      const name = input.value.trim();
      if (!name) { status.textContent = 'Digite o nome no campo de busca e toque de novo.'; input.focus(); return; }
      onManual(name);
      pickerDialog.close();
    });
    pickerDialog.showModal();
    input.focus();
    search();
  }

  // --- Ações (um único ouvinte para a página e as duas janelas) ---
  const clampInt = (value, max = Infinity) => Math.min(max, Math.max(0, C.toInt(value) ?? 0));
  const ACTIONS = {
    'dialog-close': el => el.closest('dialog').close(),
    damage: () => applyHp(C.applyDamage),
    heal: () => applyHp(C.applyHealing),
    temp: () => applyHp(C.applyTemp),
    hero: (el, i) => change(d => { d.heroPoints = String(clampInt(d.heroPoints, 3) === i + 1 ? i : i + 1); }),
    'condition-add': () => openPicker({ title: 'Adicionar condição', types: [['condition', 'Condições']], limit: 100, placeholder: 'Ex.: assustado, desprevenido…', onPick: entry => change(d => { if (!d.conditions.some(item => C.normalizeName(item.name) === C.normalizeName(entry.name))) d.conditions.push({ id: entry.id, name: entry.name, value: C.conditionHasValue(entry.name) ? '1' : '' }); }) }),
    'condition-open': (el, i) => { const condition = data().conditions[i]; openRule({ id: condition.id, title: condition.name + (condition.value ? ' ' + condition.value : '') }); },
    'condition-inc': (el, i) => change(d => { d.conditions[i].value = String(clampInt(d.conditions[i].value) + 1); }),
    'condition-dec': (el, i) => change(d => { const value = clampInt(d.conditions[i].value) - 1; if (value <= 0) d.conditions.splice(i, 1); else d.conditions[i].value = String(value); }),
    'condition-remove': (el, i) => change(d => { d.conditions.splice(i, 1); }),
    skill: el => window.Mesa.openHelp(...window.Mesa.skillInfo[el.dataset.key]),
    slot: (el, i) => change(d => { const slot = d.spellcasting.slots[el.dataset.rank] ||= {}; slot.used = String(i < clampInt(slot.used) ? i : i + 1); }),
    focus: (el, i) => change(d => { const focus = d.spellcasting.focus ||= {}; focus.current = String(i < clampInt(focus.current) ? i : i + 1); }),
    rest: () => { if (confirm('Descanso diário: todos os espaços de magia voltam a ficar livres e o foco volta ao máximo. Confirmar?')) change(d => { d.spellcasting = C.dailyRest(d.spellcasting); }); },
    'casting-edit': () => { editingCasting = !editingCasting; renderSpells(); if (editingCasting) q('[data-spell-edit] select')?.focus(); },
    'spell-add': () => openPicker({ title: 'Adicionar magia', types: [['spell', 'Magias e truques'], ['focus', 'Magias de foco'], ['ritual', 'Rituais']], placeholder: 'Ex.: escudo, bola de fogo…', manualLabel: 'Adicionar com o nome digitado (sem regra)', onPick: entry => change(d => { d.spells.push({ id: entry.id, name: entry.name, rank: String(entry.level ?? 1), kind: C.spellKind(entry), notes: '' }); }), onManual: name => change(d => { d.spells.push({ id: '', name, rank: '1', kind: 'magia', notes: '' }); }) }),
    'spell-open': (el, i) => {
      const spell = data().spells[i], canEdit = !readOnly();
      openRule({ id: spell.id, title: C.displayName(spell.name), note: canEdit ? '' : spell.notes, edit: canEdit ? `${(spell.kind || 'magia') === 'magia' ? `<label class="field">Ranque em que você a usa<input data-bind="spells.${i}.rank" inputmode="numeric"></label>` : ''}<label class="field">Notas<input data-bind="spells.${i}.notes" placeholder="Ex.: preparada 2x"></label>` : '', actions: canEdit ? `<button type="button" class="btn remove" data-action="spell-remove" data-index="${i}">Remover magia</button>` : '' });
    },
    'spell-remove': (el, i) => { if (!confirm(`Remover ${C.displayName(data().spells[i].name)} da lista?`)) return; ruleDialog.close(); change(d => { d.spells.splice(i, 1); }); },
    'feat-open': el => { const d = data(), text = String(d.feats[el.dataset.key] || ''), name = C.featName(text); openFeat({ name, note: text !== name ? text : '', link: d.fieldReferences?.['feats_' + el.dataset.key] }); },
    'ability-open': el => { const ability = data().abilities[el.dataset.key] || {}; openFeat({ name: ability.name || 'Habilidade', note: [ability.effect, ability.source].filter(Boolean).join('\n\n'), link: ability.reference }); },
    'item-add': () => openPicker({ title: 'Adicionar item', types: [['item', 'Itens']], placeholder: 'Ex.: espada longa, poção de cura…', manualLabel: 'Adicionar com o nome digitado (sem regra)', onPick: async entry => { let bulk = ''; try { bulk = (await getEntry(entry.id)).data?.bulk || ''; } catch { /* volume fica em branco */ } change(d => { d.items.push({ id: entry.id, name: entry.name, qty: '1', bulk: String(bulk), invested: false, notes: '' }); }); }, onManual: name => change(d => { d.items.push({ id: '', name, qty: '1', bulk: '', invested: false, notes: '' }); }) }),
    'item-open': (el, i) => {
      const item = data().items[i], canEdit = !readOnly();
      openRule({ id: item.id, title: C.displayName(item.name), note: canEdit ? '' : item.notes, edit: canEdit ? `<div class="form-grid"><label class="field">Quantidade<input data-bind="items.${i}.qty" inputmode="numeric"></label><label class="field">Volume<input data-bind="items.${i}.bulk" placeholder="L, 1, 2…"></label></div><label class="field">Notas<input data-bind="items.${i}.notes" placeholder="Runas, cargas, de onde veio…"></label>` : '', actions: canEdit ? `<button type="button" class="btn remove" data-action="item-remove" data-index="${i}">Remover item</button>` : '' });
    },
    'item-remove': (el, i) => { if (!confirm(`Remover ${C.displayName(data().items[i].name)}?`)) return; ruleDialog.close(); change(d => { d.items.splice(i, 1); }); },
  };

  function applyHp(calc) {
    const input = q('#hp-amount'), amount = C.toInt(input?.value);
    if (!amount || amount < 0) { input?.focus(); return; }
    change(d => { Object.assign(d.stats, calc(d.stats, amount)); });
  }

  document.addEventListener('click', event => {
    const el = event.target.closest('[data-action]');
    if (!el || el.dataset.action === 'item-invested' || !ACTIONS[el.dataset.action]) return;
    if (!root.contains(el) && !ruleDialog.contains(el) && !pickerDialog.contains(el)) return;
    ACTIONS[el.dataset.action](el, Number(el.dataset.index));
  });
  root.addEventListener('change', event => {
    const box = event.target.closest('[data-action="item-invested"]');
    if (box) change(d => { d.items[Number(box.dataset.index)].invested = box.checked; });
  });
  // Campos de conjuração gravam pelo data-bind do app.js; aqui só redesenhamos o resumo.
  root.addEventListener('input', event => { if (event.target.matches('[data-bind^="spellcasting."]')) renderSpells(); });
  ruleDialog.addEventListener('close', () => render());
  document.addEventListener('mesa:ficha', () => {
    render();
    completeSpellKinds();
    document.querySelectorAll('nav a').forEach(link => link.classList.toggle('active', (link.getAttribute('href') || '').startsWith('sessao.html')));
  });
})();
