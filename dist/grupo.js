// Painel do grupo: PV, defesas e condições de todos os personagens dos jogadores numa tela, atualizando sozinho.
// Qualquer pessoa da mesa vê o resumo (GET /api/party); a ficha completa abre só para o dono e, em leitura, para o mestre.
// As fichas próprias do mestre (criaturas e NPCs) aparecem só para ele.
// Página independente (sem app.js): só lê a API; cada jogador edita a própria ficha na página Sessão.
(() => {
  const C = window.FichaCalc;
  const main = document.querySelector('[data-group]');
  const statusLine = main.querySelector('[data-status]'), sortSelect = main.querySelector('[data-sort]');
  const REFRESH_MS = 20000;
  const HP_LABELS = { ok: 'PV cheios', ferido: 'Com dano', critico: 'Em perigo', caido: '0 PV' };
  let list = [], signature = '', loading = false, master = false;
  const escapeHtml = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  async function api(path) {
    const response = await fetch('/api/' + path, { cache: 'no-store' });
    let result; try { result = await response.json(); } catch { result = { error: 'Resposta inválida do servidor.' }; }
    if (!response.ok) { const error = new Error(result.error || 'Falha de conexão.'); error.status = response.status; throw error; }
    return result;
  }
  function setStatus(message, state = '') { statusLine.textContent = message; statusLine.dataset.state = state; }

  function gate(message, login) {
    main.innerHTML = `<section class="panel"><div class="eyebrow">A mesa</div><h1>Painel do grupo</h1><p>${escapeHtml(message)}</p>${login ? '<a class="btn primary" target="_top" href="/signin-with-chatgpt?return_to=%2Fgrupo.html">Entrar</a>' : '<a class="btn primary" href="mesa.html">Voltar à mesa</a>'}</section>`;
  }

  function card(item) {
    const data = item.data || {}, stats = data.stats || {}, profile = data.profile || {}, hp = C.hpState(stats);
    const hero = C.toInt(data.heroPoints) ?? 0;
    const who = [[profile.className, profile.level ? 'nível ' + profile.level : ''].filter(Boolean).join(' '), profile.player || (item.owned ? '' : item.ownerEmail)].filter(Boolean).join(' · ');
    const stat = (label, value) => `<div><dt>${label}</dt><dd>${escapeHtml(value || '—')}</dd></div>`;
    const conditions = (data.conditions || []).map(condition => `<span class="chip condition-chip">${escapeHtml(condition.name)}${condition.value ? ` <strong>${escapeHtml(condition.value)}</strong>` : ''}</span>`).join('');
    // Só abre a ficha quem pode lê-la: o dono e o mestre. Para os outros o cartão é só leitura.
    const open = item.owned || master;
    return `<${open ? `a class="party-card" href="sessao.html?character=${encodeURIComponent(item.id)}"` : 'article class="party-card"'} data-state="${hp.state}"><div class="card-top"><div><h3>${escapeHtml(item.name || profile.name || 'Sem nome')}</h3><p>${escapeHtml(who)}</p></div><div class="armor" title="Classe de armadura"><span>CA</span><strong>${escapeHtml(stats.ac || '—')}</strong></div></div>
      <div class="hp-line"><strong>${hp.current}</strong><span class="max">/ ${hp.max ?? '—'} PV</span>${hp.temp ? `<span class="temp">+${hp.temp} temp.</span>` : ''}<span class="state">${hp.max == null ? '' : HP_LABELS[hp.state]}</span></div>
      <div class="party-bar"><span style="width:${hp.percent ?? 100}%"></span></div>
      <dl class="mini-stats">${stat('Percepção', C.formatModifier(stats.perception))}${stat('Fortitude', C.formatModifier(stats.fort))}${stat('Reflexos', C.formatModifier(stats.reflex))}${stat('Vontade', C.formatModifier(stats.will))}${stat('CD de classe', stats.classDc)}${stat('CD de magia', data.spellcasting?.dc)}</dl>
      ${conditions || hero ? `<div class="chips">${conditions}${hero ? `<span class="chip">Heroísmo <strong>${hero}</strong></span>` : ''}</div>` : ''}</${open ? 'a' : 'article'}>`;
  }

  function render() {
    const withStats = item => ({ ...item, stats: item.data?.stats || {} });
    const players = C.sortSheets(list.filter(item => !master || !item.owned).map(withStats), sortSelect.value);
    main.querySelector('[data-players]').innerHTML = players.length ? players.map(card).join('') : `<div class="note party-empty">${master ? 'Nenhum jogador com ficha ainda. Convide a mesa pela tela de Personagens.' : 'Ninguém da mesa tem ficha ainda.'}</div>`;
    main.querySelector('[data-player-count]').textContent = players.length ? players.length + (players.length === 1 ? ' personagem' : ' personagens') : '';
    if (!master) return;
    const own = C.sortSheets(list.filter(item => item.owned).map(withStats), sortSelect.value);
    main.querySelector('[data-master-sheets]').innerHTML = own.length ? own.map(card).join('') : '<p class="small muted party-empty">Nenhuma ficha sua ainda. Crie fichas para criaturas e NPCs na tela de Personagens.</p>';
    main.querySelector('[data-master-count]').textContent = own.length ? '(' + own.length + ')' : '';
  }

  // Um pedido leve por vez com o resumo de todos; sem mudança, não redesenha.
  async function refresh() {
    if (loading) return;
    loading = true;
    try {
      const next = (await api('party')).characters, nextSignature = JSON.stringify(next);
      if (nextSignature !== signature) { list = next; signature = nextSignature; render(); }
      setStatus('Atualizado às ' + new Date().toLocaleTimeString('pt-BR'), 'saved');
    } catch (error) {
      setStatus(error.message + ' · mostrando os últimos dados.', 'offline');
    } finally {
      loading = false;
    }
  }

  async function init() {
    let session;
    try { session = await api('session'); } catch (error) { gate(error.message, error.status === 401 || error.status === 403); return; }
    master = session.user.role === 'master';
    main.querySelector('[data-master-block]').hidden = !master;
    document.querySelector('[data-hint]').textContent = master ? 'Toque num cartão para abrir a ficha completa' : 'Toque no seu cartão para abrir a sua ficha';
    sortSelect.addEventListener('change', render);
    main.querySelector('[data-refresh]').addEventListener('click', refresh);
    await refresh();
    setInterval(() => { if (!document.hidden) refresh(); }, REFRESH_MS);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  }
  init();
  // Ctrl+K abre a busca de regras, como nas outras páginas.
  document.addEventListener('keydown', event => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); location.href = 'busca.html'; } });
})();
