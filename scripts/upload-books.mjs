import fs from 'node:fs/promises';
import path from 'node:path';
async function readConfig() {
  process.stdin.setRawMode?.(true);
  process.stderr.write('Ready for upload JSON on stdin (input is hidden).\n');
  process.stdin.setEncoding('utf8');
  return new Promise((resolve,reject)=>{
    let input='';
    const onData=chunk=>{ input+=chunk; if(input.includes('\u0003')){process.stdin.pause();reject(new Error('Cancelled'));}else if(input.includes('\n')){process.stdin.off('data',onData);process.stdin.setRawMode?.(false);process.stdin.pause();try{resolve(JSON.parse(input));}catch{reject(new Error('Invalid config'));}}};
    process.stdin.on('data',onData);
  });
}
const config=await readConfig();
const expected='https://ficha-anao-barbaro.jgcustodio2005.chatgpt.site';
if(config.url!==expected)throw new Error('Unexpected Site origin');
const headers={'OAI-Sites-Authorization':'Bearer '+config.bearer,'x-book-upload-token':config.uploadToken,'content-type':'application/json'};
async function request(method,body){const response=await fetch(config.url+'/api/provision/books',{method,headers,body:body?JSON.stringify(body):undefined,redirect:'error'});if(!response.ok)throw new Error('Upload status '+response.status+': '+(await response.text()).slice(0,300));return response.json();}
if(config.verifyOnly){console.log(JSON.stringify(await request('GET')));process.exit(0);}
const root=process.argv[2];
const paths=[];
for(const book of ['livro1','livro2']){for(const file of await fs.readdir(path.join(root,book,'pages'))){if(file.endsWith('.jpg'))paths.push({key:book+'/pages/'+file,path:path.join(root,book,'pages',file)});}}
const batches=[];let batch=[],size=0;
for(const entry of paths){const bytes=(await fs.stat(entry.path)).size;const encodedSize=Math.ceil(bytes/3)*4+100;if(encodedSize>1450000)throw new Error('Page too large: '+entry.key);if(size+encodedSize>1400000||batch.length>=6){batches.push(batch);batch=[];size=0;}batch.push(entry);size+=encodedSize;}
if(batch.length)batches.push(batch);
let next=0,done=0;
async function run(){while(next<batches.length){const entries=batches[next++];const files=await Promise.all(entries.map(async entry=>({key:entry.key,base64:(await fs.readFile(entry.path)).toString('base64')})));let success=false;for(let attempt=0;attempt<3;attempt++){try{await request('POST',{files});success=true;break;}catch(error){if(attempt===2)throw error;}}if(success){done+=entries.length;if(done%50<entries.length)console.log('Uploaded',done,'/',paths.length);}}}
await Promise.all(Array.from({length:6},run));
console.log('BOOKS_UPLOADED',JSON.stringify(await request('GET')));
