// Regras do catálogo SRD: rótulos e montagem do detalhe de uma entrada (GET /api/entries/:id).
// Compartilhado pela busca, pela página Sessão e pelo painel do grupo como window.Regras.
(() => {
  const TYPE_LABELS = { spell: 'Magia', focus: 'Magia de foco', ritual: 'Ritual', feat: 'Talento', class: 'Classe', ancestry: 'Ancestralidade', condition: 'Condição', item: 'Item', creature: 'Criatura', hazard: 'Perigo', affliction: 'Aflição', vehicle: 'Veículo' };
  // Nomes do cadastro (scripts/livros.mjs). A lista só dá nome: quem vê cada livro é o servidor que decide.
  const BOOK_NAMES = { livro1: 'Livro do Jogador 1', livro2: 'Livro do Jogador 2', ocultos: 'Arquivos Ocultos', elementos: 'Fúria dos Elementos', polvora: 'Pólvora e Engrenagens', mestre: 'Livro do Mestre', bestiario1: 'Bestiário 1', bestiario2: 'Bestiário 2', mitos: 'Monstros dos Mitos' };
  const escapeHtml = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  // o servidor marca os termos com \x01/\x02; escapamos o texto e transformamos as marcas em <mark> (e os glifos de ação)
  const markify = value => actionGlyphs(escapeHtml(value).replace(/\x01/g, '<mark>').replace(/\x02/g, '</mark>'));
  // O texto extraído traz as quebras de linha das colunas do PDF: junta a linha quando a seguinte continua a frase
  // (começa em minúscula, número, parêntese ou travessão). "Sucesso crítico", "Falha" etc. seguem em linha própria.
  const reflow = text => String(text ?? '').replace(/\n(?=[a-zà-ÿ0-9(–—-])/g, ' ');
  // Glifos de ação do texto extraído ("[two-actions]") viram símbolos curtos; o nome vai para o leitor de tela e o title.
  const ACTION_GLYPHS = { 'one-action': ['◆', '1 ação'], 'two-actions': ['◆◆', '2 ações'], 'three-actions': ['◆◆◆', '3 ações'], reaction: ['⟲', 'reação'], 'free-action': ['◇', 'ação livre'] };
  // Recebe HTML já escapado: os marcadores não têm caractere que o escape mude.
  const actionGlyphs = html => html.replace(/\[(one-action|two-actions|three-actions|reaction|free-action)\]/g, (_, glyph) => `<span class="action-glyph" role="img" aria-label="${ACTION_GLYPHS[glyph][1]}" title="${ACTION_GLYPHS[glyph][1]}">${ACTION_GLYPHS[glyph][0]}</span>`);
  // Texto corrido: junta as linhas, escapa (o texto nunca vira HTML) e troca os glifos.
  const prose = text => actionGlyphs(escapeHtml(reflow(text)));

  // Bloco de estatísticas (criatura, perigo, aflição, veículo): o texto vem uma linha por campo ("CA 16; Fort +7, Ref +7").
  // A linha que começa por um rótulo conhecido (ou pelo nome de uma habilidade seguido de glifo) sai com ele em negrito,
  // e também os rótulos depois de ";", "," ou do glifo (Fort, Ref, Von, Des, Dano, Gatilho…); as outras linhas (habilidades
  // sem glifo e texto corrido) seguem em parágrafo.
  const STAT_TYPES = ['creature', 'hazard', 'affliction', 'vehicle'];
  // "Magias"/"Rituais" levam o nome da lista até o CD ou o número ("Magias Inatas Arcanas CD 17").
  const STAT_LINE = /^(?:(?:Magias|Rituais)(?: [A-Za-zÀ-ÿ]+){0,4}?(?= CD\b| \d)|Magias|Rituais|Percepção|Idiomas|Perícias|For|Itens|CA|Fort|PV|Dano|Dureza|Imunidades|Fraquezas|Resistências|Velocidade|Corpo a [Cc]orpo|À [Dd]istância|Distância|Furtividade|Descrição|Desarmar|Rotina|Reinicialização|Salvamento|Início|Estágio \d+|Duração [Mm]áxima|Gatilho|Acionamento|Efeito|Requisitos|Requerimentos|Frequência|Sucesso crítico|Sucesso|Falha crítica|Falha|Preço|Espaço|Tripulação|Passageiros|Teste de [Pp]iloto|Colisão)(?=[\s:]|$)/;
  // Habilidade com glifo: o nome antes dele é o rótulo ("Investida Brutal [two-actions] …"), até seis palavras.
  const ABILITY_NAME = /^[A-ZÀ-Ý][A-Za-zÀ-ÿ'’-]*(?: [A-Za-zÀ-ÿ'’-]+){0,5}(?= \[(?:one-action|two-actions|three-actions|reaction|free-action)\])/;
  const STAT_INNER = /([;,\]] *)(Des|Con|Int|Sab|Car|Fort|Ref|Von|Dano|PV|Dureza|Resistências|Fraquezas|Imunidades|Início|Estágio \d+|Duração máxima|Gatilho|Acionamento|Efeito|Requisitos|Requerimentos|Frequência|Passageiros)(?=\s|$)/g;
  function statLine(line, label) {
    let html = `<strong>${escapeHtml(label)}</strong>`, at = label.length;
    for (const match of line.matchAll(STAT_INNER)) {
      const start = match.index + match[1].length;
      html += escapeHtml(line.slice(at, start)) + `<strong>${escapeHtml(match[2])}</strong>`;
      at = start + match[2].length;
    }
    return actionGlyphs(html + escapeHtml(line.slice(at)));
  }
  // Linhas seguidas do mesmo tipo ficam juntas: estatísticas num bloco, o resto num parágrafo (uma linha por habilidade).
  function statBlockHtml(text) {
    const groups = [];
    for (const line of reflow(text).split('\n')) {
      if (!line.trim()) continue;
      const label = (line.match(STAT_LINE) || line.match(ABILITY_NAME) || [''])[0], kind = label ? 'stat' : 'text', last = groups[groups.length - 1];
      const html = label ? statLine(line, label) : actionGlyphs(escapeHtml(line));
      if (last && last.kind === kind) last.lines.push(html); else groups.push({ kind, lines: [html] });
    }
    return groups.map(group => group.kind === 'stat' ? `<div class="stat-block">${group.lines.map(line => `<p>${line}</p>`).join('')}</div>` : `<p class="detail-text">${group.lines.join('\n')}</p>`).join('');
  }

  // Livro de antes do Remaster: selo e, quando houver, a lista do que a adaptação mudou (data.remaster).
  function legacyHtml(d) {
    if (!d.legacy) return '';
    const changes = Array.isArray(d.remaster) ? d.remaster.filter(Boolean) : [];
    return `<div class="legacy-note"><span class="chip legacy-chip">Legado · adaptado ao Remaster</span>` +
      (changes.length ? `<details><summary>O que foi adaptado</summary><ul>${changes.map(change => `<li>${escapeHtml(change)}</li>`).join('')}</ul></details>` : '') + '</div>';
  }

  function metaLine(entry) {
    const parts = [TYPE_LABELS[entry.type] || entry.type];
    if (entry.level != null) parts.push('nível ' + entry.level);
    if (entry.category) parts.push(entry.category);
    parts.push(`${BOOK_NAMES[entry.book] || entry.book}, p. ${entry.page}`);
    return parts.join(' · ');
  }

  function fieldRow(label, value) {
    if (!value) return '';
    return `<div class="detail-field"><span>${escapeHtml(label)}</span><div>${actionGlyphs(escapeHtml(value))}</div></div>`;
  }

  function bookLink(entry) {
    return `<a class="btn" href="livro.html?book=${encodeURIComponent(entry.book)}&page=${entry.page}" target="_blank" rel="noopener">Ver no livro ↗</a>`;
  }

  // Corpo da regra, sem cabeçalho: selo de legado, campos do tipo, texto e elevações.
  function bodyHtml(entry) { return legacyHtml(entry.data || {}) + typeBody(entry); }
  function typeBody(entry) {
    const d = entry.data || {};
    if (STAT_TYPES.includes(entry.type)) return statBlockHtml(d.text);
    if (entry.type === 'spell' || entry.type === 'focus' || entry.type === 'ritual') {
      return fieldRow('Tradições', d.traditions) + fieldRow('Domínio', d.domain) + fieldRow('Patrono', d.patron) +
        fieldRow('Tempo de execução', d.time) + fieldRow('Distância', d.range) + fieldRow('Alvos', d.targets) +
        fieldRow('Área', d.area) + fieldRow('Defesa', d.defense) + fieldRow('Duração', d.duration) + fieldRow('Custo', d.cost) +
        fieldRow('Requerimentos', d.requirements) + fieldRow('Teste primário', d.primaryCheck) + fieldRow('Testes secundários', d.secondaryChecks) +
        (d.text ? `<p class="detail-text">${prose(d.text)}</p>` : '') +
        (d.heightened?.length ? `<h4>Elevações</h4>` + d.heightened.map(h => `<p class="detail-text"><strong>(+${h.plus})</strong> ${prose(h.text)}</p>`).join('') : '');
    }
    if (entry.type === 'feat') {
      return fieldRow('Categoria', d.category || entry.category) + fieldRow('Pré-requisitos', d.prerequisites) +
        fieldRow(d.actions === 'reaction' || d.actions === 'free-action' ? 'Acionamento' : 'Gatilho', d.trigger) +
        (d.text ? `<p class="detail-text">${prose(d.text)}</p>` : '');
    }
    if (entry.type === 'class') {
      return fieldRow('PV por nível', d.hpPerLevel) + fieldRow('Atributo-chave', d.keyAttribute) +
        (d.proficiencies ? `<h4>Proficiências iniciais</h4><pre class="detail-pre">${escapeHtml(d.proficiencies)}</pre>` : '') +
        (d.progression?.length ? `<h4>Progressão</h4><div class="table-wrap"><table><thead><tr><th>Nível</th><th>Características de classe</th></tr></thead><tbody>` +
          d.progression.map(row => `<tr><td class="level-cell">${row.level}</td><td>${escapeHtml(row.features)}</td></tr>`).join('') + '</tbody></table></div>' : '');
    }
    if (entry.type === 'item') {
      return fieldRow('Categoria', d.category || entry.category) + fieldRow('Preço', d.price) + fieldRow('Uso', d.usage) + fieldRow('Volume', d.bulk) +
        fieldRow('Mãos', d.hands) + fieldRow('Dano', [d.damage, d.damageType].filter(Boolean).join(' ')) + fieldRow('Grupo', d.group) +
        fieldRow('Distância', d.range) + fieldRow('Recarga', d.reload) + fieldRow('Bônus de CA', d.acBonus) + fieldRow('Limite de Destreza', d.dexCap) +
        fieldRow('Força', d.strength) + fieldRow('Penalidade em testes', d.checkPenalty) + fieldRow('Penalidade de Velocidade', d.speedPenalty) +
        fieldRow('Dureza', d.hardness) + fieldRow('PV (LQ)', d.hitPoints) + fieldRow('Ativação', d.activate) +
        (d.text ? `<p class="detail-text">${prose(d.text)}</p>` : '') +
        (d.variants?.length ? `<h4>Tipos</h4>` + d.variants.map(v => `<p class="detail-text"><strong>${escapeHtml(v.name)}</strong> · nível ${escapeHtml(v.level)} · ${escapeHtml(v.price)}${v.text ? '\n' + prose(v.text) : ''}</p>`).join('') : '');
    }
    if (entry.type === 'ancestry') {
      return fieldRow('Pontos de vida', d.hp) + fieldRow('Tamanho', d.size) + fieldRow('Velocidade', d.speed) +
        fieldRow('Melhorias de atributo', (d.boosts || []).join(', ')) + fieldRow('Defeitos de atributo', (d.flaws || []).join(', ')) +
        fieldRow('Idiomas', d.languages) + fieldRow('Traços', (d.traits || []).join(', ')) +
        (d.heritages?.length ? `<h4>Heranças</h4>` + d.heritages.map(h => `<p class="detail-text"><strong>${escapeHtml(h.name)}</strong> ${prose(h.text)}</p>`).join('') : '');
    }
    return d.text ? `<p class="detail-text">${prose(d.text)}</p>` : '';
  }

  // Detalhe completo: cabeçalho com "Ver no livro" (mais os botões de `actions`), traços e corpo.
  function detailHtml(entry, { actions = '' } = {}) {
    return `<div class="panel-head"><div><div class="eyebrow">${TYPE_LABELS[entry.type] || entry.type}${entry.level != null ? ' · nível ' + entry.level : ''}</div><h2>${escapeHtml(entry.name)}</h2><p class="small muted">${escapeHtml(metaLine(entry))}</p></div><div class="detail-actions">${bookLink(entry)}${actions}</div></div>
  ${(entry.traits || []).length ? `<div class="chips">${entry.traits.map(t => `<span class="chip">${escapeHtml(t)}</span>`).join('')}</div>` : ''}${bodyHtml(entry)}`;
  }

  window.Regras = { TYPE_LABELS, BOOK_NAMES, escapeHtml, markify, reflow, metaLine, bookLink, bodyHtml, detailHtml };
})();
