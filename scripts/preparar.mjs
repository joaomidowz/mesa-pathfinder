// Antes de subir o servidor da mesa (npm start): recria o catálogo de regras a partir de DATA_DIR/pages.json.
// Leva cerca de 1 s e só troca as tabelas srd_* — fichas, membros e acessos não são tocados.
// Sem pages.json (hospedagem ainda sem o texto extraído), segue sem catálogo novo.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pagesFile = path.join(path.resolve(root, process.env.DATA_DIR || 'data'), 'pages.json');
if (fs.existsSync(pagesFile)) await import('./parse-srd.mjs');
else console.log(`Catálogo de regras não recarregado: ${pagesFile} não existe.`);
