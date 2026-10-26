// Cadastro único dos livros da mesa: extração de texto, páginas renderizadas, catálogo de regras e o Worker leem daqui.
// - pdf: arquivo em books/ (fora do git; material licenciado).
// - pages: páginas impressas; pdfOffset: páginas do PDF antes da página impressa 1 (capa, folha de rosto).
// - audience: 'todos' (jogadores e mestre) ou 'mestre' (só quem tem o papel de mestre vê busca, entradas e páginas).
// - legacy: livro de antes do Remaster; as entradas passam pela adaptação de scripts/remaster.mjs.
// - aliases: siglas que a mesa usa nas fichas para citar o livro ("Talento X (AO)"); a sem sigla é o Livro do Jogador.
// - chapters: [primeira, última, nome] pelas páginas impressas (opcional; aparece nos resultados de página da busca).
export const LIVROS = [
  {
    id: 'livro1', name: 'Livro do Jogador 1', pdf: 'livro1.pdf', pages: 469, pdfOffset: 1, audience: 'todos', legacy: false, aliases: ['LJ1'],
    chapters: [
      [1, 3, 'Abertura'], [4, 39, 'Introdução'], [40, 89, 'Ancestralidades e Biografias'],
      [90, 223, 'Classes'], [224, 247, 'Perícias'], [248, 265, 'Talentos'],
      [266, 295, 'Equipamento'], [296, 395, 'Magia'], [396, 441, 'Jogando Pathfinder'],
      [442, 447, 'Apêndice de condições'], [448, 451, 'Ficha'], [452, 469, 'Glossário e índice'],
    ],
  },
  {
    id: 'livro2', name: 'Livro do Jogador 2', pdf: 'livro2.pdf', pages: 322, pdfOffset: 2, audience: 'todos', legacy: false, aliases: ['LJ', 'L2', 'LJ2'],
    chapters: [
      [1, 5, 'Abertura'], [6, 53, 'Ancestralidades'], [54, 171, 'Classes'],
      [172, 223, 'Arquétipos'], [224, 235, 'Talentos'], [236, 271, 'Magias'],
      [272, 311, 'Pilha de tesouros'], [312, 314, 'Tabela de Tesouros'], [315, 322, 'Glossário e índice'],
    ],
  },
  { id: 'ocultos', name: 'Arquivos Ocultos', pdf: 'ocultos.pdf', pages: 225, pdfOffset: 1, audience: 'todos', legacy: false, aliases: ['A', 'AO'] },
  { id: 'elementos', name: 'Fúria dos Elementos', pdf: 'elementos.pdf', pages: 242, pdfOffset: 2, audience: 'todos', legacy: false, aliases: ['F', 'FR'] },
  { id: 'polvora', name: 'Pólvora e Engrenagens', pdf: 'polvora.pdf', pages: 238, pdfOffset: 1, audience: 'todos', legacy: true, aliases: ['PE'] },
  { id: 'mestre', name: 'Livro do Mestre', pdf: 'mestre.pdf', pages: 341, pdfOffset: 1, audience: 'mestre', legacy: false, aliases: ['LM'] },
  { id: 'bestiario1', name: 'Bestiário 1', pdf: 'bestiario1.pdf', pages: 361, pdfOffset: 1, audience: 'mestre', legacy: true, aliases: ['B', 'B1'] },
  { id: 'bestiario2', name: 'Bestiário 2', pdf: 'bestiario2.pdf', pages: 321, pdfOffset: 1, audience: 'mestre', legacy: true, aliases: ['B2'] },
  { id: 'mitos', name: 'Monstros dos Mitos', pdf: 'mitos.pdf', pages: 129, pdfOffset: 0, audience: 'mestre', legacy: true, aliases: ['MT'] },
];

// O que o Worker precisa saber de cada livro (sem caminhos nem capítulos).
export const livrosDoWorker = () => LIVROS.map(({ id, name, pages, pdfOffset, audience, legacy, aliases }) => ({ id, name, pages, pdfOffset, audience, legacy, aliases }));
