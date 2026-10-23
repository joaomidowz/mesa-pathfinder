-- Catálogo SRD estruturado extraído dos livros (consulta rápida estilo pf2srd/aonprd).
-- type: spell | focus | ritual | feat | class | ancestry | condition
CREATE TABLE srd_entries (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  norm TEXT NOT NULL,
  level INTEGER,
  category TEXT,
  category_norm TEXT,
  traits TEXT,
  traits_norm TEXT,
  book TEXT NOT NULL,
  page INTEGER NOT NULL,
  data TEXT NOT NULL
);
CREATE INDEX idx_srd_entries_type_level ON srd_entries(type, level);
CREATE INDEX idx_srd_entries_name ON srd_entries(name);

-- Busca de texto completo nas entradas (nome + regra).
CREATE VIRTUAL TABLE srd_fts USING fts5(name, text, tokenize='unicode61 remove_diacritics 2');

-- Busca de texto completo nas páginas dos livros (fallback para conteúdo ainda não estruturado).
CREATE TABLE srd_pages (
  book TEXT NOT NULL,
  page INTEGER NOT NULL,
  chapter TEXT,
  norm TEXT NOT NULL,
  text TEXT NOT NULL,
  PRIMARY KEY (book, page)
);
CREATE VIRTUAL TABLE srd_pages_fts USING fts5(text, tokenize='unicode61 remove_diacritics 2');
