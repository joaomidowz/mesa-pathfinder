// Extrai o texto de cada página dos dois livros com pdftotext (poppler).
// - modo raw: ordem de leitura correta (coluna por coluna) — usado para parsear entradas
// - modo layout: colunas alinhadas — usado para parsear tabelas
// Saída: data/pages.json  [{book, page, chapter, raw, layout}]
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const BOOKS = [
  {
    id: 'livro1', pdf: path.join(root, 'books/livro1.pdf'), pages: 469, offset: 1,
    // Mapa de capítulos pelas páginas impressas (sumário do livro).
    chapters: [
      [1, 3, 'Abertura'], [4, 39, 'Introdução'], [40, 89, 'Ancestralidades e Biografias'],
      [90, 223, 'Classes'], [224, 247, 'Perícias'], [248, 265, 'Talentos'],
      [266, 295, 'Equipamento'], [296, 395, 'Magia'], [396, 441, 'Jogando Pathfinder'],
      [442, 447, 'Apêndice de condições'], [448, 451, 'Ficha'], [452, 469, 'Glossário e índice'],
    ],
  },
  {
    id: 'livro2', pdf: path.join(root, 'books/livro2.pdf'), pages: 322, offset: 2,
    chapters: [
      [1, 5, 'Abertura'], [6, 53, 'Ancestralidades'], [54, 171, 'Classes'],
      [172, 223, 'Arquétipos'], [224, 235, 'Talentos'], [236, 271, 'Magias'],
      [272, 311, 'Pilha de tesouros'], [312, 314, 'Tabela de Tesouros'], [315, 322, 'Glossário e índice'],
    ],
  },
];

function clean(text, page) {
  const lines = text.split('\n').map(line => line.replace(/\s+$/,''));
  const kept = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^Licenciado para /i.test(trimmed)) continue;             // marca d'água de DRM
    if (new RegExp(`^${page} +${page}$`).test(trimmed)) continue; // número de página duplicado
    kept.push(line);
  }
  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

const pages = [];
for (const book of BOOKS) {
  const [rawOut, layoutOut] = await Promise.all([
    run('pdftotext', ['-raw', book.pdf, '-'], { maxBuffer: 120 * 1024 * 1024 }),
    run('pdftotext', ['-layout', book.pdf, '-'], { maxBuffer: 120 * 1024 * 1024 }),
  ]);
  const rawPages = rawOut.stdout.split('\f');
  const layoutPages = layoutOut.stdout.split('\f');
  for (let index = 0; index < rawPages.length; index++) {
    const page = index + 1 - book.offset; // página impressa
    if (page < 1 || page > book.pages) continue;
    const chapter = book.chapters.find(([start, end]) => page >= start && page <= end)?.[2] || 'Abertura';
    pages.push({ book: book.id, page, chapter, raw: clean(rawPages[index], page), layout: clean(layoutPages[index], page) });
  }
  console.log(`${book.id}: ${book.pages} páginas extraídas`);
}

fs.mkdirSync(path.join(root, 'data'), { recursive: true });
fs.writeFileSync(path.join(root, 'data/pages.json'), JSON.stringify(pages));
console.log(`data/pages.json: ${pages.length} páginas, ${(fs.statSync(path.join(root, 'data/pages.json')).size / 1e6).toFixed(1)} MB`);
