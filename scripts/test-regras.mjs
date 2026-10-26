// Detalhe das regras no navegador (dist/regras.js), carregado como no navegador por node:vm: bloco de estatísticas de
// criatura, perigo, aflição e veículo, glifos de ação, selo de legado e nomes dos livros.
// Texto SINTÉTICO que imita o formato extraído dos livros: nenhum trecho dos livros vai para o repositório.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { livrosDoWorker } from './livros.mjs';

const context = { window: {} };
vm.createContext(context);
vm.runInContext(fs.readFileSync('dist/regras.js', 'utf8'), context);
const R = context.window.Regras;
let checks = 0;
const has = (html, pieces) => { for (const piece of pieces) { assert.ok(html.includes(piece), piece); checks++; } };
const lacks = (html, pieces) => { for (const piece of pieces) { assert.ok(!html.includes(piece), piece); checks++; } };
const glyph = (symbol, name) => `<span class="action-glyph" role="img" aria-label="${name}" title="${name}">${symbol}</span>`;

// Criatura: rótulos do começo da linha e depois de ";" ou ",", nome de habilidade antes do glifo, linha quebrada pelo PDF
// juntada, texto corrido em parágrafo e nada do texto vira HTML.
const creature = R.bodyHtml({ type: 'creature', data: { text: [
  'Percepção +6; visão no escuro', 'Perícias Atletismo +7, Furtividade +5, Intimidação +3',
  'For +4, Des +1, Con +3, Int +0, Sab +0, Car –2', 'Itens espada <script>x</script> sintética',
  'CA 16; Fort +7, Ref +7, Von +4', 'PV 40; Resistências frio 5', 'Ataque de Oportunidade [reaction]',
  'Corpo a Corpo [one-action] presas +10 (ágil), Dano 2d4+4 perfurante',
  'Magias Inatas Arcanas CD 17, ataque +9; 2º invisibilidade;', '1º luz',
  'Investida Sintética [two-actions] O lobo dá dois Passos', 'e Golpeia.', 'Texto corrido do lobo sintético.',
].join('\n') } });
has(creature, ['<div class="stat-block">', '<strong>Percepção</strong> +6; visão no escuro', '<strong>Perícias</strong> Atletismo +7, Furtividade +5, Intimidação +3',
  '<strong>For</strong> +4, <strong>Des</strong> +1, <strong>Con</strong> +3, <strong>Int</strong> +0, <strong>Sab</strong> +0, <strong>Car</strong> –2',
  '<strong>CA</strong> 16; <strong>Fort</strong> +7, <strong>Ref</strong> +7, <strong>Von</strong> +4', '<strong>PV</strong> 40; <strong>Resistências</strong> frio 5',
  `<strong>Ataque de Oportunidade</strong> ${glyph('⟲', 'reação')}`, `<strong>Corpo a Corpo</strong> ${glyph('◆', '1 ação')} presas +10 (ágil), <strong>Dano</strong> 2d4+4`,
  '<strong>Magias Inatas Arcanas</strong> CD 17, ataque +9; 2º invisibilidade; 1º luz', `<strong>Investida Sintética</strong> ${glyph('◆◆', '2 ações')} O lobo dá dois Passos e Golpeia.`,
  '<p class="detail-text">Texto corrido do lobo sintético.</p>', 'espada &lt;script&gt;x&lt;/script&gt; sintética']);
lacks(creature, ['<script>', '[reaction]', '[one-action]', '<strong>Furtividade</strong>', '<strong>Int</strong>imidação', 'legacy-note']);

// Perigo: Gatilho e Efeito depois do glifo e do ";". Aflição: estágios e duração. Veículo: rótulos próprios.
const hazard = R.bodyHtml({ type: 'hazard', data: { text: 'Furtividade CD 20 (treinado)\nDescrição Uma placa sintética.\nLâmina Sintética [reaction] Gatilho alguém pisa; Efeito a lâmina corta.\nFenda Sintética [reaction] Acionamento algo cai.\nSucesso crítico nada acontece.\nFalha crítica cai na fenda.\nReinicialização 1 hora' } });
has(hazard, ['<strong>Furtividade</strong> CD 20', '<strong>Descrição</strong> Uma placa', `<strong>Lâmina Sintética</strong> ${glyph('⟲', 'reação')} <strong>Gatilho</strong> alguém pisa; <strong>Efeito</strong> a lâmina corta.`,
  `<strong>Fenda Sintética</strong> ${glyph('⟲', 'reação')} <strong>Acionamento</strong> algo cai.`, '<strong>Sucesso crítico</strong> nada', '<strong>Falha crítica</strong> cai', '<strong>Reinicialização</strong> 1 hora']);
const affliction = R.bodyHtml({ type: 'affliction', category: 'doença', data: { text: 'Salvamento Fortitude CD 18; Início 1 dia\nEstágio 1 enjoado 1 (1 dia)\nEstágio 2 drenado 1 (1 dia)\nDuração máxima 6 dias' } });
has(affliction, ['<strong>Salvamento</strong> Fortitude CD 18; <strong>Início</strong> 1 dia', '<strong>Estágio 1</strong> enjoado 1', '<strong>Estágio 2</strong> drenado 1', '<strong>Duração máxima</strong> 6 dias']);
const vehicle = R.bodyHtml({ type: 'vehicle', data: { text: 'Tripulação 1 piloto; Passageiros 4\nVelocidade 12 metros\nColisão 2d6 contundente (CD 18)' } });
has(vehicle, ['<strong>Tripulação</strong> 1 piloto; <strong>Passageiros</strong> 4', '<strong>Velocidade</strong> 12 metros', '<strong>Colisão</strong> 2d6']);
assert.equal(R.bodyHtml({ type: 'creature', data: {} }), ''); checks++;

// Selo de legado: só com data.legacy; a lista do que foi adaptado só quando tem itens, sempre escapada.
const legacy = R.bodyHtml({ type: 'feat', data: { legacy: true, remaster: ['Troca <b>sintética</b>.', ''], text: 'Texto [free-action] sintético.' } });
has(legacy, ['Legado · adaptado ao Remaster', '<summary>O que foi adaptado</summary>', '<li>Troca &lt;b&gt;sintética&lt;/b&gt;.</li>', `Texto ${glyph('◇', 'ação livre')} sintético.`]);
lacks(legacy, ['<b>', '<li></li>']);
const legacyEmpty = R.bodyHtml({ type: 'spell', data: { legacy: true, remaster: [], text: 'Texto sintético.' } });
has(legacyEmpty, ['Legado · adaptado ao Remaster']); lacks(legacyEmpty, ['<details>']);
lacks(R.bodyHtml({ type: 'spell', data: { legacy: false, remaster: ['x'], text: 'Texto.' } }), ['Legado']);

// Glifos também nos campos das outras regras e nos trechos da busca, com as marcas do servidor.
has(R.bodyHtml({ type: 'spell', data: { range: '9 metros [three-actions]', text: 'Texto.' } }), [`9 metros ${glyph('◆◆◆', '3 ações')}`]);
assert.equal(R.markify('um \x01lobo\x02 [one-action] <i>'), `um <mark>lobo</mark> ${glyph('◆', '1 ação')} &lt;i&gt;`); checks++;

// Rótulos dos tipos novos e nomes dos livros iguais ao cadastro (scripts/livros.mjs).
assert.deepEqual(['creature', 'hazard', 'affliction', 'vehicle'].map(type => R.TYPE_LABELS[type]), ['Criatura', 'Perigo', 'Aflição', 'Veículo']); checks++;
assert.deepEqual(JSON.parse(JSON.stringify(R.BOOK_NAMES)), Object.fromEntries(livrosDoWorker().map(book => [book.id, book.name]))); checks++;
assert.equal(R.metaLine({ type: 'creature', level: -1, category: '', book: 'bestiario1', page: 7 }), 'Criatura · nível -1 · Bestiário 1, p. 7'); checks++;

console.log('PASS', checks, 'checks: bloco de estatísticas (criatura, perigo, aflição, veículo), texto escapado, glifos de ação, selo de legado, nomes dos livros.');
