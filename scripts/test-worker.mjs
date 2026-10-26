import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import worker from '../dist/server/index.js';
import { livrosDoWorker } from './livros.mjs';
const sqlite=new DatabaseSync(':memory:');
for(const file of fs.readdirSync('drizzle').filter(file=>file.endsWith('.sql')).sort())sqlite.exec(fs.readFileSync('drizzle/'+file,'utf8'));
function statement(sql,params=[]) {return{bind(...values){return statement(sql,values);},async first(){return sqlite.prepare(sql).get(...params)||null;},async all(){return{results:sqlite.prepare(sql).all(...params)};},async run(){return{meta:{changes:sqlite.prepare(sql).run(...params).changes}};}};}
const adapter={prepare:statement,async batch(statements){sqlite.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());sqlite.exec('COMMIT');return results;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
const bucket=new Map();
const env={DB:adapter,TABLE_OWNER_EMAIL:'admin@test.example',BUCKET:{async get(key){return bucket.get(key)||null;},async put(key,value){bucket.set(key,{body:value});},async list(){return{objects:Array.from(bucket.keys()).map(key=>({key,size:1})),truncated:false};}}};
const identities={admin:['a','admin@test.example'],alice:['b','alice@test.example'],bob:['c','bob@test.example'],gm:['d','gm@test.example'],outsider:['e','stranger@test.example']};
async function req(user,route,method='GET',payload,extra={}){const headers={'content-type':'application/json',...extra};if(user){headers['oai-authenticated-user-id']=identities[user][0];headers['oai-authenticated-user-email']=identities[user][1];}const response=await worker.fetch(new Request('https://table.test/api/'+route,{method,headers,body:payload?JSON.stringify(payload):undefined}),env);return{status:response.status,json:await response.json()};}
let checks=0;function status(result,n){assert.equal(result.status,n,JSON.stringify(result.json));checks++;return result.json;}
status(await req(null,'session'),401);status(await req('outsider','session'),403);
const original={profile:{name:'Anão original',level:'2'},stats:{hpCurrent:'31'},extra:{test:'preservar'}};
sqlite.prepare('INSERT INTO character_sheets (user_id,data,updated_at) VALUES (?,?,?)').run('a',JSON.stringify(original),'2026-10-01');
status(await req('admin','session'),200);status(await req('admin','session'),200);
let own=status(await req('admin','characters'),200);assert.equal(own.characters.length,1);assert.equal(own.characters[0].name,'Anão original');checks++;
assert.deepEqual(status(await req('admin','characters/'+own.characters[0].id),200).data,original);checks++;
for(const [email,role] of [['alice@test.example','player'],['bob@test.example','player'],['gm@test.example','master']])status(await req('admin','members','POST',{email,role}),200);
status(await req('alice','session'),200);status(await req('bob','session'),200);status(await req('gm','session'),200);
const alice=status(await req('alice','characters','POST',{data:{profile:{name:'Alice',className:'Maga'}}}),201);
const bob=status(await req('bob','characters','POST',{data:{profile:{name:'Bob'}}}),201);
assert.equal(status(await req('alice','characters'),200).characters.length,1);checks++;
status(await req('bob','characters/'+alice.id),404);status(await req('bob','characters/'+alice.id,'PUT',{data:{profile:{name:'hack'}},version:1}),404);
status(await req('alice','members'),403);status(await req('alice','members','POST',{email:'h@test.example',role:'master'}),403);
assert.equal(status(await req('gm','characters'),200).characters.length,3);checks++;
assert.equal(status(await req('gm','characters/'+alice.id),200).readOnly,true);checks++;
status(await req('gm','characters/'+alice.id,'PUT',{data:{profile:{name:'hack'}},version:1}),404);
status(await req('admin','characters/'+alice.id),404);
status(await req('alice','characters/'+alice.id,'PUT',{data:{profile:{name:'Alice nova'}},version:1}),200);
status(await req('alice','characters/'+alice.id,'PUT',{data:{profile:{name:'stale'}},version:1}),409);
assert.equal(status(await req('alice','characters/'+alice.id),200).data.profile.name,'Alice nova');checks++;
status(await req('alice','characters/'+alice.id,'PUT',{data:{profile:{name:'cross'}},version:2},{origin:'https://evil.test'}),403);
status(await req('admin','members','DELETE',{email:'alice@test.example'}),200);status(await req('alice','characters'),403);
status(await req('bob','character','PUT',{data:{profile:{name:'old-tab'}}}),410);
status(await req('admin','members','DELETE',{email:'admin@test.example'}),400);
status(await req('admin','members','POST',{email:'oops',role:'master'}),400);
status(await req('admin','members','POST',{email:'ok@test.example',role:'admin'}),400);
status(await req(null,'provision/books','POST',{files:[]}),401);
status(await req('admin','provision/books','POST',{files:[]}),404);
status(await req('outsider','books'),403);status(await req('bob','books'),200);status(await req('gm','books/livro2/pages/323'),404);
// SRD: busca estruturada e navegação por catálogo.
status(await req(null,'search?q=bola'),401);
sqlite.prepare("INSERT INTO srd_entries (id,type,name,norm,level,category,traits,book,page,data) VALUES (?,?,?,?,?,?,?,?,?,?)").run('spell-boladefogo-livro1-3','spell','BOLA DE FOGO','boladefogo',3,'','FOGO, CONCENTRAÇÃO','livro1',319,JSON.stringify({name:'BOLA DE FOGO',type:'spell',level:3,traditions:'arcana, primal',text:'Uma feroz explosão de fogo detona.',defense:'Reflexos básico'}));
sqlite.prepare('INSERT INTO srd_fts (rowid, name, text) SELECT rowid, name, json_extract(data, \'$.text\') FROM srd_entries WHERE id = ?').run('spell-boladefogo-livro1-3');
sqlite.prepare("INSERT INTO srd_entries (id,type,name,norm,level,category,traits,book,page,data) VALUES (?,?,?,?,?,?,?,?,?,?)").run('feat-elfoligeiro-livro1-1','feat','ELFO LIGEIRO','elfoligeiro',1,'ancestralidade: Elfo','ELFO','livro1',48,JSON.stringify({name:'ELFO LIGEIRO',type:'feat',level:1,text:'Sua Velocidade aumenta em +1,5 metro.'}));
sqlite.prepare('INSERT INTO srd_fts (rowid, name, text) SELECT rowid, name, json_extract(data, \'$.text\') FROM srd_entries WHERE id = ?').run('feat-elfoligeiro-livro1-1');
sqlite.prepare("INSERT INTO srd_pages (book,page,chapter,norm,text) VALUES ('livro1',319,'Magia','exemplodepaginanorm','Texto integral da página com bola de fogo.')").run();
sqlite.prepare('INSERT INTO srd_pages_fts (rowid, text) SELECT rowid, text FROM srd_pages WHERE rowid = last_insert_rowid()').run();
// Páginas sintéticas: uma em que "seta" só existe no texto espremido (por cima de palavras) e uma com palavras coladas pelo PDF.
sqlite.prepare("INSERT INTO srd_pages (book,page,chapter,norm,text) VALUES ('livro1',20,'Introdução','talentosgeraisetalentosdepericia','Talentos gerais e talentos de perícia.')").run();
sqlite.prepare('INSERT INTO srd_pages_fts (rowid, text) SELECT rowid, text FROM srd_pages WHERE rowid = last_insert_rowid()').run();
sqlite.prepare("INSERT INTO srd_pages (book,page,chapter,norm,text) VALUES ('livro1',321,'Magia','exemplocomboladefogocoladopelopdf','Exemplo com Bolade Fogo colado pelo PDF.')").run();
sqlite.prepare('INSERT INTO srd_pages_fts (rowid, text) SELECT rowid, text FROM srd_pages WHERE rowid = last_insert_rowid()').run();
const search=status(await req('bob','search?q=bola+de+fogo'),200);
assert.equal(search.entries.length,1);assert.equal(search.entries[0].name,'BOLA DE FOGO');checks++;
assert.deepEqual(search.pages.map(p=>p.page).sort((a,b)=>a-b),[319,321]);checks++;
assert.equal(status(await req('bob','search?q=seta'),200).pages.length,0);checks++;
const noAccent=status(await req('bob','search?q=fogo'),200);
assert.equal(noAccent.entries.length,1);checks++;
const byType=status(await req('bob','search?type=feat'),200);
assert.equal(byType.entries.length,1);assert.equal(byType.entries[0].id,'feat-elfoligeiro-livro1-1');checks++;
const byLevel=status(await req('bob','search?type=spell&level=4'),200);
assert.equal(byLevel.entries.length,0);checks++;
const stats=status(await req('bob','srd/stats'),200);
assert.equal(stats.total,2);checks++;
const entry=status(await req('bob','entries/spell-boladefogo-livro1-3'),200);
assert.equal(entry.data.traditions,'arcana, primal');checks++;
status(await req('bob','entries/nao-existe'),404);
status(await req('bob','search?q=ok&type=ruim'),400);
// Campos da página Sessão: listas e conjuração validadas no servidor.
const sheet={profile:{name:'Bob'},heroPoints:'1',conditions:[{id:'condition-assustado-livro1',name:'Assustado',value:'2'}],spellcasting:{tradition:'arcana',kind:'preparado',attack:'+7',dc:'17',slots:{'1':{max:'2',used:'1'}},focus:{max:'1',current:'1'}},spells:[{id:'spell-boladefogo-livro1-3',name:'BOLA DE FOGO',rank:'3',notes:''}],items:[{id:'',name:'Corda',qty:'1',bulk:'L',invested:false,notes:''}]};
status(await req('bob','characters/'+bob.id,'PUT',{data:sheet,version:1}),200);
assert.deepEqual(status(await req('bob','characters/'+bob.id),200).data,sheet);checks++;
for(const broken of [{spells:{}},{items:['corda']},{conditions:'Assustado'},{spellcasting:[]}])status(await req('bob','characters/'+bob.id,'PUT',{data:{...sheet,...broken},version:2}),400);
// Ficha v2: sorte, escolhas de talento, defesa e moedas voltam iguais; escolhas e defesa malformadas são recusadas.
const sheetV2={...sheet,luck:'3',sheetVersion:'2',choices:[{id:'',name:'Golpe de Teste',slot:'classe',level:'1',manual:true,note:'Golpe de Teste (livro A)'}],defense:{ac:{category:'light',dexCap:'+3',item:'2'},armorProf:{unarmored:'T',light:'T',medium:'U',heavy:'U'},shield:{bonus:'2',hardness:'3',hpMax:'12',bt:'6',hp:'12',raised:true},acBonus:'-1'},inventory:{carried:'Corda (L)',coins:{pl:'0',po:'4',pp:'25',pc:'137'}},items:[{...sheet.items[0],section:'carregavel'}]};
status(await req('bob','characters/'+bob.id,'PUT',{data:sheetV2,version:2}),200);
assert.deepEqual(status(await req('bob','characters/'+bob.id),200).data,sheetV2);checks++;
for(const broken of [{choices:{}},{choices:['talento']},{defense:[]},{defense:'x'}])status(await req('bob','characters/'+bob.id,'PUT',{data:{...sheetV2,...broken},version:3}),400);
// Itens entram na busca como tipo próprio.
sqlite.prepare("INSERT INTO srd_entries (id,type,name,norm,level,category,traits,book,page,data) VALUES (?,?,?,?,?,?,?,?,?,?)").run('item-cordadeseda-livro2-1','item','CORDA DE SEDA','cordadeseda',1,'equipamento','','livro2',300,JSON.stringify({name:'CORDA DE SEDA',type:'item',text:'Uma corda leve.'}));
assert.equal(status(await req('bob','search?type=item'),200).entries[0].id,'item-cordadeseda-livro2-1');checks++;
// Vagas de talento: nível máximo, categorias repetidas (até 3, com OU) e teto de 200 por busca. Catálogo sintético.
const addFeat=sqlite.prepare("INSERT INTO srd_entries (id,type,name,norm,level,category,category_norm,traits,book,page,data) VALUES (?,?,?,?,?,?,?,?,?,?,?)");
for(let i=0;i<210;i++){const level=i%4+1;addFeat.run('feat-talentotesteiro'+i+'-livro1-'+level,'feat','TALENTO TESTEIRO '+i,'talentotesteiro'+i,level,'classe: Testeiro','classetesteiro','','livro1',1,JSON.stringify({name:'TALENTO TESTEIRO '+i,type:'feat',level,text:'Texto sintético testeirada '+i+'.'}));}
for(const level of [1,3])addFeat.run('feat-provador'+level+'-livro1-'+level,'feat','PROVADOR '+level,'provador'+level,level,'classe: Provador','classeprovador','','livro1',2,JSON.stringify({name:'PROVADOR '+level,type:'feat',level,text:'Outro texto sintético.'}));
sqlite.prepare("INSERT INTO srd_fts (rowid, name, text) SELECT rowid, name, json_extract(data, '$.text') FROM srd_entries WHERE category IN ('classe: Testeiro', 'classe: Provador')").run();
const upTo2=status(await req('bob','search?type=feat&category=classe:+Testeiro&maxLevel=2&limit=200'),200).entries;
assert.equal(upTo2.length,106);assert.ok(upTo2.every(item=>item.level<=2));checks++;
assert.equal(status(await req('bob','search?type=feat&category=classe:+Testeiro&limit=500'),200).entries.length,200);checks++;
assert.equal(status(await req('bob','search?type=feat&category=classe:+Testeiro'),200).entries.length,25);checks++;
for(const bad of ['abc','123','-1','2.5'])status(await req('bob','search?type=feat&maxLevel='+bad),400);
const union=status(await req('bob','search?type=feat&category=classe:+Provador&category=classe:+Testeiro&maxLevel=1&limit=200'),200).entries;
assert.equal(union.length,54);assert.ok(union.some(item=>item.id==='feat-provador1-livro1-1')&&union.every(item=>item.level===1));checks++;
assert.deepEqual(status(await req('bob','search?type=feat&category=classe:+Provador'),200).entries.map(item=>item.id),['feat-provador1-livro1-1','feat-provador3-livro1-3']);checks++;
assert.equal(status(await req('bob','search?type=feat&category=zzz1&category=zzz2&category=zzz3&category=classe:+Provador'),200).entries.length,0);checks++;
const fullText=status(await req('bob','search?q=testeirada&maxLevel=1&limit=200'),200).entries;
assert.equal(fullText.length,53);assert.ok(fullText.every(item=>item.level===1&&item.id.startsWith('feat-talentotesteiro')));checks++;
assert.equal(status(await req('bob','search?q=testeirada&limit=200'),200).entries.length,200);checks++;
// Grupo: qualquer membro vê o resumo das fichas dos jogadores ativos; criaturas do mestre só ele; revogado some.
const wolf=status(await req('gm','characters','POST',{data:{profile:{name:'Lobo'},stats:{hpMax:'24',hpCurrent:'24'}}}),201);
const partyBob=status(await req('bob','party'),200).characters;
assert.deepEqual(partyBob.map(item=>item.name).sort(),['Anão original','Bob']);checks++;
const bobCard=partyBob.find(item=>item.id===bob.id);
assert.equal(bobCard.owned,true);assert.deepEqual(bobCard.data.conditions,[{name:'Assustado',value:'2'}]);assert.equal(bobCard.data.spellcasting.dc,'17');assert.equal(bobCard.data.heroPoints,'1');checks++;
assert.equal(partyBob.find(item=>item.name==='Anão original').data.stats.hpCurrent,'31');checks++;
assert.ok(partyBob.every(item=>!('ownerEmail' in item)&&!('spells' in item.data)&&!('items' in item.data)&&!('notes' in item.data)&&!('slots' in item.data.spellcasting)),'resumo sem e-mail nem ficha completa');checks++;
const partyGm=status(await req('gm','party'),200).characters;
assert.deepEqual(partyGm.map(item=>item.name).sort(),['Anão original','Bob','Lobo']);checks++;
assert.equal(partyGm.find(item=>item.id===wolf.id).owned,true);assert.equal(partyGm.find(item=>item.id===bob.id).ownerEmail,'bob@test.example');checks++;
status(await req('outsider','party'),403);status(await req(null,'party'),401);
// Limite de fichas: 30 para jogador, 300 para o mestre (criaturas e NPCs como fichas próprias).
const made=[];for(let i=0;i<29;i++)made.push((await req('bob','characters','POST',{data:{profile:{name:'Bob '+i}}})).status);
assert.ok(made.every(code=>code===201));checks++;
status(await req('bob','characters','POST',{data:{profile:{name:'Bob demais'}}}),400);
const creatures=[];for(let i=0;i<31;i++)creatures.push((await req('gm','characters','POST',{data:{profile:{name:'Criatura '+i}}})).status);
assert.ok(creatures.every(code=>code===201));checks++;
// Modo de convite vem do ambiente: o servidor da mesa usa códigos de acesso.
assert.equal(status(await req('bob','session'),200).invitationMode,'private-site-sharing');checks++;
env.INVITATION_MODE='access-code';assert.equal(status(await req('bob','session'),200).invitationMode,'access-code');checks++;delete env.INVITATION_MODE;
// Livros por público: bestiario1 (do mestre) só para o mestre; o administrador entra como jogador e não vê. polvora e ocultos são de todos.
// Tudo SINTÉTICO, nada dos livros: "zorbalho" casa pelo FTS; "quimera azul" só pelo texto espremido (reforço por LIKE).
const allBooks=livrosDoWorker(),openBooks=allBooks.filter(book=>book.audience==='todos');
assert.ok(allBooks.some(book=>book.id==='bestiario1'&&book.audience==='mestre')&&openBooks.some(book=>book.id==='polvora')&&openBooks.some(book=>book.id==='ocultos'),'premissa do cadastro');checks++;
const squeeze=text=>text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const addEntry=sqlite.prepare("INSERT INTO srd_entries (id,type,name,norm,level,category,category_norm,traits,book,page,data) VALUES (?,?,?,?,?,?,?,?,?,?,?)");
for(const [id,type,name,level,category,book,page,data] of [
  ['creature-lobozorbalho-bestiario1','creature','LOBO ZORBALHO',-1,'','bestiario1',7,{legacy:true,remaster:[],text:'Percepção +6; faro sintético\nCA 15; Fort +7, Ref +7, Von +4\nPV 20'}],
  ['affliction-quimeraazulmaldita-bestiario1-3','affliction','QUIMERAAZUL MALDITA',3,'maldição','bestiario1',8,{text:'Salvamento Vontade CD 18\nEstágio 1 texto sintético'}],
  ['creature-automatozorbalho-polvora-2','creature','AUTÔMATO ZORBALHO',2,'','polvora',9,{legacy:true,remaster:['Termo sintético atualizado.'],text:'Percepção +4; sentido sintético'}],
  ['vehicle-carroquimeraazul-polvora-1','vehicle','CARRO QUIMERAAZUL',1,'','polvora',10,{text:'Velocidade 9 metros'}],
  ['feat-talentoocultozorbalho-ocultos-1','feat','TALENTO OCULTO ZORBALHO',1,'geral','ocultos',3,{text:'Texto sintético de teste.'}],
])addEntry.run(id,type,name,squeeze(name),level,category,squeeze(category),'',book,page,JSON.stringify({name,type,level,...data}));
sqlite.prepare("INSERT INTO srd_fts (rowid, name, text) SELECT rowid, name, json_extract(data, '$.text') FROM srd_entries WHERE book IN ('bestiario1','polvora','ocultos')").run();
const addPage=sqlite.prepare("INSERT INTO srd_pages (book,page,chapter,norm,text) VALUES (?,?,'',?,?)");
for(const [book,page,text] of [['bestiario1',1,'Página sintética do zorbalho escondido.'],['bestiario1',2,'Uma Quimeraazul colada pelo PDF.'],['polvora',3,'Página sintética do zorbalho aberto.'],['polvora',4,'Outra Quimeraazul colada pelo PDF.']])addPage.run(book,page,squeeze(text),text);
sqlite.prepare("INSERT INTO srd_pages_fts (rowid, text) SELECT rowid, text FROM srd_pages WHERE book IN ('bestiario1','polvora')").run();
for(const key of ['bestiario1/pages/1.jpg','polvora/pages/1.jpg','ocultos/pages/1.jpg'])bucket.set(key,{body:new Uint8Array([0xff,0xd8,0xff,0xd9])});
async function bookPage(user,route){const response=await worker.fetch(new Request('https://table.test/api/books/'+route,{headers:{'oai-authenticated-user-id':identities[user][0],'oai-authenticated-user-email':identities[user][1]}}),env);return{status:response.status,type:response.headers.get('content-type'),json:response.status===200?null:await response.json()};}
const ids=result=>result.entries.map(item=>item.id).sort(),pageKeys=result=>result.pages.map(item=>item.book+'/'+item.page).sort();
const pageMissing=status(await bookPage('gm','livro2/pages/323'),404).error;
for(const who of ['bob','admin']){
  assert.deepEqual(status(await req(who,'books'),200).books,openBooks);assert.deepEqual(status(await req(who,'session'),200).books,openBooks);checks++;
  const fts=status(await req(who,'search?q=zorbalho'),200);
  assert.deepEqual(ids(fts),['creature-automatozorbalho-polvora-2','feat-talentoocultozorbalho-ocultos-1']);assert.deepEqual(pageKeys(fts),['polvora/3']);checks++;
  const like=status(await req(who,'search?q=quimera+azul'),200);
  assert.deepEqual(ids(like),['vehicle-carroquimeraazul-polvora-1']);assert.deepEqual(pageKeys(like),['polvora/4']);checks++;
  assert.deepEqual(ids(status(await req(who,'search?type=creature'),200)),['creature-automatozorbalho-polvora-2']);checks++;
  assert.equal(status(await req(who,'entries/creature-lobozorbalho-bestiario1'),404).error,'Entrada não encontrada.');checks++;
  assert.equal(status(await bookPage(who,'bestiario1/pages/1'),404).error,pageMissing);checks++;
  status(await bookPage(who,'ocultos/pages/1'),200);
  // Livro sem pageImages no cadastro fica só referenciado: nem arquivo que sobrou no volume é servido.
  assert.equal(status(await bookPage(who,'polvora/pages/1'),404).error,pageMissing);checks++;
}
assert.equal(status(await bookPage('bob','naoexiste/pages/1'),404).error,pageMissing);checks++;
assert.deepEqual(status(await req('bob','entries/creature-automatozorbalho-polvora-2'),200).data.remaster,['Termo sintético atualizado.']);checks++;
// O mestre vê tudo: lista, busca (FTS e LIKE), entrada e página.
assert.deepEqual(status(await req('gm','books'),200).books,allBooks);assert.deepEqual(status(await req('gm','session'),200).books,allBooks);checks++;
const gmFts=status(await req('gm','search?q=zorbalho'),200);
assert.deepEqual(ids(gmFts),['creature-automatozorbalho-polvora-2','creature-lobozorbalho-bestiario1','feat-talentoocultozorbalho-ocultos-1']);assert.deepEqual(pageKeys(gmFts),['bestiario1/1','polvora/3']);checks++;
const gmLike=status(await req('gm','search?q=quimera+azul'),200);
assert.deepEqual(ids(gmLike),['affliction-quimeraazulmaldita-bestiario1-3','vehicle-carroquimeraazul-polvora-1']);assert.deepEqual(pageKeys(gmLike),['bestiario1/2','polvora/4']);checks++;
assert.equal(status(await req('gm','entries/creature-lobozorbalho-bestiario1'),200).book,'bestiario1');checks++;
const gmPage=await bookPage('gm','ocultos/pages/1');status(gmPage,200);assert.equal(gmPage.type,'image/jpeg');checks++;
assert.equal(status(await bookPage('gm','bestiario1/pages/1'),404).error,pageMissing);checks++;
// Contagens só do que a conta vê.
const statsOf=async who=>status(await req(who,'srd/stats'),200),count=(stats,type)=>stats.types.find(row=>row.type===type)?.count||0;
const gmStats=await statsOf('gm'),bobStats=await statsOf('bob');
assert.equal(gmStats.total,sqlite.prepare('SELECT COUNT(*) AS n FROM srd_entries').get().n);assert.equal(bobStats.total,gmStats.total-2);assert.deepEqual(await statsOf('admin'),bobStats);checks++;
assert.deepEqual([count(gmStats,'creature'),count(bobStats,'creature'),count(gmStats,'affliction'),count(bobStats,'affliction')],[2,1,1,0]);checks++;
// Filtro de livro por id ou sigla, sem diferenciar maiúsculas, e vale também para as páginas; escondido ou inexistente: o mesmo 400.
assert.deepEqual(ids(status(await req('bob','search?book=AO'),200)),['feat-talentoocultozorbalho-ocultos-1']);checks++;
const byAlias=status(await req('bob','search?book=ao&q=zorbalho'),200);
assert.deepEqual(ids(byAlias),['feat-talentoocultozorbalho-ocultos-1']);assert.deepEqual(byAlias.pages,[]);checks++;
assert.deepEqual(ids(status(await req('bob','search?book='+openBooks.find(book=>book.id==='livro2').aliases.at(-1).toLowerCase()),200)),['item-cordadeseda-livro2-1']);checks++;
const gmB1=status(await req('gm','search?book=b1&q=zorbalho'),200);
assert.deepEqual(ids(gmB1),['creature-lobozorbalho-bestiario1']);assert.deepEqual(pageKeys(gmB1),['bestiario1/1']);checks++;
const unknownBook=status(await req('bob','search?book=xyz'),400).error;
assert.equal(status(await req('bob','search?book=b1&q=zorbalho'),400).error,unknownBook);assert.equal(status(await req('admin','search?book=bestiario1'),400).error,unknownBook);checks++;
// Tipos novos e nível -1 (criaturas e perigos).
for(const type of ['creature','hazard','affliction','vehicle'])status(await req('bob','search?type='+type),200);
assert.deepEqual(ids(status(await req('gm','search?type=creature&level=-1'),200)),['creature-lobozorbalho-bestiario1']);assert.deepEqual(ids(status(await req('bob','search?type=creature&level=-1'),200)),[]);checks++;
status(await req('gm','search?type=creature&level=--1'),400);
console.log('PASS',checks,'checks: membership, privacy, role changes, migration, optimistic locking, books, provisioning, SRD search, session fields, sheet v2 fields, items, feat slots (max level, repeated categories, 200 cap), party, limits, invitation mode, books by audience (list, session, pages, search FTS/LIKE, entries, stats, book by id or alias), new SRD types.');
sqlite.close();
