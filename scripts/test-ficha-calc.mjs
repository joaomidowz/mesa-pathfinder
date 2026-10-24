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
eq(C.totalBulk([{ bulk: '1', qty: '1' }, { bulk: 'L', qty: '3' }, { bulk: '2' }, { bulk: '—' }]), { total: 3.3, unknown: false });
eq(C.totalBulk([{ bulk: 'muito', qty: '1' }, { bulk: '1,5', qty: '2' }]), { total: 3, unknown: true });
eq(['assustado', 'Cegado', 'Ferido', 'MORRENDO'].map(C.conditionHasValue), [true, false, true, true]);
eq(C.formatNumber(3.3), '3,3');
eq(C.normalizeName('Arremesso  Enfurecido!'), 'arremessoenfurecido');

console.log('PASS', checks, 'checks: modificadores, ataques múltiplos, PV, espaços de magia, descanso, truques, nomes, volume, condições.');
