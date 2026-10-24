// Catálogo de itens (scripts/srd-items.mjs) e o detalhe de item em dist/regras.js.
// Texto SINTÉTICO que imita o formato extraído dos livros: nenhum trecho dos livros vai para o repositório.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { ITEM_HEADER, pageLines, joinVariantLines, respace, buildTreasureItem, parseTreasureItems, tableContext, parseEquipmentRow, parseEquipmentTables } from './srd-items.mjs';

let checks = 0;
const eq = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
const page = (n, raw, layout = '') => ({ book: 'livro2', page: n, chapter: 'Pilha de tesouros', raw: raw.join('\n'), layout });

// Cabeçalho com "+" depois ou antes do nível, e material.
eq(['BASTAODOTROVAO ITEM5+', 'LUVADEPEDRA ITEM+3', 'COUROFICTICIO MATERIAL8+'].map(line => line.match(ITEM_HEADER).slice(1, 5)), [['BASTAODOTROVAO', '', '5', '+'], ['LUVADEPEDRA', '+', '3', ''], ['COUROFICTICIO', '', '8', '+']]);
// Página ímpar: rótulo do capítulo, número e barra lateral saem; página par: rodapé e legendas saem.
eq(pageLines(page(281, ['Texto do item.', 'Pilha de tesouros', '6 6', 'Introdução', 'Ancestralidades', 'Classe', 'Varinhas'])), ['Texto do item.']);
eq(pageLines(page(280, ['Outro texto.', 'Mais texto.', 'Livro do jogador 2', 'LEGENDA DA ILUSTRAÇÃO'])), ['Outro texto.', 'Mais texto.']);
// Tipo quebrado em duas linhas volta a ser uma.
eq(joinVariantLines(['Tipo bastão maior; Nível 9;', 'Preço 600 po; Requerimentos de manufatura Fornecer magia.', 'texto']), ['Tipo bastão maior; Nível 9; Preço 600 po; Requerimentos de manufatura Fornecer magia.', 'texto']);

// Palavras coladas voltam com os espaços do layout, mas só se o trecho estiver inteiro numa linha (sem vão de coluna).
const spaced = page(299, [], 'feito da madeira de uma árvore atingida por um raio. Ele brilha\noutra coluna     umaárvoreatingidaporumraio');
eq(respace(spaced, 'madeira de uma árvoreatingidaporumraio. Ele'), 'madeira de uma árvore atingida por um raio. Ele');
eq(respace(page(298, [], 'texto colado     aquiemoutracoluna'), 'textocoladoaquiemoutracoluna'), 'textocoladoaquiemoutracoluna');
// Legenda de ilustração (linha toda em maiúsculas) no meio do corpo não entra no texto.
eq(buildTreasureItem({ page: page(306, []), nameRaw: 'VELA', level: 1, plus: false, section: '', body: ['MÁGICO', 'Uso segurado com 1 mão; Volume —', 'Uma vela de teste.', 'OUTRO ITEM DA PÁGINA', 'Ela queima.'] }).text, 'Uma vela de teste.\nEla queima.');

// Item completo: traços, uso/volume, ativação com ícone de ação, tipos (com e sem espaços) e categoria pelo traço.
const staff = buildTreasureItem({ page: page(308, [], '   BASTÃO DO TROVÃO     ITEM 5+   '), nameRaw: 'BASTÃODOTROVÃO', level: 5, plus: true, section: 'item segurado', body: [
  'MÁGICO CAJADO', 'Uso segurado com 1 mão; Volume 1', 'Um bastão inventado para o teste.', 'Ativação[two-actions] Conjurar uma Magia; Efeito Você gasta', 'cargas do bastão.',
  'Tipobastãodotrovão; Nível5; Preço100 po', '• 1º raio de teste', 'Tipo bastão do trovão maior; Nível 9;', 'Preço 600 po; Requerimentos de manufatura Fornecer magia.'] });
eq([staff.name, staff.nameFixed, staff.category, staff.traits, staff.usage, staff.bulk, staff.activate, staff.price], ['BASTÃO DO TROVÃO', true, 'cajado', ['MÁGICO', 'CAJADO'], 'segurado com 1 mão', '1', '(2 ações) Conjurar uma Magia', '100 po']);
eq(staff.variants, [{ name: 'bastãodotrovão', level: 5, price: '100 po', text: '• 1º raio de teste' }, { name: 'bastão do trovão maior', level: 9, price: '600 po', text: 'Requerimentos de manufatura Fornecer magia.' }]);
assert.ok(staff.text.startsWith('Um bastão inventado') && staff.text.includes('(2 ações) Conjurar')); checks++;
// Seção de cajados sem o traço CAJADO: vira item equipado (o título da seção foi lido fora de ordem).
const gloves = buildTreasureItem({ page: page(310, []), nameRaw: 'LUVAS', level: 3, plus: false, section: 'cajado', body: ['INVESTIDO MÁGICO', 'Preço50 po', 'Uso luvas equipadas; volume—', 'Luvas fictícias.'] });
eq([gloves.name, gloves.nameFixed, gloves.category, gloves.price, gloves.usage, gloves.bulk], ['LUVAS', false, 'item equipado', '50 po', 'luvas equipadas', '—']);

// Capítulo: seção vira categoria, página sem itens encerra o corpo, cauda no topo vai para o item do nome certo.
const chapter = [
  page(300, ['Varinhas', 'Introdução da seção.', 'VARETAA ITEM2', 'MÁGICO VARINHA', 'Uso segurada com 1 mão; Volume L', 'Começo da vareta a.']),
  page(301, ['continuação da vareta a.', 'VARETAB ITEM4+', 'MÁGICO VARINHA', 'Uso segurada com 1 mão; Volume L', 'Começo da vareta b.']),
  page(302, ['Tipovaretac; Nível6; Preço90 po', 'Final da vareta c.', 'VARETAC ITEM6+', 'MÁGICO VARINHA', 'Uso segurada com 1 mão; Volume L', 'Começo da vareta c.']),
  page(303, ['Página só de regras, sem itens.', 'Mais regras.']),
];
const [a, b, c] = parseTreasureItems(chapter);
eq([a.category, a.text, b.text, b.variants.length], ['varinha', 'Começo da vareta a.\ncontinuação da vareta a.', 'Começo da vareta b.', 0]);
eq([c.price, c.variants.map(v => v.name), c.text], ['90 po', ['varetac'], 'Começo da vareta c.']);
eq(c.variants[0].text, 'Final da vareta c.');

// Tabelas do Livro 1: cabeçalhos e linhas de arma, arma à distância, armadura e escudo.
const martial = tableContext('Armas marciais incomuns       Preço       Dano Vol. Mãos Grupo Traços');
eq(martial, { kind: 'weapon', category: 'arma marcial', traits: ['Incomum'] });
eq(parseEquipmentRow('Espada de teste      2 po    1d8 Ct 1    1   Espada Ágil, versátil Pf', martial), { type: 'item', name: 'Espada de teste', level: 0, category: 'arma marcial', traits: ['Incomum', 'Ágil', 'Versátil Pf'], price: '2 po', damage: '1d8', damageType: 'cortante', bulk: '1', hands: '1', group: 'Espada' });
eq(parseEquipmentRow('Arco de teste (nível 1) 14 po      1d6 Pf  18 m.      0     1    1+   Arco Mortal d10', tableContext('Armas simples   Preço   Dano  Distância Recarga Vol. Mãos')), { type: 'item', name: 'Arco de teste', level: 1, category: 'arma simples à distância', traits: ['Mortal d10'], price: '14 po', damage: '1d6', damageType: 'perfurante', range: '18 m', reload: '0', bulk: '1', hands: '1+ (uma para disparar, outra para recarregar)', group: 'Arco' });
eq(parseEquipmentRow('Bastão grátis      0     1d4 Cn   1   1   Clava   Duas mãos d8', martial).price, '0');
eq(parseEquipmentRow('Bomba genérica*   Varia   Varia   6 m.   —   L   1  Bomba Varia', martial), null);
eq(parseEquipmentRow('Gibão de teste      2 po     +3    +2    –2    –1,5 m.   +2    2      Couro    —', tableContext('Médias      Preço bônus de CA Lim. Des. Pen. teste Pen. Vel. Força Volume  Grupo  Traços')), { type: 'item', name: 'Gibão de teste', level: 0, category: 'armadura média', traits: [], price: '2 po', acBonus: '+3', dexCap: '+2', checkPenalty: '–2', speedPenalty: '–1,5 m', strength: '+2', bulk: '2', group: 'Couro' });
eq(parseEquipmentRow('Escudo de teste    10 po    +2/+42    –1,5 m.    4    5    20 (10)', tableContext('Escudo    Preço   Bônus de CA1   Pen. Vel.   Volume   Dureza   PVs (LQ)')).acBonus, '+2/+4');
// Página ímpar: a coluna lateral é cortada; nome que continua na linha de baixo é emendado.
const odd = { book: 'livro1', page: 277, chapter: 'Equipamento', layout: ['Armas simples    Preço   Dano   Vol.   Mãos   Grupo   Traços', 'Martelo com      2 po   1d6 Cn   1   1   Martelo   Derrubar'.padEnd(140) + 'Regras', 'gancho de teste'].join('\n') };
eq(parseEquipmentTables([odd]).map(entry => [entry.name, entry.traits]), [['Martelo com gancho de teste', ['Derrubar']]]);

// Detalhe de item no navegador (regras.js): campos, tipos e texto escapado.
const context = { window: {} };
vm.createContext(context);
vm.runInContext(fs.readFileSync('dist/regras.js', 'utf8'), context);
const html = context.window.Regras.bodyHtml({ type: 'item', category: 'cajado', data: { category: 'cajado', price: '100 po', usage: 'segurado com 1 mão', bulk: '1', activate: '(2 ações) Conjurar', text: 'Texto <script>x</script>', variants: [{ name: 'maior', level: 9, price: '600 po', text: '• 1º raio' }] } });
for (const piece of ['Preço', '100 po', 'Ativação', '<h4>Tipos</h4>', 'maior', 'nível 9', '600 po', '• 1º raio', '&lt;script&gt;']) { assert.ok(html.includes(piece), piece); checks++; }
assert.ok(!html.includes('<script>')); checks++;

console.log('PASS', checks, 'checks: cabeçalhos, barra lateral, tipos, categoria, cauda de coluna, tabelas de armas/armaduras/escudos, detalhe de item.');
