// Antes de subir o servidor da mesa (npm start): recria o catálogo de regras a partir de DATA_DIR/pages.json.
// Só troca as tabelas srd_*, numa transação — fichas, membros e acessos não são tocados.
// Sem pages.json (hospedagem ainda sem o texto extraído), segue sem catálogo novo. Se a montagem falhar, o erro fica no
// log e o servidor sobe com o catálogo anterior: a mesa não pode ficar fora do ar por causa do catálogo.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pagesFile = path.join(path.resolve(root, process.env.DATA_DIR || 'data'), 'pages.json');
if (fs.existsSync(pagesFile)) {
  try { await import('./parse-srd.mjs'); }
  catch (error) { console.error(`Catálogo de regras não recarregado (${error.message}); segue o anterior.`); }
}
else console.log(`Catálogo de regras não recarregado: ${pagesFile} não existe.`);
