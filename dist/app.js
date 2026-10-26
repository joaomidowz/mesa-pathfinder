const DEFAULTS = {
  profile: { name: '', player: '', level: '1', xp: '0', ancestry: '', heritage: '', background: '', className: '', instinct: '', deity: '' },
  stats: Object.fromEntries(['str','dex','con','int','wis','cha','hpMax','hpCurrent','hpTemp','ac','fort','reflex','will','perception','speed','classDc'].map(key=>[key,'0'])),
  skills: Object.fromEntries(['acrobatics','arcana','athletics','diplomacy','deception','stealth','intimidation','thievery','crafting','medicine','nature','occultism','performance','religion','society','survival','warfareLore'].map(key=>[key,'0'])),
  languages:'', feats: { ancestry:'',ancestryTalent:'',background:'',class1:'',class2:'',skill2:'',archetype:'' },
  abilities:{}, attacks:[], references:[], fieldReferences:{}, extra:{},
  inventory:{carried:'',consumables:'',equipped:'',wealth:'',coins:{pl:'0',po:'0',pp:'0',pc:'0'}},
  notes:{session:'',questions:'',allies:'',enemies:'',organizations:'',personality:'',history:''},
  // Campos da página do personagem (docs/modelo-da-ficha.md); fichas antigas ganham os vazios no merge.
  heroPoints:'0', luck:'0', conditions:[], spells:[], items:[], choices:[],
  spellcasting:{tradition:'',kind:'',attack:'',dc:'',slots:{},focus:{max:'0',current:'0'}},
  defense:{ac:{category:'',dexCap:'',item:''},armorProf:{unarmored:'',light:'',medium:'',heavy:''},shield:{bonus:'',hardness:'',hpMax:'',bt:'',hp:'',cover:'',raised:false},acBonus:'0'}
};
const skillInfo = {
  acrobatics:['Acrobatismo','Equilibrar-se, Atravessar Acrobaticamente e Escapar.'],arcana:['Arcanismo','Conhecimentos arcanos, Identificar Magia e Decifrar Escrita apropriada.'],athletics:['Atletismo','Escalar, Nadar, Saltar, Agarrar, Derrubar, Desarmar, Empurrar e Reposicionar. Cada ação tem seus requisitos.'],diplomacy:['Diplomacia','Impressionar, Pedir e Obter Informação.'],deception:['Dissimulação','Mentir, Fintar, Personificar e Criar uma Distração.'],stealth:['Furtividade','Esconder-se, Esgueirar-se e Evitar Observação.'],intimidation:['Intimidação','Desmoralizar em combate e Coagir. Consulte requisitos e imunidade temporária no livro.'],thievery:['Ladroagem','Abrir Fechaduras, Desabilitar Dispositivos, Palmear e Furtar.'],crafting:['Manufatura','Criar, Reparar e identificar materiais e itens apropriados.'],medicine:['Medicina','Primeiros Socorros, Tratar Ferimentos, Doenças e Venenos.'],nature:['Natureza','Conhecimentos naturais, Comandar um Animal e ações mágicas apropriadas.'],occultism:['Ocultismo','Conhecimentos ocultos, espíritos, fenômenos e magia ocultista.'],performance:['Performance','Atuar, cantar, tocar ou realizar apresentações.'],religion:['Religião','Conhecimentos religiosos, divindades, mortos-vivos e magia divina.'],society:['Sociedade','Povos, história, leis, culturas e Subsistir em cidades.'],survival:['Sobrevivência','Rastrear, Subsistir, Orientar-se e Cobrir Rastros.'],warfareLore:['Saber de Guerra','Recordar Conhecimento sobre táticas, batalhas e exércitos.']
};
const escapeAttr = value => String(value ?? '').replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const clone = value => JSON.parse(JSON.stringify(value));
function merge(base, extra) { for(const [key,value] of Object.entries(extra || {})) { if(['__proto__','prototype','constructor'].includes(key)) continue; if(value && typeof value==='object' && !Array.isArray(value)) base[key]=merge(base[key] && typeof base[key]==='object' ? base[key] : {},value); else base[key]=value; } return base; }
function getByPath(object,path) { return path.split('.').reduce((value,key)=>value?.[key],object); }
function setByPath(object,path,value) { const parts=path.split('.'); if(parts.some(key=>['__proto__','prototype','constructor'].includes(key))) return; let target=object; for(const key of parts.slice(0,-1)) target=target[key] ||= {}; target[parts.at(-1)]=value; }
let session, character, data, books=[], pending=false, conflict=false, draftVersion=null, backupTimer, saving=null, editCounter=0, lastStatus='';
const isMesa = location.pathname.endsWith('/mesa.html');
let selectedId = new URLSearchParams(location.search).get('character');
function localKey() { return `mesa-v4:${session.user.id}:${character.id}`; }
function readOnly() { return character?.readOnly; }
async function request(url,method='GET',payload,{keepalive=false}={}) {
  let response;
  try { response=await fetch(url,{method,cache:'no-store',keepalive,headers:payload?{'content-type':'application/json'}:undefined,body:payload?JSON.stringify(payload):undefined}); }
  catch { throw Object.assign(new Error('Sem conexão com a mesa.'),{status:0}); }
  let result; try { result=await response.json(); } catch { result={error:'Resposta inválida do servidor.'}; }
  if(!response.ok) { const error=new Error(result.error || 'Falha de conexão.'); error.status=response.status; throw error; }
  return result;
}
function api(path,method,payload,options) { return request('/api/'+path,method,payload,options); }
// Rotas do servidor da mesa (/auth/*): só existem quando session.invitationMode é 'access-code' (cada um com o seu
// código) ou 'email' (jogadores e mestre entram só com o e-mail cadastrado).
function auth(path,payload) { return request('/auth/'+path,'POST',payload || {}); }
function accessCodes() { return session?.invitationMode==='access-code'; }
function emailLogin() { return session?.invitationMode==='email'; }
function ownServer() { return accessCodes() || emailLogin(); }
// O status só é reescrito quando muda: repintar o topo a cada tecla pesa no celular. O botão Salvar mostra o estado.
const SAVE_LABELS={saved:'Salvo',saving:'Salvando…',pending:'Salvar',offline:'Tentar de novo'};
function setStatus(message,state='') {
  if(lastStatus===state+'|'+message) return;
  lastStatus=state+'|'+message;
  document.querySelectorAll('[data-cloud-status]').forEach(el=>{el.textContent=message;el.dataset.state=state;});
  document.querySelectorAll('[data-save-status]').forEach(el=>el.textContent=state==='saved'?' · salvo':state==='saving'?' · salvando…':state==='pending'?' · não salvo':'');
  document.querySelectorAll('[data-save]').forEach(el=>{el.dataset.state=state;});
  document.querySelectorAll('[data-save-label]').forEach(el=>{el.textContent=SAVE_LABELS[state]||'Salvar';});
}
// Em conflito, o rascunho guarda a versão em que as edições se basearam: assim o conflito continua visível ao recarregar.
function backupLocal() { if(!character || readOnly()) return; try { localStorage.setItem(localKey(),JSON.stringify({data,version:conflict && draftVersion!=null ? draftVersion : character.version,pending,updatedAt:new Date().toISOString()})); } catch { setStatus('Não foi possível gravar o backup neste aparelho. Use Baixar backup.','offline'); } }
// Cópia no aparelho com folga de 1,5 s (gravar a cada tecla trava o celular); saindo da página ela é gravada na hora.
function scheduleBackup() { if(backupTimer) return; backupTimer=setTimeout(()=>{backupTimer=null;backupLocal();},1500); }
// Editar só marca a ficha como não salva. Ela vai para a nuvem no botão Salvar ou quando a página perde o foco
// (outra aba, outro app, tela bloqueada, saída) — nunca no meio da digitação.
function dirty() { if(readOnly()) return; pending=true;editCounter++;scheduleBackup();if(conflict) setStatus('Conflito: baixe seu backup e recarregue antes de continuar.','offline'); else setStatus('Alterações não salvas · toque em Salvar (salva sozinho ao sair da página)','pending'); }
async function saveData({keepalive=false}={}) {
  if(!character || readOnly()) return;
  if(conflict) { setStatus('Conflito: baixe seu backup e recarregue antes de continuar.','offline'); return false; }
  if(saving) { await saving; if(pending) return saveData({keepalive}); return true; }
  if(!pending) { setStatus(lastStatus.startsWith('saved|')?lastStatus.slice(6):'Ficha salva na nuvem.','saved'); return true; }
  clearTimeout(backupTimer);backupTimer=null;
  const currentEdit=editCounter;
  const snapshot=clone(data);
  backupLocal();setStatus('Salvando na nuvem…','saving');
  const small=keepalive && new Blob([JSON.stringify(snapshot)]).size<60000;
  saving=(async()=>{try { const result=await api('characters/'+character.id,'PUT',{data:snapshot,version:character.version},{keepalive:small}); character.version=result.version;pending=editCounter!==currentEdit;backupLocal();setStatus(pending?'Há alterações novas não salvas · toque em Salvar.':`Salvo na nuvem · ${new Date(result.updatedAt).toLocaleTimeString('pt-BR')}`,pending?'pending':'saved');return true; } catch(error) { if(error.status===409) conflict=true;setStatus(error.message+' · backup local preservado.','offline');return false;} })();
  const ok=await saving;saving=null;
  return ok;
}
function exportData() { const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=`personagem-${character.id}-${new Date().toISOString().slice(0,10)}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),5000); }
function updateCalculations() { document.querySelectorAll('[data-calc="rage-temp"]').forEach(el=>el.textContent=(Number(data.profile.level)||0)+(Number(data.stats.con)||0)); document.querySelectorAll('[data-barbarian]').forEach(el=>el.hidden=!/b[áa]rbaro/i.test(data.profile.className)); }
function bindField(el) {
  const path=el.dataset.bind || 'extra.'+el.dataset.saveKey;
  const value=getByPath(data,path) ?? '';
  if(el.type==='checkbox') el.checked=!!value;else if('value' in el) el.value=value;else el.textContent=value;
  if(el.dataset.wired) return;el.dataset.wired='1';
  // A cada tecla: grava na ficha viva, copia para os outros campos do mesmo caminho (busca direta, não a página toda) e marca.
  el.addEventListener('input',()=>{const next=el.type==='checkbox'?el.checked:el.value;setByPath(data,path,next);if(el.dataset.bind)document.querySelectorAll(`[data-bind="${CSS.escape(path)}"]`).forEach(other=>{if(other===el)return;if(other.type==='checkbox') other.checked=!!next;else if('value' in other) other.value=next;else other.textContent=next;});if(/^(profile|stats)\./.test(path))updateCalculations();dirty();});
}
// [data-free] fica livre até na visão do mestre (ex.: o campo de pesquisa de regras).
function bindAll(root=document) { root.querySelectorAll('[data-bind],[data-save-key]').forEach(bindField); if(readOnly()) root.querySelectorAll('input:not([data-free]),textarea:not([data-free]),select:not([data-free]),[data-mutate]').forEach(el=>el.disabled=true); }
function refMarkup(path,ref={}) {
  ref ||= {};
  const book=books.find(book=>book.id===ref.book);
  const valid=book && Number(ref.page)>=1 && Number(ref.page)<=book.pages;
  return `<div class="reference-controls"><label>Livro<select aria-label="Livro da referência" data-bind="${path}.book"><option value="">Sem livro</option>${books.map(book=>`<option value="${book.id}">${book.name}</option>`).join('')}</select></label><label>Pág. impressa<input type="number" min="1" max="469" aria-label="Página impressa" data-bind="${path}.page"></label><a class="btn small ${valid?'':'disabled-link'}" ${valid?`href="livro.html?book=${encodeURIComponent(ref.book)}&page=${Number(ref.page)}" target="_blank" rel="noopener"`:'aria-disabled="true"'}>Abrir página ↗</a></div>`;
}
function wireRefs(root) {
  root.querySelectorAll('.reference-controls').forEach(group=>{
    const select=group.querySelector('select'), page=group.querySelector('input'), link=group.querySelector('a');
    const update=()=>{const book=books.find(item=>item.id===select.value),n=Number(page.value);page.max=book?.pages || 469;const valid=book&&Number.isInteger(n)&&n>=1&&n<=book.pages;link.classList.toggle('disabled-link',!valid);if(valid) {link.href=`livro.html?book=${book.id}&page=${n}`;link.target='_blank';link.rel='noopener';link.removeAttribute('aria-disabled');}else{link.removeAttribute('href');link.setAttribute('aria-disabled','true');}};
    select.addEventListener('change',update);page.addEventListener('input',update);update();
  });
}
function augmentFieldReferences() {
  document.querySelectorAll('input[data-bind^="feats."]').forEach(input=>{const key=input.dataset.bind.replace('.','_');if(!data.fieldReferences[key]){const match=String(getByPath(data,input.dataset.bind)||'').match(/Livro\s*(1|2).*?p\.\s*(\d+)/i);if(match)data.fieldReferences[key]={book:'livro'+match[1],page:match[2]};}const box=document.createElement('div');box.innerHTML=refMarkup('fieldReferences.'+key,data.fieldReferences[key]);const label=input.closest('label');if(label){const wrapper=document.createElement('div');wrapper.className='field';label.replaceWith(wrapper);wrapper.append(label,box);}else input.after(box);});
}
function renderSkills() {
  const root=document.querySelector('[data-skills]');if(!root)return;
  root.innerHTML=Object.entries(skillInfo).map(([key,[name,description]])=>`<article class="skill-card"><div class="skill-main"><div><strong>${name}</strong><small>Valor total editável</small></div><input aria-label="Valor de ${name}" data-bind="skills.${key}"></div><button type="button" class="info-button" data-explain="${key}">Explicar</button><details><summary>Referência no livro</summary>${refMarkup('fieldReferences.skill_'+key,data.fieldReferences['skill_'+key])}</details></article>`).join('');
  root.querySelectorAll('[data-explain]').forEach(button=>button.addEventListener('click',()=>openHelp(...skillInfo[button.dataset.explain])));
}
function renderAbilities() {
  const root=document.querySelector('[data-abilities]');if(!root)return;
  root.innerHTML=Object.entries(data.abilities).map(([key,item])=>`<article class="ability-card"><div class="ability-title"><input aria-label="Nome da habilidade" data-bind="abilities.${key}.name"><button class="info-button" data-remove-ability="${key}" data-mutate>Remover</button></div><label>Descrição / efeito<textarea data-bind="abilities.${key}.effect"></textarea></label><label>Fonte / observação<input data-bind="abilities.${key}.source"></label>${refMarkup('abilities.'+key+'.reference',item.reference)}</article>`).join('');
  root.querySelectorAll('[data-remove-ability]').forEach(button=>button.addEventListener('click',()=>{if(confirm('Remover esta habilidade?')){delete data.abilities[button.dataset.removeAbility];dirty();renderDynamic();}}));
}
function renderAttacks() {
  const root=document.querySelector('[data-attacks]');if(!root)return;
  root.innerHTML=data.attacks.map((item,i)=>`<article class="attack-card"><div class="form-grid">${[['name','Arma / ataque'],['bonus','Bônus'],['damage','Dano'],['traits','Traços'],['notes','Observações']].map(([key,label])=>`<label class="field">${label}<input data-bind="attacks.${i}.${key}"></label>`).join('')}</div>${refMarkup('attacks.'+i+'.reference',item.reference)}<button class="info-button" data-remove-attack="${i}" data-mutate>Remover arma</button></article>`).join('');
  root.querySelectorAll('[data-remove-attack]').forEach(button=>button.addEventListener('click',()=>{if(confirm('Remover esta arma?')){data.attacks.splice(Number(button.dataset.removeAttack),1);dirty();renderDynamic();}}));
}
function renderReferences() {
  const root=document.querySelector('[data-references]');if(!root)return;
  root.innerHTML=data.references.map((ref,i)=>`<article class="ability-card"><div class="form-grid"><label>Título<input data-bind="references.${i}.title"></label><label>Categoria<input data-bind="references.${i}.category" placeholder="classe, talento, ação…"></label></div><label>Notas<textarea data-bind="references.${i}.notes"></textarea></label>${refMarkup('references.'+i,ref)}<button class="info-button" data-remove-ref="${i}" data-mutate>Remover referência</button></article>`).join('');
  root.querySelectorAll('[data-remove-ref]').forEach(button=>button.addEventListener('click',()=>{data.references.splice(Number(button.dataset.removeRef),1);dirty();renderDynamic();}));
}
function renderDynamic() {renderSkills();renderAbilities();renderAttacks();renderReferences();bindAll();wireRefs(document);document.dispatchEvent(new CustomEvent('mesa:listas'));}
function openHelp(title,description) {const dialog=document.querySelector('#help-modal');if(!dialog){alert(title+'\n\n'+description);return;}dialog.querySelector('[data-help-title]').textContent=title;dialog.querySelector('[data-help-body]').textContent=description;dialog.showModal();}
function addControls() {
  for(const [selector,text,callback] of [['[data-abilities]','+ Adicionar habilidade',()=>{data.abilities['a_'+crypto.randomUUID().replaceAll('-','')]={name:'Nova habilidade',effect:'',source:'',reference:{}};}],['[data-attacks]','+ Adicionar arma',()=>data.attacks.push({name:'',bonus:'',damage:'',traits:'',notes:'',reference:{}})],['[data-references]','+ Adicionar referência',()=>data.references.push({title:'',category:'',notes:'',book:'',page:''})]]) {
    const root=document.querySelector(selector);if(!root)continue;const button=document.createElement('button');button.className='btn section-space';button.textContent=text;button.dataset.mutate='1';button.disabled=readOnly();button.addEventListener('click',()=>{callback();dirty();renderDynamic();});root.after(button);
  }
}
function migrateReferences() {
  for(const item of Object.values(data.abilities)) {if(item.reference)continue;const match=item.source?.match(/Livro\s*(1|2).*?p\.\s*(\d+)/i);if(match)item.reference={book:'livro'+match[1],page:match[2]};}
}
async function initCharacter() {
  const records=(await api('characters')).characters;
  if(!selectedId) selectedId=records.find(item=>item.owned)?.id;
  if(!selectedId) {location.replace('mesa.html');return;}
  character=await api('characters/'+encodeURIComponent(selectedId));
  data=merge(clone(DEFAULTS),character.data);migrateReferences();
  // Nunca misturar dados de contas/personagens nem substituir nuvem automaticamente.
  const draft=localStorage.getItem(localKey());
  // Rascunho igual ao que está na nuvem (o salvamento da saída chegou, mas a página fechou antes de ver a resposta): apaga sem perguntar.
  if(draft && !readOnly()) {try {const parsed=JSON.parse(draft);if(parsed.pending && JSON.stringify(merge(clone(DEFAULTS),parsed.data))===JSON.stringify(data)) localStorage.removeItem(localKey());else if(parsed.pending && confirm('Há alterações locais não enviadas desta ficha. Restaurar para revisar?')) {data=merge(clone(DEFAULTS),parsed.data);pending=true;conflict=parsed.version!==character.version;if(conflict)draftVersion=parsed.version;}}catch{}}
  document.title=(data.profile.name || 'Personagem')+' · Mesa Pathfinder';
  // Ficha, Combate e Pesquisa são abas da própria página do personagem; o menu leva ao resto da mesa.
  document.querySelectorAll('.topbar nav').forEach(nav=>{nav.innerHTML='<a href="mesa.html">Mesa</a><a href="grupo.html">Grupo</a><a href="livro.html">Livros</a><a href="busca.html">Buscar</a>';});
  augmentFieldReferences();renderDynamic();addControls();updateCalculations();
  document.querySelectorAll('[data-save]').forEach(button=>{button.disabled=readOnly();button.addEventListener('click',()=>saveData());});
  document.querySelectorAll('[data-reset]').forEach(button=>{button.hidden=true;});
  document.querySelectorAll('[data-export]').forEach(button=>button.addEventListener('click',exportData));
  document.querySelectorAll('[data-import]').forEach(input=>input.addEventListener('change',async()=>{if(readOnly())return;try {const parsed=JSON.parse(await input.files[0].text());if(!parsed.profile || typeof parsed.profile.name!=='string')throw new Error('Backup inválido.');if(!confirm('Substituir os campos desta ficha pelo backup?'))return;data=merge(clone(DEFAULTS),parsed);dirty();if(await saveData())location.reload();}catch(error){alert(error.message);}input.value='';}));
  document.querySelectorAll('[data-help]').forEach(button=>button.addEventListener('click',()=>openHelp(...skillInfo[button.dataset.help])));
  document.querySelectorAll('[data-now]').forEach(el=>el.textContent=new Date().toLocaleDateString('pt-BR'));
  setStatus(readOnly()?'Visão do mestre · somente leitura':pending?'Backup local restaurado · revise e toque em Salvar':'Ficha carregada · salva no botão Salvar ou ao sair da página',readOnly()?'':pending?'pending':'saved');
  document.querySelectorAll('.topbar nav a').forEach(link=>link.addEventListener('click',async event=>{if(!pending)return;event.preventDefault();const ok=await saveData();if(ok || confirm('Ainda há alterações não salvas na nuvem. Sair mesmo assim?'))location.href=link.href;}));
  window.addEventListener('beforeunload',event=>{if(pending){backupLocal();event.preventDefault();event.returnValue='';}});
  // Salvamento automático só quando a página perde o foco: outra aba, outro app, tela bloqueada ou saída da página.
  const autoSave=()=>{if(pending && !conflict && !readOnly()){backupLocal();saveData({keepalive:true});}};
  window.addEventListener('blur',autoSave);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)autoSave();});
  window.addEventListener('pagehide',()=>{if(pending && !conflict && !readOnly()){backupLocal();saveData({keepalive:true});}});
  window.addEventListener('online',()=>{if(pending&&!conflict)saveData();});
  document.dispatchEvent(new CustomEvent('mesa:ficha'));
}
async function createCharacter(form) {
  const values=new FormData(form),next=clone(DEFAULTS);
  next.profile.name=String(values.get('name')).trim();next.profile.player=String(values.get('player')||'');next.profile.className=String(values.get('className')||'');next.profile.ancestry=String(values.get('ancestry')||'');next.sheetVersion='2';
  const result=await api('characters','POST',{data:next});location.href='sessao.html?character='+encodeURIComponent(result.id)+'#ficha';
}
async function refreshMembers() {
  const root=document.querySelector('[data-members]');if(!root || !session.user.admin)return;
  const result=await api('members');
  root.innerHTML=result.members.map(member=>`<article class="member-row"><div><strong>${escapeAttr(member.email)}</strong><small>${member.active?(member.accepted?'Entrou na mesa':ownServer()?'Cadastrado · ainda não entrou':'Cadastrado · acesso privado do Site necessário'):'Acesso revogado'}</small>${accessCodes()&&member.active&&member.email!==session.user.email?`<button type="button" class="info-button section-space" data-new-code="${escapeAttr(member.email)}">Novo link de acesso</button>`:''}${emailLogin()&&member.active&&member.email!==session.user.email?`<button type="button" class="info-button section-space" data-email-link="${escapeAttr(member.email)}">Link de entrada</button>`:''}</div><select aria-label="Papel de ${escapeAttr(member.email)}" data-role-email="${escapeAttr(member.email)}"><option value="player" ${member.role==='player'?'selected':''}>Jogador</option><option value="master" ${member.role==='master'?'selected':''}>Mestre</option></select><button class="btn" data-revoke="${escapeAttr(member.email)}" ${member.email===session.user.email?'disabled':''}>Revogar</button></article>`).join('');
  root.querySelectorAll('[data-role-email]').forEach(select=>select.addEventListener('change',async()=>{if(!confirm(`Alterar o papel de ${select.dataset.roleEmail} para ${select.value==='master'?'mestre (verá todas as fichas)':'jogador'}?`)){await refreshMembers();return;}try{await api('members','POST',{email:select.dataset.roleEmail,role:select.value});location.reload();}catch(error){alert(error.message);}}));
  root.querySelectorAll('[data-revoke]').forEach(button=>button.addEventListener('click',async()=>{if(!confirm('Revogar o acesso à mesa? As fichas serão mantidas.'))return;try{await api('members','DELETE',{email:button.dataset.revoke});await refreshMembers();}catch(error){alert(error.message);}}));
  root.querySelectorAll('[data-new-code]').forEach(button=>button.addEventListener('click',async()=>{if(!confirm(`Gerar um novo link de acesso para ${button.dataset.newCode}? O link antigo e os aparelhos conectados deixam de funcionar.`))return;try{await showAccess(button.dataset.newCode);document.querySelector('[data-invite-result]').scrollIntoView({block:'center'});}catch(error){alert(error.message);}}));
  root.querySelectorAll('[data-email-link]').forEach(button=>button.addEventListener('click',()=>{showEmailLink(button.dataset.emailLink);document.querySelector('[data-invite-result]').scrollIntoView({block:'center'});}));
}
async function showAccess(email) {
  const access=await auth('code',{email});
  document.querySelector('[data-invite-result]').textContent=`Link de acesso de ${access.email} pronto. Mande só para essa pessoa: ele entra direto e vale como senha (código ${access.code}).`;
  document.querySelector('[data-invite-link]').value=access.link;
}
// Modo e-mail: o link leva o e-mail no fragmento (#nome@email.com) e a página de entrada entra sozinha com ele.
function showEmailLink(email) {
  document.querySelector('[data-invite-result]').textContent=`Link de entrada de ${email} pronto. Quem abrir entra direto como essa pessoa, sem senha: mande só para ela.`;
  document.querySelector('[data-invite-link]').value=new URL('/entrar.html#'+email,location.href).href;
}
async function initMesa() {
  document.querySelector('[data-account]').textContent=session.user.email;
  document.querySelector('[data-role]').textContent=(session.user.role==='master'?'Mestre':'Jogador')+(session.user.admin?' · administrador':'');
  const result=await api('characters'),root=document.querySelector('[data-characters]');
  document.querySelector('[data-list-title]').textContent=session.user.role==='master'?'Todos os personagens':'Meus personagens';
  root.innerHTML=result.characters.length?result.characters.map(item=>`<a class="character-card" href="sessao.html?character=${encodeURIComponent(item.id)}"><div class="eyebrow">${item.owned?'Seu personagem':'Visão do mestre · leitura'}</div><h3>${escapeAttr(item.name || 'Sem nome')}</h3><p>${escapeAttr(item.ancestry)} · ${escapeAttr(item.className || 'Classe a definir')} · Nível ${escapeAttr(item.level)}</p><small>${escapeAttr(item.ownerEmail)}</small><span class="card-arrow">Abrir ficha ↗</span></a>`).join(''):'<div class="note">Você ainda não criou um personagem. Comece pelo formulário abaixo.</div>';
  document.querySelector('[data-create]').addEventListener('submit',async event=>{event.preventDefault();const button=event.target.querySelector('button');button.disabled=true;try{await createCharacter(event.target);}catch(error){alert(error.message);button.disabled=false;}});
  const admin=document.querySelector('[data-admin]');admin.hidden=!session.user.admin;
  const logout=document.querySelector('[data-logout]');logout.hidden=!ownServer();logout.addEventListener('click',async()=>{try{await auth('logout');}finally{location.href='/entrar.html';}});
  if(session.user.admin){
    document.querySelector('[data-invite-link]').value=new URL('/mesa.html',location.href).href;
    if(accessCodes())document.querySelector('[data-invite-help]').innerHTML='1. Cadastre o e-mail e o papel abaixo.<br>2. Copie o link de acesso que aparece e mande só para essa pessoa: ele entra direto e vale como senha.<br>3. Perdeu o link? Gere um novo na lista abaixo; os aparelhos antigos saem da conta.';
    else if(emailLogin())document.querySelector('[data-invite-help]').innerHTML='1. Cadastre o e-mail e o papel abaixo.<br>2. Copie o link de entrada que aparece e mande para a pessoa: ela entra só com o e-mail, sem senha.<br>3. Quem souber o e-mail entra como a pessoa: use um e-mail que só a mesa conheça. Revogar corta o acesso na hora.';
    await refreshMembers();
    document.querySelector('[data-invite]').addEventListener('submit',async event=>{event.preventDefault();const form=new FormData(event.target);try{const result=await api('members','POST',{email:form.get('email'),role:form.get('role')});if(accessCodes())await showAccess(result.email);else if(emailLogin())showEmailLink(result.email);else{document.querySelector('[data-invite-result]').textContent=`${result.email} cadastrado. Agora libere esse e-mail em Compartilhar no Site e envie o link abaixo. Este cadastro não envia e-mail automaticamente.`;document.querySelector('[data-invite-link]').value=result.link;}await refreshMembers();event.target.reset();}catch(error){alert(error.message);}});
  }
  document.querySelector('[data-copy-link]').addEventListener('click',async()=>{const input=document.querySelector('[data-invite-link]');try{await navigator.clipboard.writeText(input.value);document.querySelector('[data-invite-result]').textContent=ownServer()?'Link copiado. Mande só para a pessoa convidada.':'Link copiado. O convidado precisa entrar com o e-mail cadastrado e ter acesso privado ao Site.';}catch{input.select();}});
  const old=localStorage.getItem('ficha-anao-barbaro-v2')||localStorage.getItem('ficha-anao-barbaro-local-backup');
  const recover=document.querySelector('[data-recover-old]');recover.hidden=!(old&&session.user.admin);recover.addEventListener('click',async()=>{try{const oldData=JSON.parse(old);if(!confirm('Criar uma cópia separada da ficha antiga deste navegador? Nenhum personagem existente será substituído.'))return;for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key?.startsWith('ficha-anao-barbaro-field-')){oldData.extra ||= {};oldData.extra[key.replace('ficha-anao-barbaro-field-','')]=localStorage.getItem(key);}}const result=await api('characters','POST',{data:oldData});location.href='sessao.html?character='+encodeURIComponent(result.id)+'#ficha';}catch(error){alert(error.message);}});
}
async function init() {
  document.querySelectorAll('main input,main textarea,main select,main button').forEach(el=>el.disabled=true);
  try {session=await api('session');books=session.books;document.querySelectorAll('main input,main textarea,main select,main button').forEach(el=>el.disabled=false);if(isMesa)await initMesa();else await initCharacter();}
  catch(error){const main=document.querySelector('main');main.replaceChildren();const section=document.createElement('section');section.className='panel';const title=document.createElement('h1');title.textContent='Acesso à mesa';const message=document.createElement('p');message.textContent=error.message;const login=document.createElement('a');login.className='btn primary';login.href='/signin-with-chatgpt?return_to='+encodeURIComponent(location.pathname+location.search);login.target='_top';login.textContent='Entrar';section.append(title,message,login);main.append(section);}
}
// Ponte para os scripts das páginas novas (sessao.js): mesma ficha, salvamento automático, backup local e conflito.
window.Mesa={get session(){return session;},get character(){return character;},get data(){return data;},get books(){return books;},get conflict(){return conflict;},api,dirty,saveData,bindAll,readOnly,escapeAttr,openHelp,skillInfo,updateCalculations};
document.addEventListener('DOMContentLoaded',init);
// Ctrl+K abre a busca de regras a partir de qualquer página da ficha/mesa.
document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();const selection=String(window.getSelection()||'').trim();location.href='busca.html'+(selection?'?q='+encodeURIComponent(selection):'');}});
