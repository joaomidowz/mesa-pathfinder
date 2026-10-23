import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const assets = {};
for (const file of fs.readdirSync(dist)) {
  if (/\.(html|css|js)$/.test(file) && fs.statSync(path.join(dist,file)).isFile()) assets[file] = fs.readFileSync(path.join(dist,file),'utf8');
}
fs.mkdirSync(path.join(dist,'server'),{recursive:true});
fs.mkdirSync(path.join(dist,'.openai'),{recursive:true});
fs.copyFileSync(path.join(root,'.openai/hosting.json'),path.join(dist,'.openai/hosting.json'));
const source = fs.readFileSync(path.join(root,'worker/index.mjs'),'utf8');
const ownerDefaults = fs.readFileSync(path.join(root,'worker/owner-defaults.json'),'utf8');
fs.writeFileSync(path.join(dist,'server/index.js'),source.replace('__ASSETS__',()=>JSON.stringify(assets)).replace('__OWNER_DEFAULTS__',()=>ownerDefaults));
console.log('Worker construído: mesa, fichas e livros protegidos.');
