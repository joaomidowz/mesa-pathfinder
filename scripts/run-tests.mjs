// Monta o Worker e roda todas as suítes scripts/test-*.mjs, cada uma em processo próprio.
// O build vem antes para nenhum teste passar contra um dist/server/index.js antigo.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const run = file => spawnSync(process.execPath, [file], { cwd: root, stdio: 'inherit' }).status === 0;

if (!run('scripts/build-worker.mjs')) process.exit(1);
const suites = fs.readdirSync(path.join(root, 'scripts')).filter(name => /^test-.+\.mjs$/.test(name)).sort();
const failed = suites.filter(name => !run(path.join('scripts', name)));
console.log(failed.length ? `FALHOU: ${failed.join(', ')}` : `${suites.length} suíte(s) verde(s): ${suites.join(', ')}`);
process.exit(failed.length ? 1 : 0);
