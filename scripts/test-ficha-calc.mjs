// Contas puras da ficha (dist/ficha-calc.js), carregadas como no navegador por node:vm.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const context = { window: {} };
vm.createContext(context);
vm.runInContext(fs.readFileSync('dist/ficha-calc.js', 'utf8'), context);
const C = context.window.FichaCalc;
let checks = 0;
// Objetos criados dentro do vm têm outro Object.prototype: compara pelo JSON.
const eq = (actual, expected) => { assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected); checks++; };

eq(['4', '+7', '-1', '0', '', 'abc', '−2', '7,5'].map(C.formatModifier), ['+4', '+7', '−1', '+0', '—', '—', '−2', '+7']);
eq(C.mapSequence('+10', 'versátil Pf'), ['+10', '+5', '+0']);
eq(C.mapSequence('+8', 'ágil, acuidade, arremesso 3 m'), ['+8', '+4', '+0']);
eq(C.mapSequence('+8', 'Agil'), ['+8', '+4', '+0']);
eq(C.mapSequence('+10', 'frágil'), ['+10', '+5', '+0']);
eq(C.mapSequence('', ''), null);
eq(C.applyDamage({ hpCurrent: '11', hpTemp: '3' }, 5), { hpCurrent: '9', hpTemp: '0' });
eq(C.applyDamage({ hpCurrent: '11', hpTemp: '5' }, '3'), { hpCurrent: '11', hpTemp: '2' });
eq(C.applyDamage({ hpCurrent: '11', hpTemp: '' }, 20), { hpCurrent: '0', hpTemp: '0' });
eq(C.applyDamage({ hpCurrent: '11', hpTemp: '0' }, 'abc'), { hpCurrent: '11', hpTemp: '0' });
eq(C.applyHealing({ hpCurrent: '5', hpMax: '26' }, 30), { hpCurrent: '26' });
eq(C.applyHealing({ hpCurrent: '5', hpMax: '' }, 3), { hpCurrent: '8' });
eq(C.applyTemp({ hpTemp: '3' }, 2), { hpTemp: '3' });
eq(C.applyTemp({ hpTemp: '3' }, '5'), { hpTemp: '5' });
eq(C.hpState({ hpCurrent: '5', hpMax: '26', hpTemp: '3' }), { current: 5, max: 26, temp: 3, percent: 19, state: 'critico' });
eq(C.hpState({ hpCurrent: '20', hpMax: '26' }).state, 'ferido');
eq(C.hpState({ hpCurrent: '26', hpMax: '26' }).state, 'ok');
eq(C.hpState({ hpCurrent: '0', hpMax: '26' }).state, 'caido');
eq(C.hpState({ hpCurrent: '9', hpMax: '' }), { current: 9, max: null, temp: 0, percent: null, state: 'ok' });
eq(C.slotRanks({ slots: { '1': { max: '3', used: '1' }, '2': { max: '0' }, '3': { max: '2', used: '9' } } }), [{ rank: 1, max: 3, used: 1 }, { rank: 3, max: 2, used: 2 }]);
eq(C.slotRanks({}), []);
eq(C.dailyRest({ tradition: 'arcana', slots: { '1': { max: '3', used: '2' } }, focus: { max: '2', current: '0' } }), { tradition: 'arcana', slots: { '1': { max: '3', used: '0' } }, focus: { max: '2', current: '2' } });
eq(C.dailyRest({}), { slots: {}, focus: { current: '0' } });
eq(C.spellKind({ type: 'spell', traits: 'CONCENTRAÇÃO, ELETRICIDADE, MANUSEIO, TRUQUE' }), 'truque');
eq(C.spellKind({ type: 'spell', traits: ['ATAQUE', 'TRUQUEMÁGICO'] }), 'truque');
eq(C.spellKind({ type: 'spell', traits: 'FOGO, CONCENTRAÇÃO' }), 'magia');
eq(C.spellKind({ type: 'focus', traits: '' }), 'foco');
eq(C.spellKind({ type: 'ritual' }), 'ritual');
const groups = C.groupSpells([{ name: 'A', kind: 'magia', rank: '2' }, { name: 'B', kind: 'truque' }, { name: 'C', kind: 'magia', rank: '1' }, { name: 'D', kind: 'foco' }, { name: 'E' }]);
eq(groups.map(group => [group.key, group.label, group.spells.map(spell => spell.index)]), [['truque', 'Truques', [1]], ['magia-1', '1º ranque', [2, 4]], ['magia-2', '2º ranque', [0]], ['foco', 'Magias de foco', [3]]]);
eq(['BOLA DE FOGO', 'CONVOCAR MORTO-VIVO', 'DÉJÀ VU', 'DE OLHO NO CÉU', 'Machado de mão', ''].map(C.displayName), ['Bola de Fogo', 'Convocar Morto-Vivo', 'Déjà Vu', 'De Olho no Céu', 'Machado de mão', '']);
eq(['Arremesso Enfurecido — Livro 2, p. 77', 'Lutador de Luta Livre — Dedicação, Livro 2, p. 207', 'Visão no escuro', ''].map(C.featName), ['Arremesso Enfurecido', 'Lutador de Luta Livre', 'Visão no escuro', '']);
// Volume do livro: por unidade, 10 L = 1 (a fração cai), 1.000 moedas = 1, limites 5 + For e 10 + For; '' é "?".
eq(['—', '-', '–', '0', 'l', 'L', '1', '10', '1,5', '0.5', '2L', 'varia de acordo com a armadura', 'muito', '', null].map(C.normalizeBulk), ['0', '0', '0', '0', 'L', 'L', '1', '10', '', '', '', '', '', '', '']);
eq(C.bulkSummary([{ qty: '1', bulk: '1' }, { qty: '3', bulk: 'L' }, { qty: '', bulk: '2' }, { qty: '10', bulk: '0' }, { qty: '1', bulk: '' }], { str: '4' }), { bulk: 3, light: 3, unknown: 1, coinBulk: 0, limit: 9, max: 14, state: 'ok' });
const bulkOf = (items, options) => { const { bulk, light, coinBulk, state } = C.bulkSummary(items, options); return [bulk, light, coinBulk, state]; };
eq(bulkOf([{ qty: '12', bulk: 'L' }]), [1, 2, 0, 'ok']);
eq(bulkOf([{ qty: '9', bulk: 'l' }]), [0, 9, 0, 'ok']);
eq(bulkOf([{ qty: '1', bulk: '1' }], { coins: { po: '1.500', pp: '499' } }), [2, 0, 1, 'ok']);
eq(bulkOf([], { coins: { pl: '1', po: '998' } }), [0, 0, 0, 'ok']);
eq([bulkOf([{ qty: '1', bulk: '9' }], { str: '4' }), bulkOf([{ qty: '1', bulk: '10' }], { str: '4' }), bulkOf([{ qty: '14', bulk: '1' }], { str: '4' }), bulkOf([{ qty: '15', bulk: '1' }], { str: '4' })].map(result => result[3]), ['ok', 'sobrecarregado', 'sobrecarregado', 'acima-do-maximo']);
const weak = C.bulkSummary([], { str: '-1' });
eq([weak.limit, weak.max], [4, 9]);
eq(C.bulkSummary([{ qty: '5', bulk: '—' }, { qty: '0', bulk: '' }, { qty: '-2', bulk: '3' }, { qty: 'muitos', bulk: 'L' }]), { bulk: 0, light: 1, unknown: 0, coinBulk: 0, limit: 5, max: 10, state: 'ok' });
eq(C.coinsTotal({ pl: '1', po: '4', pp: '25', pc: '137' }), { copper: 1787, po: 17.87, count: 167 });
eq(C.coinsTotal({ pp: 'confirmar' }), { copper: 0, po: 0, count: 0 });
eq(C.coinsTotal({ po: '-3', pc: '1.050' }), { copper: 1050, po: 10.5, count: 1050 });
eq(['assustado', 'Cegado', 'Ferido', 'MORRENDO'].map(C.conditionHasValue), [true, false, true, true]);
eq(C.formatNumber(3.3), '3,3');
eq(C.normalizeName('Arremesso  Enfurecido!'), 'arremessoenfurecido');
const party = [{ name: 'Carla', stats: { hpCurrent: '5', hpMax: '26' } }, { name: 'Bruno', stats: { hpCurrent: '38', hpMax: '38' } }, { name: 'Ária', stats: { hpCurrent: '7', hpMax: '' } }, { name: 'Lyra', stats: { hpCurrent: '15', hpMax: '22' } }];
eq(C.sortSheets(party).map(sheet => sheet.name), ['Ária', 'Bruno', 'Carla', 'Lyra']);
eq(C.sortSheets(party, 'pv').map(sheet => sheet.name), ['Carla', 'Lyra', 'Bruno', 'Ária']);

// Números com milhar à brasileira ("1.750" de XP não pode virar 1) e os botões [−] [+].
eq(['1.750', '1 750', '1.000.000', '+30', '-5', '−5', '12.5', '7,5', '1.750,5', '', 'abc', null].map(C.toCount), [1750, 1750, 1000000, 30, -5, -5, 12, 7, 1750, null, null, null]);
eq([C.stepValue('1.750', 10), C.stepValue('0', -1), C.stepValue('-1', -1, -20), C.stepValue('', 1), C.stepValue('5', 9, 0, 6), C.stepValue('lixo', -3, -20)], ['1760', '0', '-2', '1', '6', '-3']);
eq([C.levelStep('20', 1), C.levelStep('', 1), C.levelStep('1', -1), C.levelStep('5', -1), C.levelStep('nível 3', 1)], ['20', '2', '1', '4', '2']);

// Linhas do inventário antigo (anotações do jogador, uma por linha).
const parsed = text => C.parseInventoryLine(text);
eq(parsed('Giz ×10* (0)'), { name: 'Giz', qty: '10', bulk: '0', invested: false, notes: '', marker: '*', holds: '' });
eq(parsed('Ração ×14 — 2 semanas* (2L)'), { name: 'Ração', qty: '14', bulk: '', invested: false, notes: '2 semanas · Volume anotado: 2L', marker: '*', holds: '' });
eq(parsed('Kit de escalada (1) — investido'), { name: 'Kit de escalada', qty: '1', bulk: '1', invested: true, notes: '', marker: '', holds: '' });
eq(parsed('Mochila (−2 Vol.)'), { name: 'Mochila', qty: '1', bulk: '', invested: false, notes: '−2 Vol.', marker: '', holds: '' });
eq(parsed('19 virotes'), { name: 'Virotes', qty: '19', bulk: '', invested: false, notes: '', marker: '', holds: '' });
eq(parsed('Cantil 2 L* (L)'), { name: 'Cantil 2 L', qty: '1', bulk: 'L', invested: false, notes: '', marker: '*', holds: '' });
eq(parsed('Mochila (*) (L)'), { name: 'Mochila', qty: '1', bulk: 'L', invested: false, notes: '', marker: '', holds: '*' });
eq(parsed('Bolsa misteriosa (**) (1) — investido'), { name: 'Bolsa misteriosa', qty: '1', bulk: '1', invested: true, notes: '', marker: '', holds: '**' });
eq(parsed('Rubi** (8 PO, L)'), { name: 'Rubi', qty: '1', bulk: 'L', invested: false, notes: '8 PO', marker: '**', holds: '' });
const brief = text => { const { name, qty, bulk, invested, notes } = parsed(text); return [name, qty, bulk, invested, notes]; };
eq(['Adaga ×2* (2L)', 'Tocha ×5 (5L)', 'Ferramentas de cura ×8 (1)', 'Mochila — ignora 2 Vol. (L)', 'Toques / acessórios', 'Flechas x20 (—)', 'Meio-elfo de pano (L)', 'Kit — investido (1)', 'Lanterna ×3 (2)'].map(brief), [
  ['Adaga', '2', 'L', false, ''], ['Tocha', '5', 'L', false, ''], ['Ferramentas de cura', '8', '', false, 'Volume anotado: 1'], ['Mochila', '1', 'L', false, 'ignora 2 Vol.'],
  ['Toques / acessórios', '1', '', false, ''], ['Flechas', '20', '0', false, ''], ['Meio-elfo de pano', '1', 'L', false, ''], ['Kit', '1', '1', true, ''], ['Lanterna', '3', '', false, 'Volume anotado: 2'],
]);
eq(['', '   ', null, '(*)'].map(text => C.parseInventoryLine(text)), [null, null, null, null]);

// Migração: duplicatas casadas (nome idêntico na lista toda antes das palavras), marcadores, moedas e idempotência.
const grixInventory = {
  carried: 'Adaga orc* (L)\nAdaga* (L)\nMochila (*) (L)\nBolsa misteriosa (**) (1) — investido',
  consumables: 'Ração ×14 — 2 semanas* (2L)\n',
  equipped: 'Armadura de couro (1)',
  wealth: 'PO: 4\nPP: 25\nPC: 137\nPL: confirmar\nRubi** (8 PO, L)\nVolume total: 5 + 1L',
};
const grixItems = [
  { id: 'item-adaga-livro1-0', name: 'Adaga', qty: '1', bulk: 'L', invested: false, notes: '' },
  { id: '', name: 'Adaga órquica', qty: '', bulk: '', invested: false, notes: 'presente do clã' },
  { id: 'item-couro-livro1-0', name: 'Couro', qty: '1', bulk: '1', invested: false, notes: 'armadura de couro' },
  { id: '', name: 'Lança', qty: '1', bulk: '1', invested: false, notes: '' },
];
const untouched = JSON.stringify([grixInventory, grixItems]);
const migrated = C.migrateInventory(grixInventory, grixItems);
eq(JSON.stringify([grixInventory, grixItems]) === untouched, true);
eq(migrated.coins, { pl: '0', po: '4', pp: '25', pc: '137' });
eq(migrated.items.map(item => [item.id, item.name, item.section, item.qty, item.bulk, item.invested, item.notes]), [
  ['', 'Adaga orc', 'carregavel', '1', 'L', false, 'presente do clã · na Mochila'],
  ['item-adaga-livro1-0', 'Adaga', 'carregavel', '1', 'L', false, 'na Mochila'],
  ['', 'Mochila', 'carregavel', '1', 'L', false, ''],
  ['', 'Bolsa misteriosa', 'carregavel', '1', '1', true, ''],
  ['', 'Ração', 'consumivel', '14', '', false, '2 semanas · Volume anotado: 2L · na Mochila'],
  ['item-couro-livro1-0', 'Armadura de couro', 'equipado', '1', '1', false, 'armadura de couro'],
  ['', 'Rubi', 'carregavel', '1', 'L', false, '8 PO · na Bolsa misteriosa'],
  ['', 'Lança', 'carregavel', '1', '1', false, ''],
]);
eq(migrated.items[2], { id: '', name: 'Mochila', qty: '1', bulk: 'L', invested: false, notes: '', section: 'carregavel' });
eq(migrated.items.some(item => /^PL|^Volume/.test(item.name)), false);
eq(C.migrateInventory(grixInventory, migrated.items), JSON.parse(JSON.stringify(migrated)));
eq(C.migrateInventory({ carried: 'Corda*** (L)' }).items[0].notes, 'marcado com ***');
eq(C.migrateInventory({ wealth: 'PO: 1.500\npo: 250\nPC: confirmar\nPP:\nGema sintética (L)' }), { items: [{ id: '', name: 'Gema sintética', qty: '1', bulk: 'L', invested: false, notes: '', section: 'carregavel' }], coins: { pl: '0', po: '1750', pp: '0', pc: '0' } });
eq(C.migrateInventory({ consumables: 'Poção de teste menor\nPoção de teste maior' }, [{ id: 'x', name: 'Poção', qty: '2' }]).items.map(item => [item.name, item.id, item.section]), [['Poção de teste menor', '', 'consumivel'], ['Poção de teste maior', '', 'consumivel'], ['Poção', 'x', 'carregavel']]);
eq(C.migrateInventory({}, [{ name: 'Escudo', section: 'equipado', ref: 'r1' }]).items, [{ name: 'Escudo', section: 'equipado', ref: 'r1' }]);
eq(C.migrateInventory(), { items: [], coins: { pl: '0', po: '0', pp: '0', pc: '0' } });

// Escolhas de talento a partir dos campos antigos: outro livro vira manual; parênteses no fim saem do nome.
eq(C.choicesFromFeats({ ancestry: 'Visão sintética', ancestryTalent: 'Passo de Teste — Livro 1, p. 44', background: 'Olhar de Teste (Livro do Jogador 1)', class1: 'Golpe de Teste — Livro 2, p. 77', class2: 'Truque de Teste — livro A, p. 24 (+2 truques)', skill2: 'Salto de Teste', archetype: '' }), [
  { id: '', name: 'Passo de Teste', slot: 'ancestralidade', level: '1', manual: false, note: 'Passo de Teste — Livro 1, p. 44' },
  { id: '', name: 'Olhar de Teste', slot: 'biografia', level: '1', manual: false, note: 'Olhar de Teste (Livro do Jogador 1)' },
  { id: '', name: 'Golpe de Teste', slot: 'classe', level: '1', manual: false, note: 'Golpe de Teste — Livro 2, p. 77' },
  { id: '', name: 'Truque de Teste', slot: 'classe', level: '2', manual: true, note: 'Truque de Teste — livro A, p. 24 (+2 truques)' },
  { id: '', name: 'Salto de Teste', slot: 'pericia', level: '2', manual: false, note: '' },
]);
eq(C.choicesFromFeats({ archetype: 'Dedicação de Teste (livro A)' })[0], { id: '', name: 'Dedicação de Teste', slot: 'arquetipo', level: '2', manual: true, note: 'Dedicação de Teste (livro A)' });
eq(C.choicesFromFeats(), []);

// Catálogo: classe e ancestralidade reconhecidas no texto livre, vagas viram filtro, o talento certo na categoria certa.
eq(C.VERSATILE_HERITAGES, ['Aiuvarin', 'Cambiante', 'Crepusculante', 'Dampiro', 'Dracano', 'Dromaar', 'Nefilim']);
const classes = ['Bárbaro', 'Mago', 'Investigador'], ancestries = ['Anão', 'Humano', 'Elfo'];
eq([C.matchCatalogName('Cambiante Humano', ancestries), C.matchCatalogName('Humanoide · Inocente', ['Humano']), C.matchCatalogName('Maga', ['Mago']), C.matchCatalogName('Psiônico', ['Bárbaro', 'Mago']), C.matchCatalogName('Bárbaro', classes), C.matchCatalogName('Anã das montanhas', ancestries), C.matchCatalogName('Investigadora', classes), C.matchCatalogName('Meio Elfo', ['Elfo', 'Meio Elfo']), C.matchCatalogName('', classes)], ['Humano', '', 'Mago', '', 'Bárbaro', 'Anão', 'Investigador', 'Meio Elfo', '']);
const catalog = { classes, ancestries };
eq(C.choiceQuery({ slot: 'classe', level: '2' }, { className: 'Bárbaro', level: '2' }, catalog), { categories: ['classe: Bárbaro'], maxLevel: '2', label: 'Bárbaro, nível até 2' });
eq(C.choiceQuery({ slot: 'classe', level: '2' }, { className: 'Psiônico', level: '2' }, catalog), null);
eq(C.choiceQuery({ slot: 'ancestralidade', level: '1' }, { ancestry: 'Cambiante Humano', heritage: 'Humanoide · Inocente', level: '2' }, catalog), { categories: ['ancestralidade: Humano', 'herança versátil: Cambiante'], maxLevel: '1', label: 'Humano e Cambiante, nível até 1' });
eq(C.choiceQuery({ slot: 'ancestralidade', level: '1' }, { ancestry: 'Psiônico', heritage: '' }, catalog), null);
eq(C.choiceQuery({ slot: 'geral', level: '3' }, { level: '2' }), { categories: ['geral'], maxLevel: '2', label: 'Talentos gerais, nível até 2' });
eq(C.choiceQuery({ slot: 'biografia', level: '5' }, { level: '7' }), { categories: ['geral | perícia'], maxLevel: '1', label: 'Talentos de perícia, nível até 1' });
eq(C.choiceQuery({ slot: 'pericia', level: '' }, { level: '' }), { categories: ['geral | perícia'], maxLevel: '1', label: 'Talentos de perícia, nível até 1' });
eq(C.choiceQuery({ slot: 'arquetipo', level: '4' }, { level: '6' }), { categories: ['arquétipo'], maxLevel: '4', label: 'Arquétipos, nível até 4' });
eq([C.choiceQuery({ slot: 'constructor', level: '1' }, { level: '1' }), C.choiceQuery({}, {})], [null, null]);
const featRows = [{ id: 'feat-golpe-bardo', name: 'GOLPE DE TESTE', category: 'classe: Bardo', level: 1 }, { id: 'feat-golpe-feiticeiro', name: 'GOLPE DE TESTE', category: 'classe: Feiticeiro', level: 1 }, { id: 'feat-salto', name: 'SALTO DE TESTE', category: 'geral | perícia', level: 1 }, { id: 'feat-solto', name: 'SALTO DE TESTE', category: null, level: 1 }];
eq(C.pickFeat(featRows, 'Golpe de Teste', ['classe: Feiticeiro']).id, 'feat-golpe-feiticeiro');
eq([C.pickFeat(featRows, 'Golpe de Teste', ['classe: Mago']), C.pickFeat(featRows, 'Golpe de Teste', []), C.pickFeat(featRows, '', ['classe: Bardo'])], [null, null, null]);
eq(C.pickFeat(featRows, 'Salto de Teste', ['geral']).id, 'feat-salto');
eq(C.pickFeat([{ id: 'feat-dedicacao', name: 'DEDICAÇÃO DE MALABARISTA', category: 'arquétipo' }], 'Malabarista', ['arquétipo']).id, 'feat-dedicacao');
eq(C.pickFeat([{ id: 'feat-malabarista', name: 'MALABARISTA', category: 'arquétipo' }], 'Dedicação de Malabarista', ['arquétipo']).id, 'feat-malabarista');

// Morrendo, Ferido, Condenado e Inconsciente pela regra do livro.
const cond = (name, value = '1') => ({ id: 'condition-' + C.normalizeName(name) + '-livro1', name, value });
const shown = conditions => conditions.map(condition => condition.name + (condition.value ? ' ' + condition.value : ''));
eq(shown(C.afterDamage([cond('Ferido')], { hpBefore: '5', hpAfter: '0', hpDamage: 7 })), ['Ferido 1', 'Morrendo 2', 'Inconsciente']);
eq(shown(C.afterDamage([cond('Ferido')], { hpBefore: '5', hpAfter: '0', hpDamage: 7, critical: true })), ['Ferido 1', 'Morrendo 3', 'Inconsciente']);
eq(shown(C.afterDamage([cond('Morrendo'), cond('Inconsciente', '')], { hpBefore: '0', hpAfter: '0', hpDamage: '3' })), ['Morrendo 2', 'Inconsciente']);
eq(shown(C.afterDamage([cond('Morrendo'), cond('Inconsciente', '')], { hpBefore: '0', hpAfter: '0', hpDamage: 3, critical: true })), ['Morrendo 3', 'Inconsciente']);
eq(shown(C.afterDamage([cond('Ferido', '2'), cond('Inconsciente', '')], { hpBefore: '0', hpAfter: '0', hpDamage: 1 })), ['Ferido 2', 'Inconsciente', 'Morrendo 3']);
eq(shown(C.afterDamage([cond('Assustado')], { hpBefore: '5', hpAfter: '5', hpDamage: 0 })), ['Assustado 1']);
eq(shown(C.afterDamage([], { hpBefore: '10', hpAfter: '4', hpDamage: 6 })), []);
eq(shown(C.afterDamage([cond('Morrendo', '3')], { hpBefore: '0', hpAfter: '0', hpDamage: 5, critical: true })), ['Morrendo 4']);
eq(shown(C.afterHealing([cond('Morrendo', '2'), cond('Ferido'), cond('Inconsciente', '')], { hpBefore: '0', hpAfter: '5' })), ['Ferido 2']);
eq(shown(C.afterHealing([cond('Ferido'), cond('Inconsciente', '')], { hpBefore: '0', hpAfter: '5' })), ['Ferido 1']);
eq(shown(C.afterHealing([cond('Morrendo', '1')], { hpBefore: '3', hpAfter: '8' })), ['Morrendo 1']);
eq(shown(C.afterHealing([cond('Morrendo', '1')], { hpBefore: '0', hpAfter: '0' })), ['Morrendo 1']);
eq(shown(C.setDying([cond('Morrendo', '1')], 0)), ['Ferido 1']);
eq(shown(C.setDying([cond('Morrendo', '2'), cond('Ferido'), cond('Inconsciente', '')], '0')), ['Ferido 2', 'Inconsciente']);
eq(shown(C.setDying([cond('Ferido')], 2)), ['Ferido 1', 'Morrendo 2']);
eq(shown(C.setDying([], 0)), []);
const conditionsBefore = [cond('Assustado'), cond('Ferido')];
eq(C.setConditionValue(conditionsBefore, 'ferido', 3), [cond('Assustado'), cond('Ferido', '3')]);
eq(conditionsBefore, [cond('Assustado'), cond('Ferido')]);
eq([C.setConditionValue([cond('Ferido')], 'ferido', 0), C.setConditionValue([], 'inconsciente', 1), C.setConditionValue([cond('Morrendo', '2')], 'condenado', '1')], [[], [cond('Inconsciente', '')], [cond('Morrendo', '2'), cond('Condenado')]]);
eq(C.dyingState([cond('Morrendo', '3'), cond('Condenado', '1')]), { dying: 3, wounded: 0, doomed: 1, unconscious: false, limit: 3, dead: true });
eq(C.dyingState([cond('Condenado', '5'), cond('Inconsciente', '')]), { dying: 0, wounded: 0, doomed: 5, unconscious: true, limit: 1, dead: false });
eq(C.dyingState(), { dying: 0, wounded: 0, doomed: 0, unconscious: false, limit: 4, dead: false });

// Defesa: a conta do livro (10 + Des limitada + Prof + Item), escudo e CA total da mesa; números do catálogo.
eq([C.profBonus('T', 2), C.profBonus('L', 20), C.profBonus('U', 5), C.profBonus('', 5), C.profBonus('e', ''), C.profBonus('M', '0')], [4, 28, 0, 0, 5, 7]);
const acOf = (dex, category, dexCap, item, rank = 'T') => C.acFormula({ stats: { dex }, profile: { level: '2' }, defense: { ac: { category, dexCap, item }, armorProf: { [category]: rank } } });
eq([acOf('1', 'medium', '+1', '+4'), acOf('2', 'light', '+3', '+2'), acOf('3', 'light', '+4', '+1'), acOf('4', 'light', '+4', '+1'), acOf('3', 'unarmored', '', '')].map(ac => ac.total), [19, 18, 18, 19, 17]);
eq(acOf('4', 'light', '+3', '1'), { complete: true, total: 18, dex: 3, prof: 4, item: 1, rank: 'T', category: 'light' });
eq([acOf('2', 'heavy', '+0', '+6').dex, acOf('-1', 'light', '+4', '+1').dex, acOf('2', 'light', '+3', '+1', 'U').total], [0, -1, 13]);
eq([acOf('2', 'light', '+3', '+1', '').complete, acOf('2', 'pesadíssima', '+3', '+1').complete, C.acFormula({ stats: { dex: '2' } }).total], [false, false, null]);
const wood = { bonus: '2', hardness: '3', hpMax: '12', bt: '6', hp: '12', raised: true };
eq(C.shieldState(wood), { has: true, bonus: 2, hp: 12, hpMax: 12, bt: 6, hardness: 3, broken: false, destroyed: false, raised: true, active: true });
eq([{ hp: '6' }, { hp: '0' }, { hp: '' }, { bonus: '' }, { raised: false }].map(change => { const state = C.shieldState({ ...wood, ...change }); return [state.hp, state.broken, state.destroyed, state.has, state.active]; }), [[6, true, false, true, false], [0, false, true, true, false], [12, false, false, true, true], [12, false, false, false, false], [12, false, false, true, false]]);
eq(C.effectiveAc({ stats: { ac: '19' }, defense: { shield: wood } }), { total: 21, base: 19, shield: 2, extra: 0, text: '19 + escudo 2' });
eq(C.effectiveAc({ stats: { ac: '17' }, defense: { shield: wood, acBonus: '1' } }).text, '17 + escudo 2 + 1');
eq(C.effectiveAc({ stats: { ac: '17' }, defense: { acBonus: '-2' } }), { total: 15, base: 17, shield: 0, extra: -2, text: '17 − 2' });
eq([C.effectiveAc({ stats: { ac: '17' }, defense: { shield: { ...wood, hp: '5' } } }).total, C.effectiveAc({ stats: { ac: '17' } }).text, C.effectiveAc({ stats: { ac: '' }, defense: {} })], [17, '17', null]);
eq(C.armorFromEntry({ category: 'armadura leve', data: { acBonus: '+2', dexCap: '+3' } }), { category: 'light', dexCap: '+3', item: '2' });
eq(C.armorFromEntry({ category: null, data: { category: 'armadura pesada', acBonus: '+6', dexCap: '+0' } }), { category: 'heavy', dexCap: '+0', item: '6' });
eq(C.armorFromEntry({ category: 'armadura média', data: { acBonus: '+4', dexCap: '—' } }), { category: 'medium', dexCap: '', item: '4' });
eq([C.armorFromEntry({ category: 'armadura mágica', data: { plus: '+1' } }), C.armorFromEntry({ category: 'armadura leve', data: {} }), C.armorFromEntry({ category: 'constructor', data: { acBonus: '+1' } }), C.armorFromEntry(null)], [null, null, null, null]);
eq(C.shieldFromEntry({ category: 'escudo', data: { acBonus: '+2', hardness: '3', hitPoints: '12 (6)' } }), { bonus: '2', cover: '', hardness: '3', hpMax: '12', bt: '6' });
eq(C.shieldFromEntry({ category: 'escudo', data: { acBonus: '+2/+4', hardness: '5', hitPoints: '20 (10)' } }), { bonus: '2', cover: '4', hardness: '5', hpMax: '20', bt: '10' });
eq([C.shieldFromEntry({ category: 'escudo mágico', data: { price: '10 po' } }), C.shieldFromEntry({ category: 'armadura leve', data: { acBonus: '+1', hardness: '3', hitPoints: '6 (3)' } }), C.shieldFromEntry(undefined)], [null, null, null]);

// Subir de nível: ganhos da tabela da classe (texto sintético no formato do livro) e PV por nível.
eq(C.levelGains('Talento de guardião, talento de perícia'), { slots: ['classe', 'pericia'], skillIncrease: false, attributeBoosts: false, other: [] });
eq(C.levelGains('Talento de ancestralidade, melhorias de atributo, golpe forte, incremento de perícia'), { slots: ['ancestralidade'], skillIncrease: true, attributeBoosts: true, other: ['Golpe forte'] });
eq(C.levelGains('Magias de 2º ranque, talentogeral, incrementodeperícia, melhoriasdeatributo'), { slots: ['geral'], skillIncrease: true, attributeBoosts: true, other: ['Magias de 2º ranque'] });
eq(C.levelGains('Talento de guardião, talento de perícia, talento de guardião'), { slots: ['classe', 'pericia'], skillIncrease: false, attributeBoosts: false, other: [] });
eq([C.levelGains('').slots.length, C.levelGains(undefined).other.length], [0, 0]);
eq(C.levelGains('Melhorias de atributo, talento de guardião, talento'), { slots: ['classe'], skillIncrease: false, attributeBoosts: true, other: [] });
eq([C.hpGain(12, '2'), C.hpGain('8', '+0'), C.hpGain(6, '-1'), C.hpGain('', '-3'), C.hpGain(10, 'abc')], [14, 8, 5, 1, 10]);
// PV de nível: a marca pvAte, o Somar de vários níveis e o − que desfaz só o que foi somado.
const levelSheet = (level, hp, extra) => ({ profile: { level: String(level) }, stats: { hpMax: String(hp), hpCurrent: String(hp) }, extra });
{ // Ficha convertida (sem marca) no nível 2: − e Subir não oferecem de novo os PV que ela já tinha.
  const d = levelSheet(2, 30, {});
  eq([C.hpCountedTo(d), C.sumLevelHp(d, 12)], [2, 0]);
  C.levelDown(d); eq([d.profile.level, d.extra.pvAte, d.stats.hpMax], ['1', '2', '30']);
  C.levelUp(d); eq([d.profile.level, C.hpCountedTo(d), C.sumLevelHp(d, 12), d.stats.hpMax], ['2', 2, 0, '30']);
}
{ // 2 → 3 → 4 sem somar: o 4 oferece os dois níveis; voltando ao 3, só o 3.
  const d = levelSheet(2, 30, undefined);
  C.levelUp(d); C.levelUp(d); eq([d.profile.level, 4 - C.hpCountedTo(d)], ['4', 2]);
  C.levelDown(d); eq([d.profile.level, 3 - C.hpCountedTo(d), d.stats.hpMax], ['3', 1, '30']);
  C.levelUp(d); eq([C.sumLevelHp(d, 12), d.stats.hpMax, d.stats.hpCurrent, d.extra.pvAte, d.extra.pvNiveis], [24, '54', '54', '4', { 3: '12', 4: '12' }]);
  eq(C.sumLevelHp(d, 12), 0);
  C.levelDown(d); eq([d.profile.level, d.stats.hpMax, d.extra.pvAte, C.sumLevelHp(d, 12)], ['3', '42', '3', 0]);
  C.levelDown(d); eq([d.profile.level, d.stats.hpMax, d.extra.pvAte, d.extra.pvNiveis], ['2', '30', '2', {}]);
}
{ // Somar, − e Subir: oferece de novo. Desfazer não deixa PV atuais abaixo de 0; nível 1 e 20 são os limites.
  const d = levelSheet(2, 30, {});
  C.levelUp(d); C.sumLevelHp(d, 12); d.stats.hpCurrent = '5';
  C.levelDown(d); eq([d.stats.hpMax, d.stats.hpCurrent], ['30', '0']);
  C.levelUp(d); eq(C.sumLevelHp(d, 12), 12);
  const low = levelSheet(1, 8, {}); C.levelDown(low); eq([low.profile.level, low.stats.hpMax, low.extra.pvAte], ['1', '8', '1']);
  const top = levelSheet(20, 200, {}); C.levelUp(top); eq([top.profile.level, C.sumLevelHp(top, 12)], ['20', 0]);
}

console.log('PASS', checks, 'checks: modificadores, ataques múltiplos, PV, espaços de magia, descanso, truques, nomes, volume e moedas, condições, milhar e botões, linhas do inventário, migração idempotente, escolhas de talento, catálogo, morrendo/ferido, CA e escudo, subir de nível.');
