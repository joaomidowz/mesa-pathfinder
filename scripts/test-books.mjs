// Livros novos do catálogo (scripts/srd-books.mjs): cabeçalhos, mobília de página, corte do corpo e texto colado.
// Texto SINTÉTICO que imita o formato extraído dos livros: nenhum trecho dos livros vai para o repositório.
import assert from 'node:assert/strict';
import { parseBookHeader, furnitureOf, dropFurniture, respaceLine, normalizeStatLine, splitBody, tidySpell, NEW_ANCHOR } from './srd-books.mjs';
import { watermarks, stripWatermarks, assertClean } from './watermark.mjs';

let checks = 0;
const eq = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
const pick = header => header && [header.nameRaw, header.type, header.kind, header.level, header.plus];

// Cabeçalhos: número colado, glifo, "TRUQUE MÁGICO" do Remaster, nível negativo, item com "+", runa e erro de digitação.
eq(pick(parseBookHeader('BICHOTESTE CRIATURA2')), ['BICHOTESTE', 'creature', 'CRIATURA', 2, false]);
eq(pick(parseBookHeader('RATO DE TESTE CRIATURA -1')), ['RATO DE TESTE', 'creature', 'CRIATURA', -1, false]);
eq(pick(parseBookHeader('RAIODETESTE[two-actions] TRUQUEMÁGICO1')), ['RAIODETESTE', 'spell', 'TRUQUEMÁGICO', 1, false]);
eq(pick(parseBookHeader('RAIO DE TESTE TRUQUE MÁGICO 1')), ['RAIO DE TESTE', 'spell', 'TRUQUEMÁGICO', 1, false]);
eq(pick(parseBookHeader('ESPADA DE TESTE ITEM 5+')), ['ESPADA DE TESTE', 'item', 'ITEM', 5, true]);
eq(pick(parseBookHeader('RUNA DE TESTE RUNA 4')), ['RUNA DE TESTE', 'item', 'RUNA', 4, false]);
eq(pick(parseBookHeader('MEDIDASDETESTETALENTO1')), ['MEDIDASDETESTE', 'feat', 'TALENTO', 1, false]);
eq(pick(parseBookHeader('BICHO CREITURA 3')), ['BICHO', 'creature', 'CREITURA', 3, false]);
eq([parseBookHeader('ARMADILHA DE TESTE PERIGO 2').type, parseBookHeader('PRAGA DE TESTE DOENÇA 4').type, parseBookHeader('CARROÇA DE TESTE VEÍCULO 3').type, parseBookHeader('PONTE DE TESTE OBSTÁCULO 1').type],
  ['hazard', 'affliction', 'vehicle', 'hazard']);
// Frase comum ou linha em minúsculas não é cabeçalho.
eq([parseBookHeader('Um bicho de teste CRIATURA 2'), parseBookHeader('A criatura tem nível 2'), parseBookHeader('PV 24')], [null, null, null]);
eq(['  CRIATURA2', ' [one-action] TALENTO 4', 'TRUQUE MÁGICO 1', ' tem texto'].map(rest => NEW_ANCHOR.test(rest)), [true, true, true, false]);

// Mobília: barra de navegação em todas as páginas sai sempre; aba de capítulo (8%–35%) só em bloco de 3+; linha com número
// ou rótulo de bloco ("Velocidade …") nunca é mobília, mesmo repetida.
const pages = Array.from({ length: 40 }, (_, i) => ({ raw: ['Texto da página ' + i, 'Livro de Teste', 'A-C', 'D-F', 'Velocidade 7,5 metros', ...(i < 6 ? ['Aba Um', 'Aba Dois', 'Aba Três'] : []), ...(i === 7 ? ['Aba Um'] : [])].join('\n') }));
const furniture = furnitureOf(pages);
eq([...furniture.strong].sort(), ['A-C', 'D-F', 'Livro de Teste']);
eq([...furniture.weak].sort(), []);
const furniture2 = furnitureOf(pages.concat(Array.from({ length: 4 }, () => ({ raw: 'Aba Um\nAba Dois\nAba Três' }))));
eq([...furniture2.weak].sort(), ['Aba Dois', 'Aba Três', 'Aba Um']);
eq(dropFurniture(['Começo', 'Livro de Teste', '12 12', 'Aba Um', 'Aba Dois', 'Aba Três', 'meio', 'Aba Um', 'fim', '', '  7  '], furniture2), ['Começo', 'meio', 'Aba Um', 'fim']);

// Palavras coladas voltam pelo layout da mesma página; "PV70", "Fort+7", "For+10,Des+9" ganham espaço.
const pageObj = { raw: '', layout: 'Corpo a Corpo [one-action] garra +8\noutra coluna     Efeitoaqui' };
eq(respaceLine(pageObj, 'CorpoaCorpo [one-action] garra +8'), 'Corpo a Corpo [one-action] garra +8');
eq(respaceLine(pageObj, 'Efeitoaqui'), 'Efeitoaqui');
eq(['PV70; Fraquezas fogo 5', 'PVs 259; Imunidades frio', 'CA 16; Fort+7, Ref+10, Von+4', 'For+10,Des+9,Con+10,Int+5,Sab+6,Car+5', 'Velocidade10,5 metros', 'Percepção+6; visão no escuro', 'For +4, Des +1, Con+3, Int +0, Sab +0, Car –2'].map(normalizeStatLine),
  ['PV 70; Fraquezas fogo 5', 'PV 259; Imunidades frio', 'CA 16; Fort +7, Ref +10, Von +4', 'For +10, Des +9, Con +10, Int +5, Sab +6, Car +5', 'Velocidade 10,5 metros', 'Percepção +6; visão no escuro', 'For +4, Des +1, Con +3, Int +0, Sab +0, Car –2']);

// Corpo: traços no começo não cortam; quadro lateral no meio do bloco (com bloco depois) não corta; o título da próxima
// criatura corta e o que vem depois dele é a apresentação dela; título final sem bloco depois também corta.
const lines = texts => texts.map(text => ({ text }));
const block = lines(['CM MÉDIO HUMANOIDE', 'Percepção +6; visão no escuro', 'For +4, Des +1, Con +3, Int +0, Sab +0, Car +0', 'QUADRO LATERAL DE TESTE', 'Texto do quadro.', 'CA 16; Fort +7, Ref +7, Von +4', 'PV 40', 'Corpo a Corpo [one-action] garra +10, Dano 1d6+4 cortante', 'Habilidade de Teste Explicação.', 'BICHOSEGUINTE', 'Apresentação do bicho seguinte.']);
const split = splitBody(block, 0, block.length, 'BICHOSEGUINTE');
eq(split.body.map(line => line.text).at(-1), 'Habilidade de Teste Explicação.');
eq(split.body.some(line => line.text === 'PV 40'), true);
eq(split.rest.map(line => line.text), ['BICHOSEGUINTE', 'Apresentação do bicho seguinte.']);
const tail = lines(['Percepção +2', 'CA 12', 'PV 8', 'FAMÍLIA DE TESTE', 'História da família.']);
eq(splitBody(tail, 0, tail.length, 'OUTRO').body.length, 3);
eq(splitBody(lines(['Percepção +2', 'PV 8']), 0, 2, null), { body: lines(['Percepção +2', 'PV 8']), rest: [] });

// Magia: TRUQUE + MÁGICO vira só TRUQUE e o "Alvo" no singular sai da distância.
eq(tidySpell({ traits: ['ATAQUE', 'TRUQUE', 'MÁGICO'], range: '18 metros; Alvo 1 criatura' }), { traits: ['ATAQUE', 'TRUQUE'], range: '18 metros', targets: '1 criatura' });
eq(tidySpell({ traits: ['MÁGICO', 'FOGO'], range: '9 metros', targets: '1 criatura' }), { traits: ['MÁGICO', 'FOGO'], range: '9 metros', targets: '1 criatura' });

// Marca d'água (dados inventados): grudada no começo da linha, com o e-mail colado na palavra seguinte, também em minúscula
// depois do domínio, e com o nome quebrado em duas linhas no layout. Some de tudo; e-mail da editora fica; sobra trava.
const raw = 'Licenciado para Fulano de Tal, fulano.teste@exemplo.comTítulo da Página\nTexto.\fLicenciado para Fulano de Tal, fulano.teste@exemplo.comlivro de teste\ncontato@newordereditora.com.br';
const marks = watermarks(raw);
eq(marks, [{ name: 'Fulano de Tal', email: 'fulano.teste@exemplo.com' }]);
eq(stripWatermarks(raw, marks), 'Título da Página\nTexto.\flivro de teste\ncontato@newordereditora.com.br');
eq(stripWatermarks('Licenciado para Fulano\nde Tal, fulano.teste@exemplo.com  TEXTO', marks), '  TEXTO');
assert.doesNotThrow(() => assertClean('teste p.1', 'Texto limpo. contato@newordereditora.com.br', marks)); checks++;
for (const dirty of ['sobrou fulano.teste@exemplo.com', 'Licenciado para Outra Pessoa', 'outro@exemplo.com.br', 'Fulano  de Tal']) {
  assert.throws(() => assertClean('teste p.2', dirty, marks), error => /sobrou marca d'água/.test(error.message) && !/Fulano|fulano|exemplo/.test(error.message)); checks++;
}

console.log('PASS', checks, 'checks: cabeçalhos dos livros novos, mobília de página, texto colado, rótulos, corte do corpo, truques do Remaster, marca d\'água.');
