// Regras do catálogo SRD: rótulos e montagem do detalhe de uma entrada (GET /api/entries/:id).
// Compartilhado pela busca, pela página Sessão e pelo painel do grupo como window.Regras.
(() => {
  const TYPE_LABELS = { spell: 'Magia', focus: 'Magia de foco', ritual: 'Ritual', feat: 'Talento', class: 'Classe', ancestry: 'Ancestralidade', condition: 'Condição', item: 'Item' };
  const BOOK_NAMES = { livro1: 'Livro 1', livro2: 'Livro 2' };
  const escapeHtml = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  // o servidor marca os termos com \x01/\x02; escapamos o texto e transformamos as marcas em <mark>
  const markify = value => escapeHtml(value).replace(/\x01/g, '<mark>').replace(/\x02/g, '</mark>');
  // O texto extraído traz as quebras de linha das colunas do PDF: junta a linha quando a seguinte continua a frase
  // (começa em minúscula, número, parêntese ou travessão). "Sucesso crítico", "Falha" etc. seguem em linha própria.
  const reflow = text => String(text ?? '').replace(/\n(?=[a-zà-ÿ0-9(–—-])/g, ' ');

  function metaLine(entry) {
    const parts = [TYPE_LABELS[entry.type] || entry.type];
    if (entry.level != null) parts.push('nível ' + entry.level);
    if (entry.category) parts.push(entry.category);
    parts.push(`${BOOK_NAMES[entry.book] || entry.book}, p. ${entry.page}`);
    return parts.join(' · ');
  }

  function fieldRow(label, value) {
    if (!value) return '';
    return `<div class="detail-field"><span>${escapeHtml(label)}</span><div>${escapeHtml(value)}</div></div>`;
  }

  function bookLink(entry) {
    return `<a class="btn" href="livro.html?book=${encodeURIComponent(entry.book)}&page=${entry.page}" target="_blank" rel="noopener">Ver no livro ↗</a>`;
  }

  // Corpo da regra, sem cabeçalho: campos do tipo, texto e elevações.
  function bodyHtml(entry) {
    const d = entry.data || {};
    if (entry.type === 'spell' || entry.type === 'focus' || entry.type === 'ritual') {
      return fieldRow('Tradições', d.traditions) + fieldRow('Domínio', d.domain) + fieldRow('Patrono', d.patron) +
        fieldRow('Tempo de execução', d.time) + fieldRow('Distância', d.range) + fieldRow('Alvos', d.targets) +
        fieldRow('Área', d.area) + fieldRow('Defesa', d.defense) + fieldRow('Duração', d.duration) + fieldRow('Custo', d.cost) +
        fieldRow('Requerimentos', d.requirements) + fieldRow('Teste primário', d.primaryCheck) + fieldRow('Testes secundários', d.secondaryChecks) +
        (d.text ? `<p class="detail-text">${escapeHtml(reflow(d.text))}</p>` : '') +
        (d.heightened?.length ? `<h4>Elevações</h4>` + d.heightened.map(h => `<p class="detail-text"><strong>(+${h.plus})</strong> ${escapeHtml(reflow(h.text))}</p>`).join('') : '');
    }
    if (entry.type === 'feat') {
      return fieldRow('Categoria', d.category || entry.category) + fieldRow('Pré-requisitos', d.prerequisites) +
        fieldRow(d.actions === 'reaction' || d.actions === 'free-action' ? 'Acionamento' : 'Gatilho', d.trigger) +
        (d.text ? `<p class="detail-text">${escapeHtml(reflow(d.text))}</p>` : '');
    }
    if (entry.type === 'class') {
      return fieldRow('PV por nível', d.hpPerLevel) + fieldRow('Atributo-chave', d.keyAttribute) +
        (d.proficiencies ? `<h4>Proficiências iniciais</h4><pre class="detail-pre">${escapeHtml(d.proficiencies)}</pre>` : '') +
        (d.progression?.length ? `<h4>Progressão</h4><div class="table-wrap"><table><thead><tr><th>Nível</th><th>Características de classe</th></tr></thead><tbody>` +
          d.progression.map(row => `<tr><td class="level-cell">${row.level}</td><td>${escapeHtml(row.features)}</td></tr>`).join('') + '</tbody></table></div>' : '');
    }
    if (entry.type === 'ancestry') {
      return fieldRow('Pontos de vida', d.hp) + fieldRow('Tamanho', d.size) + fieldRow('Velocidade', d.speed) +
        fieldRow('Melhorias de atributo', (d.boosts || []).join(', ')) + fieldRow('Defeitos de atributo', (d.flaws || []).join(', ')) +
        fieldRow('Idiomas', d.languages) + fieldRow('Traços', (d.traits || []).join(', ')) +
        (d.heritages?.length ? `<h4>Heranças</h4>` + d.heritages.map(h => `<p class="detail-text"><strong>${escapeHtml(h.name)}</strong> ${escapeHtml(reflow(h.text))}</p>`).join('') : '');
    }
    return d.text ? `<p class="detail-text">${escapeHtml(reflow(d.text))}</p>` : '';
  }

  // Detalhe completo: cabeçalho com "Ver no livro" (mais os botões de `actions`), traços e corpo.
  function detailHtml(entry, { actions = '' } = {}) {
    return `<div class="panel-head"><div><div class="eyebrow">${TYPE_LABELS[entry.type] || entry.type}${entry.level != null ? ' · nível ' + entry.level : ''}</div><h2>${escapeHtml(entry.name)}</h2><p class="small muted">${escapeHtml(metaLine(entry))}</p></div><div class="detail-actions">${bookLink(entry)}${actions}</div></div>
  ${(entry.traits || []).length ? `<div class="chips">${entry.traits.map(t => `<span class="chip">${escapeHtml(t)}</span>`).join('')}</div>` : ''}${bodyHtml(entry)}`;
  }

  window.Regras = { TYPE_LABELS, BOOK_NAMES, escapeHtml, markify, reflow, metaLine, bookLink, bodyHtml, detailHtml };
})();
