// Renderiza as páginas impressas dos livros do cadastro (scripts/livros.mjs) para JPG usando o poppler (pdftoppm).
// Equivalente ao scripts/render-books.py original (escala 1.8 ≈ 130 DPI), sem depender de PyMuPDF.
// Saída: books/rendered/<livro>/pages/{página impressa}.jpg. Livro já renderizado é pulado.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { LIVROS } from './livros.mjs';

const run = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BOOKS = LIVROS.map(book => ({ id: book.id, pdf: path.join(root, 'books', book.pdf), pages: book.pages, offset: book.pdfOffset }));

async function renderBook(book) {
  const target = path.join(root, 'books/rendered', book.id, 'pages');
  fs.mkdirSync(target, { recursive: true });
  const missing = [];
  for (let page = 1; page <= book.pages; page++) {
    if (!fs.existsSync(path.join(target, `${page}.jpg`))) missing.push(page);
  }
  if (!missing.length) {
    console.log(`${book.id}: ${book.pages} páginas já renderizadas.`);
    return;
  }
  const firstPdf = Math.min(...missing) + book.offset;
  const lastPdf = Math.max(...missing) + book.offset;
  console.log(`${book.id}: renderizando ${missing.length} páginas (PDF ${firstPdf}-${lastPdf})…`);
  const temp = path.join(root, 'books/rendered', `.tmp-${book.id}`);
  fs.rmSync(temp, { recursive: true, force: true });
  fs.mkdirSync(temp, { recursive: true });
  await run('pdftoppm', ['-jpeg', '-jpegopt', 'quality=82', '-r', '130', book.pdf, path.join(temp, 'pg')]);
  const generated = fs.readdirSync(temp).filter(name => name.endsWith('.jpg')).sort();
  // pdftoppm nomeia pg-001.jpg…pg-470.jpg na ordem do PDF; converter para a página impressa.
  const byPdf = new Map(generated.map(name => {
    const pdfPage = Number(name.match(/pg-(\d+)\.jpg/)[1]);
    return [pdfPage, path.join(temp, name)];
  }));
  let moved = 0;
  for (let page = 1; page <= book.pages; page++) {
    const source = byPdf.get(page + book.offset);
    const destination = path.join(target, `${page}.jpg`);
    if (source && !fs.existsSync(destination)) {
      fs.copyFileSync(source, destination);
      moved++;
      if (moved % 100 === 0) console.log(`${book.id}: ${moved} páginas prontas`);
    }
  }
  fs.rmSync(temp, { recursive: true, force: true });
  console.log(`${book.id}: ${moved} novas páginas em books/rendered/${book.id}/pages`);
}

for (const book of BOOKS) await renderBook(book);
