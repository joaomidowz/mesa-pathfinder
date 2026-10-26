// Adaptação das entradas legadas ao Remaster (scripts/remaster.mjs).
// Texto SINTÉTICO que imita o formato dos blocos dos livros legados: nenhum trecho dos livros vai para o repositório.
import assert from 'node:assert/strict';
import { adaptarRemaster, adaptarTexto, adaptarTracos, adaptarAtivacao, adaptarExecucao, matchCase } from './remaster.mjs';

let checks = 0;
const eq = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
const text = source => adaptarTexto(source).text;
const notes = source => adaptarTexto(source).changes;
const same = source => eq(text(source), source);

// Caixa do termo original: título, frase, CAIXA ALTA, minúsculas e título colado.
eq(['Ataque de Oportunidade', 'Ataque de oportunidade', 'ATAQUE DE OPORTUNIDADE', 'ataque de oportunidade', 'AtaquedeOportunidade'].map(s => matchCase(s, 'golpe reativo')),
  ['Golpe Reativo', 'Golpe reativo', 'GOLPE REATIVO', 'golpe reativo', 'Golpe Reativo']);

// 1. Tendência: siglas e traços saem; ínfero ganha PROFANO e celestial ganha SAGRADO (sem duplicar).
eq(adaptarTracos(['CM', 'GRANDE', 'ÍNFERO', 'DEMÔNIO']), { traits: ['GRANDE', 'ÍNFERO', 'DEMÔNIO', 'PROFANO'], changes: ['Tendência removida (CM)', 'Traço PROFANO adicionado (ÍNFERO)'] });
eq(adaptarTracos(['RARO', 'N', 'MÉDIO', 'CELESTIAL', 'ANJO']).traits, ['RARO', 'MÉDIO', 'CELESTIAL', 'ANJO', 'SAGRADO']);
eq(adaptarTracos(['QUALQUER', 'MINÚSCULO', 'CONSTRUCTO']), { traits: ['MINÚSCULO', 'CONSTRUCTO'], changes: ['Tendência removida (QUALQUER)'] });
eq(adaptarTracos(['MÉDIO', 'VARIA']).traits, ['MÉDIO', 'VARIA']);
eq(adaptarTracos(['ÍNFERO', 'PROFANO']), { traits: ['ÍNFERO', 'PROFANO'], changes: [] });
// 3 e 6. Traços de escola saem (menos ILUSÃO); positivo/negativo viram VITALIDADE/EVERSÃO; MAL sai.
eq(adaptarTracos(['INCOMUM', 'EVOCAÇÃO', 'FOGO', 'ILUSÃO', 'NECROMANCIA', 'NEGATIVO', 'MAL']), {
  traits: ['INCOMUM', 'FOGO', 'ILUSÃO', 'EVERSÃO'],
  changes: ['Traço de escola removido (EVOCAÇÃO)', 'Traço de escola removido (NECROMANCIA)', 'Traço NEGATIVO → EVERSÃO', 'Traço de tendência removido (MAL)'],
});
eq(adaptarTracos(['POSITIVO', 'HUMANOIDE']).traits, ['VITALIDADE', 'HUMANOIDE']);

// 2. Dano de tendência vira espiritual (sagrado/profano anotados); só em contexto de dano.
eq(text('Corpo a Corpo [one-action] garra +10 (ágil, mágico), Dano 1d6+4 cortante mais 1d6 maligno'), 'Corpo a Corpo [one-action] garra +10 (ágil, mágico), Dano 1d6+4 cortante mais 1d6 espiritual (profano)');
eq(notes('Dano 1d6+4 cortante mais 1d6 maligno'), ['dano maligno → espiritual (profano)']);
eq(text('Dano 2d8 perfurante mais 1d6 caótico e 1d6 bondoso'), 'Dano 2d8 perfurante mais 1d6 espiritual e 1d6 espiritual (sagrado)');
eq(text('sofre 1d4 de dano persistente ordeiro'), 'sofre 1d4 de dano persistente espiritual');
eq(text('pode trocar o dano maligno que causa'), 'pode trocar o dano espiritual (profano) que causa');
same('Criaturas malignas recebem -1; um deus bondoso o protege; uma criatura não-maligna resiste. Gnolls de tendência maligna.');
// Fraquezas, resistências e imunidades: bondoso/maligno viram sagrado/profano; caótico/ordeiro ficam e são anotados.
const weak = adaptarTexto('PV 40; Fraquezas bondoso 5, ordeiro 5\nVelocidade 9 metros');
eq(weak.text, 'PV 40; Fraquezas sagrado 5, ordeiro 5\nVelocidade 9 metros');
eq(weak.changes, ['fraqueza bondoso → sagrado', 'fraqueza ordeiro: sem equivalente no Remaster']);
eq(text('CA 20; PV 70; Resistências maligno 3, caótico 3'), 'CA 20; PV 70; Resistências profano 3, caótico 3');
const regen = adaptarTexto('PV 90, regeneração 20 (desativada por caótico); Imunidades negativo, positivo');
eq(regen.text, 'PV 90, regeneração 20 (desativada por caótico); Imunidades eversivo, vital');
eq(regen.changes, ['imunidade negativo → eversivo', 'imunidade positivo → vital', 'regeneração caótico: sem equivalente no Remaster']);
eq(text('PV 30, regeneração 5 (desativada por bondoso ou ferro frio)'), 'PV 30, regeneração 5 (desativada por sagrado ou ferro frio)');
eq(text('Imunidades doença, mental,\nnegativo; Fraquezas maligno 10'), 'Imunidades doença, mental,\neversivo; Fraquezas profano 10');
eq(text('Ela tem fraqueza a dano maligno e a prata.'), 'Ela tem fraqueza a profano e a prata.');
eq(text('recebe resistência 5 a dano negativo e fogo'), 'recebe resistência 5 a dano eversivo e fogo');
eq(text('+1 de estado em todos os salvamentos contra positivo'), '+1 de estado em todos os salvamentos contra vital');
eq(text('Os Golpes dela contam como bondoso e prata.'), 'Os Golpes dela contam como sagrado e prata.');
const lawful = adaptarTexto('tem fraqueza contra dano caótico.');
eq(lawful.text, 'tem fraqueza contra dano caótico.');
eq(lawful.changes, ['fraqueza caótico: sem equivalente no Remaster']);

// 3. Positivo/negativo: energia, dano, cura, traço e defesas, com concordância; sentido comum e planos ficam.
eq(text('Dano 2d6+3 negativo'), 'Dano 2d6+3 eversivo');
eq(text('sofre 4d6 de dano positivo'), 'sofre 4d6 de dano vital');
eq(text('Dano 3d8 positivo ou\nnegativo'), 'Dano 3d8 vital ou\neversivo');
eq(text('libera uma onda de energia negativa; Afinidade por Energia Positiva; energias positiva e negativa'), 'libera uma onda de energia eversiva; Afinidade por Energia Vital; energias vital e eversiva');
eq(text('PV 30, cura negativa\nCura Negativa Recebe cura de energia.'), 'PV 30, cura eversiva\nCura Eversiva Recebe cura de energia.');
eq(text('não recebe efeitos de cura positiva'), 'não recebe efeitos de cura de vitalidade');
eq(text('Toque [one-action] (divino, necromancia, negativo) O alvo'), 'Toque [one-action] (divino, eversão) O alvo');
eq(text('causa dano de veneno, frio ou negativo; outro causa dano de frio em vez de negativo'), 'causa dano de veneno, frio ou eversivo; outro causa dano de frio em vez de eversivo');
eq(text('Resistências todo dano 5 (exceto força, positivo ou toque fantasma)'), 'Resistências todo dano 5 (exceto força, vital ou toque fantasma)');
same('um bônus positivo de +1; resultado negativo; emoções negativas; um modificador positivo ou negativo');
const planes = adaptarTexto('viaja ao Plano de Energia Positiva e ao plano de Energia Negativa');
eq(planes.text, 'viaja ao Plano de Energia Positiva e ao plano de Energia Negativa');
eq(planes.changes, ['Plano de Energia Positiva mantido (no Remaster: Forja da Criação)', 'Plano de Energia Negativa mantido (no Remaster: o Vazio)']);

// 4. Golpe Reativo, preservando a caixa (inclusive colado e no plural).
eq(text('AtaquedeOportunidade [reaction]\nUsa um Ataque de oportunidade; ATAQUE DE OPORTUNIDADE; sem Ataques de Oportunidade; um ataque de oportunidade'),
  'Golpe Reativo [reaction]\nUsa um Golpe reativo; GOLPE REATIVO; sem Golpes Reativos; um golpe reativo');
eq(notes('Ataque de Oportunidade [reaction]'), ['Ataque de Oportunidade → Golpe Reativo']);

// 5. Ranque de magia; nível de criatura, personagem e item não muda.
eq(text('o dobro do nível da magia; seus níveis de magia; Nível de Magia'), 'o dobro do ranque da magia; seus ranques de magia; Ranque de Magia');
eq(text('uma magia arcana de 2º nível, um espaço de magia de 3º nível, magias de 1º ou 5º nível, truques de 3º nível'), 'uma magia arcana de 2º ranque, um espaço de magia de 3º ranque, magias de 1º ou 5º ranque, truques de 3º ranque');
eq(text('magia inata (elevada ao 4º nível); um teste de neutralização (8º nível de neutralização, +20)'), 'magia inata (elevada ao 4º ranque); um teste de neutralização (8º ranque de neutralização, +20)');
eq(text('Pode conjurar raio de 3º nível e névoa densa de 3º nível, cada um uma vez.'), 'Pode conjurar raio de 3º ranque e névoa densa de 3º ranque, cada um uma vez.');
same('uma criatura de 5º nível; No 1º nível, você escolhe; Ele conjura magias, e no 5º nível ganha mais; um item de 3º nível');
same('uma magia contra criaturas de 4º nível; magias de outro cajado de 8º nível; magia com CD de 20º nível; 2º NÍVEL');

// 6. Escolas saem das listas de traços entre parênteses (ilusão fica); parêntese que não é lista não muda.
eq(text('Aura de Medo (aura, encantamento, mental) 9 metros'), 'Aura de Medo (aura, mental) 9 metros');
eq(text('Visão Falsa (adivinhação) O monstro'), 'Visão Falsa O monstro');
eq(text('Golpe +9 (evocação, fogo; página 30); Explosão (abjuração; página 3)'), 'Golpe +9 (fogo; página 30); Explosão (página 3)');
eq(text('Subjugar (encantamento, mental, não-letal); Trocar Forma (concentração, [tradição mágica], transmutação)'), 'Subjugar (mental, não-letal); Trocar Forma (concentração, [tradição mágica])');
same('Olhar [one-action] (ilusão, visual); (veja evocação abaixo); (como uma evocação)');
const school = adaptarTexto('Imunidades mental, necromancia');
eq(school.text, 'Imunidades mental, necromancia');
eq(school.changes, ['imunidade necromancia: escola sem equivalente no Remaster']);
// Traços de tendência nas listas de traços do texto também saem.
eq(text('Golpe +12 (ágil, caótico, mágico, maligno), Dano 1d8; Prece (bem)'), 'Golpe +12 (ágil, mágico), Dano 1d8; Prece');

// 7. Modificador de atributo; componentes de ativação viram traços.
eq(text('some seu modificador de habilidade'), 'some seu modificador de atributo');
eq(['[one-action] Interagir', 'comando, visualizar', '(1 ação) (Interagir)', 'Interagir (evocação, mágico)', '1 minuto (comando, Interagir)', 'Conjurar uma Magia'].map(s => adaptarAtivacao(s).text),
  ['[one-action] (manuseio)', '(concentração)', '(1 ação) (manuseio)', '(mágico, manuseio)', '1 minuto (concentração, manuseio)', 'Conjurar uma Magia']);
eq(adaptarAtivacao('comando, Interagir').changes, ['ativação comando → concentração', 'ativação Interagir → manuseio']);
eq(text('Ativação [two-actions] comando, Interagir; Efeito Você usa uma ação Interagir para sacar.'), 'Ativação [two-actions] (concentração, manuseio); Efeito Você usa uma ação Interagir para sacar.');
// Componentes de magia saem do campo de execução e viram traços (verbal → CONCENTRAÇÃO; material, somático, foco → MANUSEIO).
eq(adaptarExecucao('[two-actions] somático, verbal'), { text: '[two-actions]', traits: ['MANUSEIO', 'CONCENTRAÇÃO'], changes: ['componente somático → MANUSEIO', 'componente verbal → CONCENTRAÇÃO'] });
eq(adaptarExecucao('1 minuto (material, somático, verbal)').text, '1 minuto');
eq(adaptarExecucao('1 dia'), { text: '1 dia', traits: [], changes: [] });

// 8. Condições com nome legado: lento N → desacelerado N, cego → cegado, surdo → ensurdecido (só com contexto de condição).
eq(text('Falha O alvo fica lento 1 por 1 rodada (Lenta 2 em falha crítica).'), 'Falha O alvo fica desacelerado 1 por 1 rodada (Desacelerada 2 em falha crítica).');
eq(text('o alvo fica cego por 1 minuto; ela fica surda até o final do turno'), 'o alvo fica cegado por 1 minuto; ela fica ensurdecida até o final do turno');
eq(text('Imunidades cego, surdo; recupera-se das condições: atordoado, cego ou surdo'), 'Imunidades cegado, ensurdecido; recupera-se das condições: atordoado, cegado ou ensurdecido');
eq(text('Estágio 2 estupefato 2, confuso e cego; Estágio 3 uma criatura cega ou ofuscada'), 'Estágio 2 estupefato 2, confuso e cegado; Estágio 3 uma criatura cegada ou ofuscada');
eq(notes('fica lento 1'), ['condição lento → desacelerado']);
same('um ponto cego; obediência cega; são um pouco surdos; o talento Lutar às Cegas (2º); avanço Lento 1.500 XP; um movimento lento');

// 9 e anotações: Desejo, idiomas elementais e mephits ficam no texto e entram na lista.
eq(adaptarTexto('Idiomas Aquan, Comum; só volta por desejo ou magia similar').changes, ['Desejo agora é ritual (texto mantido)', 'Idioma Aquan: Talássico no Remaster (texto mantido)']);
eq(text('Idiomas Aquan, Comum'), 'Idiomas Aquan, Comum');

// adaptarRemaster: entrada completa (o exemplo do pedido), sem mexer em name, book, page, level e type.
const creature = adaptarRemaster({ name: 'Diabo de Teste', type: 'creature', level: 3, book: 'bestiario1', page: 12, traits: ['CM', 'GRANDE', 'ÍNFERO', 'DEMÔNIO'],
  text: 'Percepção +6; visão no escuro\nIdiomas Abissal\nCA 16; Fort +7, Ref +7, Von +4\nPV 40; Fraquezas bondoso 5\nAtaque de Oportunidade [reaction]\nCorpo a Corpo [one-action] garra +10, Dano 1d6+4 cortante mais 1d6 maligno' });
eq([creature.name, creature.type, creature.level, creature.book, creature.page, creature.legacy], ['Diabo de Teste', 'creature', 3, 'bestiario1', 12, true]);
eq(creature.traits, ['GRANDE', 'ÍNFERO', 'DEMÔNIO', 'PROFANO']);
eq(creature.text, 'Percepção +6; visão no escuro\nIdiomas Abissal\nCA 16; Fort +7, Ref +7, Von +4\nPV 40; Fraquezas sagrado 5\nGolpe Reativo [reaction]\nCorpo a Corpo [one-action] garra +10, Dano 1d6+4 cortante mais 1d6 espiritual (profano)');
eq(creature.remaster, ['Tendência removida (CM)', 'Traço PROFANO adicionado (ÍNFERO)', 'fraqueza bondoso → sagrado', 'dano maligno → espiritual (profano)', 'Ataque de Oportunidade → Golpe Reativo']);
// Magia: componentes do campo de execução viram traços (em ordem alfabética), escola sai, elevações também são adaptadas.
const spell = adaptarRemaster({ name: 'Raio de Teste', type: 'spell', level: 2, book: 'mitos', page: 5, traits: ['RARO', 'EVOCAÇÃO', 'FOGO'], time: '[two-actions] somático, verbal',
  text: 'Causa 2d6 de dano negativo; o nível de magia conta.', heightened: [{ plus: 1, text: 'O dano negativo aumenta em 1d6.' }] });
eq([spell.traits, spell.time, spell.text, spell.heightened], [['RARO', 'CONCENTRAÇÃO', 'FOGO', 'MANUSEIO'], '[two-actions]', 'Causa 2d6 de dano eversivo; o ranque de magia conta.', [{ plus: 1, text: 'O dano eversivo aumenta em 1d6.' }]]);
eq(spell.remaster, ['Traço de escola removido (EVOCAÇÃO)', 'componente somático → MANUSEIO', 'componente verbal → CONCENTRAÇÃO', 'dano negativo → eversivo', 'nível de magia → ranque']);
// Item: ativação e tipos; nome, nível e preço do tipo ficam.
const item = adaptarRemaster({ name: 'Bastão de Teste', type: 'item', level: 5, book: 'polvora', page: 9, traits: ['MÁGICO', 'TRANSMUTAÇÃO'], price: '100 po', activate: 'comando, Interagir',
  text: 'Um bastão inventado.', variants: [{ name: 'bastão negativo', level: 9, price: '600 po', text: 'Causa 1d6 de dano negativo.' }] });
eq([item.traits, item.activate, item.price, item.variants], [['MÁGICO'], '(concentração, manuseio)', '100 po', [{ name: 'bastão negativo', level: 9, price: '600 po', text: 'Causa 1d6 de dano eversivo.' }]]);
// Componentes no texto de quem não é magia: ficam e só entram na lista.
const feat = adaptarRemaster({ name: 'Talento de Teste', type: 'feat', level: 1, book: 'polvora', page: 2, traits: ['GERAL'], text: 'Execução [one-action] somático' });
eq([feat.traits, feat.text, feat.remaster], [['GERAL'], 'Execução [one-action] somático', ['componentes de magia mantidos no texto']]);
// Entrada sem nada legado: marcada como legada, lista vazia. Rodar de novo não muda o texto nem duplica a lista.
eq(adaptarRemaster({ name: 'Nada', type: 'feat', level: 1, traits: ['GERAL'], text: 'Você corre mais rápido.' }).remaster, []);
const twice = adaptarRemaster(adaptarRemaster({ name: 'Duas Vezes', type: 'creature', level: 1, traits: ['N', 'MÉDIO'], text: 'Dano 1d4 negativo; Plano de Energia Negativa' }));
eq([twice.traits, twice.text, twice.remaster], [['MÉDIO'], 'Dano 1d4 eversivo; Plano de Energia Negativa', ['Tendência removida (N)', 'Plano de Energia Negativa mantido (no Remaster: o Vazio)', 'dano negativo → eversivo']]);
eq(adaptarRemaster({ name: 'MEPHIT DO TESTE', type: 'creature', level: 1, traits: [], text: '' }).remaster, ['Mephits viraram trastes elementais no Remaster (texto mantido)']);

console.log('PASS', checks, 'checks: tendência, dano espiritual, defesas, vital/eversivo, planos, Golpe Reativo, ranque, escolas, atributo, ativação, componentes, condições, anotações, entrada completa.');
