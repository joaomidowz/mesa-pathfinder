// Busca SRD: consulta às regras estruturadas extraídas dos livros. Rótulos e detalhe vêm de regras.js.
const { TYPE_LABELS, BOOK_NAMES, escapeHtml, markify, metaLine } = window.Regras;
const fields = ['q', 'type', 'level', 'book', 'trait'].map(id => document.getElementById(id));
const [input, typeInput, levelInput, bookInput, traitInput] = fields;
const results = document.getElementById('results');
const detail = document.getElementById('detail');
const status = document.getElementById('search-status');
const statsBox = document.getElementById('stats');
const layout = document.querySelector('.search-layout');
// Mesmo corte do styles.css: abaixo dele o detalhe abre logo depois do cartão tocado, e não no fim da lista.
const narrow = window.matchMedia('(max-width: 1000px)');
let currentEntry = null;

for (let level = 1; level <= 20; level++) {
  const option = document.createElement('option');
  option.value = String(level);
  option.textContent = String(level);
  levelInput.append(option);
}

async function api(path) {
  let response;
  try { response = await fetch('/api/' + path, { cache: 'no-store' }); }
  catch { throw new Error('Sem conexão com a mesa.'); }
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Falha na busca.');
  return result;
}

function state() {
  const params = new URLSearchParams();
  for (const [key, el] of [['q', input], ['type', typeInput], ['level', levelInput], ['book', bookInput], ['trait', traitInput]]) {
    if (el.value.trim()) params.set(key, el.value.trim());
  }
  return params;
}

function entryCard(entry) {
  const traits = (entry.traits || '').split(',').map(t => t.trim()).filter(Boolean).slice(0, 6);
  const card = document.createElement('article');
  card.className = 'result-card' + (currentEntry && currentEntry === entry.id ? ' selected' : '');
  card.innerHTML = `<h3>${markify(entry.name)}</h3><p class="small muted">${escapeHtml(metaLine(entry))}</p>` +
    (traits.length ? `<div class="chips">${traits.map(t => `<span class="chip">${escapeHtml(t)}</span>`).join('')}</div>` : '') +
    (entry.snippet ? `<p class="result-snippet small">${markify(entry.snippet)}</p>` : '');
  card.addEventListener('click', () => openDetail(entry, card));
  return card;
}

function pageCard(page) {
  const card = document.createElement('a');
  card.className = 'result-card page-result';
  card.href = `livro.html?book=${encodeURIComponent(page.book)}&page=${page.page}`;
  card.target = '_blank';
  card.rel = 'noopener';
  card.innerHTML = `<h3>Página — ${BOOK_NAMES[page.book] || page.book}, p. ${page.page}</h3><p class="small muted">${escapeHtml(page.chapter || '')}</p>` +
    (page.snippet ? `<p class="result-snippet small">${markify(page.snippet)}</p>` : '');
  return card;
}

function closeDetail() {
  detail.hidden = true;
  currentEntry = null;
  layout.append(detail);
  results.querySelector('.result-card.selected')?.classList.remove('selected');
}

async function openDetail(entry, card) {
  currentEntry = entry.id;
  results.querySelector('.result-card.selected')?.classList.remove('selected');
  card.classList.add('selected');
  try {
    const full = await api('entries/' + encodeURIComponent(entry.id));
    if (currentEntry !== entry.id) return; // outro cartão foi tocado enquanto este carregava
    detail.innerHTML = window.Regras.detailHtml(full, { actions: '<button class="btn ghost" id="detail-close" type="button">Fechar</button>' });
    if (narrow.matches && card.isConnected) card.after(detail); else layout.append(detail);
    detail.hidden = false;
    detail.querySelector('#detail-close').addEventListener('click', closeDetail);
    detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (error) { status.textContent = error.message; }
}

function render(data) {
  // O detalhe aberto dentro da lista (telas estreitas) fecha junto com os cartões que ele acompanhava.
  if (results.contains(detail)) closeDetail();
  results.replaceChildren();
  if (data.entries.length) {
    const head = document.createElement('h2');
    head.textContent = 'Regras encontradas';
    results.append(head);
    for (const entry of data.entries) results.append(entryCard(entry));
  }
  if (data.pages?.length) {
    const head = document.createElement('h2');
    head.className = 'section-space';
    head.textContent = 'Páginas dos livros';
    results.append(head);
    for (const page of data.pages) results.append(pageCard(page));
  }
  if (!data.entries.length && !data.pages?.length) {
    const empty = document.createElement('div');
    empty.className = 'note';
    empty.textContent = data.hint || 'Nada encontrado. Tente termos menores ou sem acento, ou mude os filtros.';
    results.append(empty);
  }
}

let timer = null, seq = 0;
async function run(quiet) {
  const params = state();
  const id = ++seq;
  history.replaceState(null, '', 'busca.html' + (params.toString() ? '?' + params : ''));
  if (!quiet) status.textContent = 'Buscando…';
  try {
    const data = await api('search?' + params.toString() + '&limit=40');
    if (id !== seq) return;
    const total = data.entries.length + (data.pages?.length || 0);
    status.textContent = params.get('q') ? `${total} resultado(s) para “${params.get('q')}”.` : `${total} entrada(s) nos filtros atuais.`;
    render(data);
  } catch (error) {
    if (id === seq) status.textContent = error.message;
  }
}

function debounced() { clearTimeout(timer); timer = setTimeout(() => run(), 220); }

document.getElementById('search-form').addEventListener('submit', event => { event.preventDefault(); run(); });
input.addEventListener('input', debounced);
traitInput.addEventListener('input', debounced);
for (const el of [typeInput, levelInput, bookInput]) el.addEventListener('change', () => run());

(async () => {
  const params = new URLSearchParams(location.search);
  for (const [key, el] of [['q', input], ['type', typeInput], ['level', levelInput], ['book', bookInput], ['trait', traitInput]]) {
    if (params.get(key)) el.value = params.get(key);
  }
  input.focus();
  input.select();
  try {
    const stats = await api('srd/stats');
    statsBox.innerHTML = stats.types.map(row =>
      `<button type="button" class="chip" data-type="${row.type}"><strong>${row.count}</strong> ${TYPE_LABELS[row.type] || row.type}</button>`).join('') +
      `<span class="chip"><strong>${stats.total}</strong> entradas</span>`;
    statsBox.querySelectorAll('[data-type]').forEach(chip => chip.addEventListener('click', () => {
      typeInput.value = typeInput.value === chip.dataset.type ? '' : chip.dataset.type;
      run();
    }));
  } catch { /* stats são decorativos */ }
  if (params.toString()) run(); else run(true);
})();
