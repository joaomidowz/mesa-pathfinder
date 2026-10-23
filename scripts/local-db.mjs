// Banco local compartilhado: abre data/local.db aplicando as migrações drizzle pendentes.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function openLocalDb() {
  fs.mkdirSync(path.join(root, 'data'), { recursive: true });
  const db = new DatabaseSync(path.join(root, 'data', 'local.db'));
  db.exec('CREATE TABLE IF NOT EXISTS local_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  for (const file of fs.readdirSync(path.join(root, 'drizzle')).filter(name => name.endsWith('.sql')).sort()) {
    if (db.prepare('SELECT 1 FROM local_migrations WHERE name = ?').get(file)) continue;
    db.exec(fs.readFileSync(path.join(root, 'drizzle', file), 'utf8'));
    db.prepare('INSERT INTO local_migrations (name, applied_at) VALUES (?, ?)').run(file, new Date().toISOString());
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
