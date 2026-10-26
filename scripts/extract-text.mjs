// Extrai o texto de cada página dos livros do cadastro (scripts/livros.mjs) com pdftotext (poppler).
// - modo raw: ordem de leitura correta (coluna por coluna) — usado para parsear entradas
// - modo layout: colunas alinhadas — usado para parsear tabelas
// A marca d'água do comprador ("Licenciado para Nome, e-mail", grudada no texto da página) sai de qualquer posição. Se
// sobrar e-mail pessoal, o nome dela ou "Licenciado para", a extração para sem gravar: esse texto vai para a busca.
// Saída: data/pages.json  [{book, page, chapter, raw, layout}]
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { LIVROS } from './livros.mjs';
import { watermarks, stripWatermarks, assertClean } from './watermark.mjs';

const run = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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
for (const book of LIVROS) {
  const pdf = path.join(root, 'books', book.pdf);
  if (!fs.existsSync(pdf)) throw new Error(`Falta books/${book.pdf} (${book.name}).`);
  const [rawOut, layoutOut] = await Promise.all([
    run('pdftotext', ['-raw', pdf, '-'], { maxBuffer: 200 * 1024 * 1024 }),
    run('pdftotext', ['-layout', pdf, '-'], { maxBuffer: 200 * 1024 * 1024 }),
  ]);
  const marks = watermarks(rawOut.stdout + '\n' + layoutOut.stdout);
  const rawPages = stripWatermarks(rawOut.stdout, marks).split('\f');
  const layoutPages = stripWatermarks(layoutOut.stdout, marks).split('\f');
  let count = 0;
  for (let index = 0; index < rawPages.length; index++) {
    const page = index + 1 - book.pdfOffset; // página impressa
    if (page < 1 || page > book.pages) continue;
    const chapter = book.chapters?.find(([start, end]) => page >= start && page <= end)?.[2] || '';
    const raw = clean(rawPages[index], page), layout = clean(layoutPages[index] || '', page);
    assertClean(`${book.id} p.${page}`, raw + '\n' + layout, marks);
    pages.push({ book: book.id, page, chapter, raw, layout });
    count++;
  }
  console.log(`${book.id}: ${count} páginas extraídas${marks.length ? ` (marca d'água removida: ${marks.length} comprador${marks.length > 1 ? 'es' : ''})` : ''}`);
}

fs.mkdirSync(path.join(root, 'data'), { recursive: true });
fs.writeFileSync(path.join(root, 'data/pages.json'), JSON.stringify(pages));
console.log(`data/pages.json: ${pages.length} páginas, ${(fs.statSync(path.join(root, 'data/pages.json')).size / 1e6).toFixed(1)} MB`);
