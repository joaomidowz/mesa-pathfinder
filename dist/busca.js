// Busca SRD: consulta às regras estruturadas extraídas dos livros.
const TYPE_LABELS = { spell: 'Magia', focus: 'Magia de foco', ritual: 'Ritual', feat: 'Talento', class: 'Classe', ancestry: 'Ancestralidade', condition: 'Condição' };
const BOOK_NAMES = { livro1: 'Livro 1', livro2: 'Livro 2' };
const escapeHtml = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// o servidor marca os termos com \x01/\x02; escapamos o texto e transformamos as marcas em <mark>
const markify = value => escapeHtml(value).replace(/\x01/g, '<mark>').replace(/\x02/g, '</mark>');
const fields = ['q', 'type', 'level', 'book', 'trait'].map(id => document.getElementById(id));
const [input, typeInput, levelInput, bookInput, traitInput] = fields;
const results = document.getElementById('results');
const detail = document.getElementById('detail');
const status = document.getElementById('search-status');
const statsBox = document.getElementById('stats');
let currentEntry = null;

for (let level = 1; level <= 20; level++) {
  const option = document.createElement('option');
  option.value = String(level);
  option.textContent = String(level);
  levelInput.append(option);
}

async function api(path) {
  const response = await fetch('/api/' + path, { cache: 'no-store' });
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

function metaLine(entry) {
  const parts = [TYPE_LABELS[entry.type] || entry.type];
  if (entry.level != null) parts.push('nível ' + entry.level);
  if (entry.category) parts.push(entry.category);
  parts.push(`${BOOK_NAMES[entry.book] || entry.book}, p. ${entry.page}`);
  return parts.join(' · ');
}

function entryCard(entry) {
  const traits = (entry.traits || '').split(',').map(t => t.trim()).filter(Boolean).slice(0, 6);
  const card = document.createElement('article');
  card.className = 'result-card' + (currentEntry && currentEntry === entry.id ? ' selected' : '');
  card.innerHTML = `<h3>${markify(entry.name)}</h3><p class="small muted">${escapeHtml(metaLine(entry))}</p>` +
    (traits.length ? `<div class="chips">${traits.map(t => `<span class="chip">${escapeHtml(t)}</span>`).join('')}</div>` : '') +
    (entry.snippet ? `<p class="result-snippet small">${markify(entry.snippet)}</p>` : '');
  card.addEventListener('click', () => openDetail(entry));
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

function fieldRow(label, value) {
  if (!value) return '';
  return `<div class="detail-field"><span>${escapeHtml(label)}</span><div>${escapeHtml(value)}</div></div>`;
}

function detailHtml(entry) {
  const d = entry.data || {};
  const bookLink = `<a class="btn" href="livro.html?book=${encodeURIComponent(entry.book)}&page=${entry.page}" target="_blank" rel="noopener">Ver no livro ↗</a>`;
  let body = '';
  if (entry.type === 'spell' || entry.type === 'focus' || entry.type === 'ritual') {
    body = fieldRow('Tradições', d.traditions) + fieldRow('Domínio', d.domain) + fieldRow('Patrono', d.patron) +
      fieldRow('Tempo de execução', d.time) + fieldRow('Distância', d.range) + fieldRow('Alvos', d.targets) +
      fieldRow('Área', d.area) + fieldRow('Defesa', d.defense) + fieldRow('Duração', d.duration) + fieldRow('Custo', d.cost) +
      fieldRow('Requerimentos', d.requirements) + fieldRow('Teste primário', d.primaryCheck) + fieldRow('Testes secundários', d.secondaryChecks) +
      (d.text ? `<p class="detail-text">${escapeHtml(d.text)}</p>` : '') +
      (d.heightened?.length ? `<h4>Elevações</h4>` + d.heightened.map(h => `<p class="detail-text"><strong>(+${h.plus})</strong> ${escapeHtml(h.text)}</p>`).join('') : '');
  } else if (entry.type === 'feat') {
    body = fieldRow('Categoria', d.category || entry.category) + fieldRow('Pré-requisitos', d.prerequisites) +
      fieldRow(d.actions === 'reaction' || d.actions === 'free-action' ? 'Acionamento' : 'Gatilho', d.trigger) +
      (d.text ? `<p class="detail-text">${escapeHtml(d.text)}</p>` : '');
  } else if (entry.type === 'class') {
    body = fieldRow('PV por nível', d.hpPerLevel) + fieldRow('Atributo-chave', d.keyAttribute) +
      (d.proficiencies ? `<h4>Proficiências iniciais</h4><pre class="detail-pre">${escapeHtml(d.proficiencies)}</pre>` : '') +
      (d.progression?.length ? `<h4>Progressão</h4><div class="table-wrap"><table><thead><tr><th>Nível</th><th>Características de classe</th></tr></thead><tbody>` +
        d.progression.map(row => `<tr><td class="level-cell">${row.level}</td><td>${escapeHtml(row.features)}</td></tr>`).join('') + '</tbody></table></div>' : '');
  } else if (entry.type === 'ancestry') {
    body = fieldRow('Pontos de vida', d.hp) + fieldRow('Tamanho', d.size) + fieldRow('Velocidade', d.speed) +
      fieldRow('Melhorias de atributo', (d.boosts || []).join(', ')) + fieldRow('Defeitos de atributo', (d.flaws || []).join(', ')) +
      fieldRow('Idiomas', d.languages) + fieldRow('Traços', (d.traits || []).join(', ')) +
      (d.heritages?.length ? `<h4>Heranças</h4>` + d.heritages.map(h => `<p class="detail-text"><strong>${escapeHtml(h.name)}</strong> ${escapeHtml(h.text)}</p>`).join('') : '');
  } else {
    body = d.text ? `<p class="detail-text">${escapeHtml(d.text)}</p>` : '';
  }
  const close = `<button class="btn ghost" id="detail-close" type="button">Fechar</button>`;
  return `<div class="panel-head"><div><div class="eyebrow">${TYPE_LABELS[entry.type] || entry.type}${entry.level != null ? ' · nível ' + entry.level : ''}</div><h2>${escapeHtml(entry.name)}</h2><p class="small muted">${escapeHtml(metaLine(entry))}</p></div><div class="detail-actions">${bookLink}${close}</div></div>
  ${(entry.traits || []).length ? `<div class="chips">${entry.traits.map(t => `<span class="chip">${escapeHtml(t)}</span>`).join('')}</div>` : ''}${body}`;
}

async function openDetail(entry) {
  currentEntry = entry.id;
  try {
    const full = await api('entries/' + encodeURIComponent(entry.id));
    detail.innerHTML = detailHtml(full);
    detail.hidden = false;
    detail.querySelector('#detail-close').addEventListener('click', () => { detail.hidden = true; currentEntry = null; render(currentCache); });
    detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (error) { status.textContent = error.message; }
}

let currentCache = { entries: [], pages: [] };
function render(data) {
  currentCache = data;
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
