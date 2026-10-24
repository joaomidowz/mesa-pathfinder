// Banco local compartilhado: abre o SQLite aplicando as migrações pendentes — primeiro as de produção (drizzle/),
// depois as só do servidor local (local/migrations/, registradas com o prefixo "local/").
// Sem caminho, usa DATA_DIR/local.db (padrão: data/local.db); ':memory:' serve para testes.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS = [['drizzle', ''], [path.join('local', 'migrations'), 'local/']];

export function openLocalDb(file = path.join(path.resolve(root, process.env.DATA_DIR || 'data'), 'local.db')) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('CREATE TABLE IF NOT EXISTS local_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  for (const [dir, prefix] of MIGRATIONS) {
    const folder = path.join(root, dir);
    if (!fs.existsSync(folder)) continue;
    for (const name of fs.readdirSync(folder).filter(entry => entry.endsWith('.sql')).sort()) {
      if (db.prepare('SELECT 1 FROM local_migrations WHERE name = ?').get(prefix + name)) continue;
      db.exec(fs.readFileSync(path.join(folder, name), 'utf8'));
      db.prepare('INSERT INTO local_migrations (name, applied_at) VALUES (?, ?)').run(prefix + name, new Date().toISOString());
    }
  }
  return db;
}

// Adaptador com a interface D1 usada pelo Worker (mesmo formato do scripts/test-worker.mjs).
export function d1Adapter(sqlite) {
  function statement(sql, params = []) {
    return {
      bind(...values) { return statement(sql, values); },
      async first() { return sqlite.prepare(sql).get(...params) || null; },
      async all() { return { results: sqlite.prepare(sql).all(...params) }; },
      async run() { return { meta: { changes: sqlite.prepare(sql).run(...params).changes } }; },
    };
  }
  return {
    prepare: statement,
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const item of statements) results.push(await item.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
}
