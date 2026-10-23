"""Renderiza páginas impressas dos dois PDFs incluídos no projeto."""
from pathlib import Path
import concurrent.futures
import fitz

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / 'books' / 'rendered'
BOOKS = [('livro1', 1), ('livro2', 2)]

def render_book(spec):
    book, offset = spec
    source = ROOT / 'books' / (book + '.pdf')
    target = OUTPUT / book / 'pages'
    target.mkdir(parents=True, exist_ok=True)
    doc = fitz.open(source)
    for index in range(offset, len(doc)):
        page = index + 1 - offset
        filename = target / (str(page) + '.jpg')
        if not filename.exists():
            pixmap = doc[index].get_pixmap(matrix=fitz.Matrix(1.8, 1.8), alpha=False)
            pixmap.save(filename, jpg_quality=82)
        if page % 100 == 0:
            print(book, page, flush=True)
    return book, len(doc) - offset

if __name__ == '__main__':
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        for book, count in executor.map(render_book, BOOKS):
            print(f'{book}: {count} páginas em {OUTPUT / book}', flush=True)
