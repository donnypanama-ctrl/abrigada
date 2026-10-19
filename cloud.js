/* La Brigada · nube (Supabase)
   Las páginas siguen trabajando con localStorage como siempre; este archivo:
   - pide usuario y contraseña (oficina / técnico) antes de usar la app,
   - sube a la nube lo que la oficina guarda y baja lo que hay en la nube,
   - al técnico le enseña solo sus avisos y entrega su albarán a la oficina.
   Sin configuración (URL y clave vacías) no hace nada y la app funciona como antes. */
(function(){
  const CFG=/*CONFIG*/{"url": "https://ilhfppvpwtqthlxtovhv.supabase.co", "key": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlsaGZwcHZwd3RxdGhseHRvdmh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIwMDc2NDcsImV4cCI6MjEwNzU4MzY0N30.3lOtZzcKuvIURnqN5bvOwYL6MRdJVdfXGicS_UOUn3Y"}/*END*/;
  if(!CFG.url||!CFG.key)return;

  // Netlify puede servir /panel en vez de /panel.html: se normaliza a «panel.html»
  const PAGE=(decodeURIComponent(location.pathname.split('/').pop()||'').replace(/\.html$/,'')||'index')+'.html';
  const LIST='lbav-list';
  // Datos de la oficina que viajan a la nube (los borradores se quedan en cada aparato)
  const DATOS=['lbav-settings','lbav-seq','lb2-hist','lb2-cat','lb2-brand','lb2-seq','lb-gest','lb-gest-seq','lb-panel-pay'];
  const OF=r=>r==='oficina'||r==='gerente'; // gerente = oficina + caja y usuarios
  const SYNCED='lbc-synced',OUTBOX='lbc-outbox',ME='lbc-me';
  const DOM='@labrigada.app';

  // ---------- localStorage con aviso de cambios ----------
  const LS=window.localStorage,rawSet=Storage.prototype.setItem,rawDel=Storage.prototype.removeItem;
  let applying=false;const dirty=new Set();let pushT=null;
  const lsGet=k=>{try{const v=LS.getItem(k);return v?JSON.parse(v):null}catch(e){return null}};
  const lsSet=(k,v)=>{applying=true;try{v==null?rawDel.call(LS,k):rawSet.call(LS,k,JSON.stringify(v))}catch(e){}finally{applying=false}};
  function watch(k){if(applying)return;if(k===LIST||DATOS.includes(k)){dirty.add(k);schedulePush()}}
  Storage.prototype.setItem=function(k,v){rawSet.call(this,k,v);if(this===LS)watch(k)};
  Storage.prototype.removeItem=function(k){rawDel.call(this,k);if(this===LS)watch(k)};
  // Huella sin depender del orden de las claves (la nube las devuelve reordenadas)
  const canon=v=>Array.isArray(v)?'['+v.map(canon).join(',')+']':(v&&typeof v==='object')?'{'+Object.keys(v).sort().filter(k=>v[k]!==undefined).map(k=>JSON.stringify(k)+':'+canon(v[k])).join(',')+'}':JSON.stringify(v===undefined?null:v);
  const H=o=>{const s=canon(o);let h=0;for(let i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))|0;return h+':'+s.length};

  // ---------- Interfaz: estilos, entrada, barra de usuario ----------
  const css=`
#lbc-gate{position:fixed;inset:0;z-index:50;background:#12161c;color:#f4f1ea;display:flex;align-items:center;justify-content:center;padding:16px;font-family:Barlow,system-ui,sans-serif;overflow:auto}
#lbc-gate .box{width:100%;max-width:380px}
#lbc-gate h1{font-family:"Barlow Condensed","Arial Narrow",sans-serif;font-weight:800;font-size:34px;text-transform:uppercase;margin:12px 0 2px;line-height:1}
#lbc-gate h1 em{font-style:normal;color:#ff5a1f}
#lbc-gate p{color:#b9c0c8;margin:6px 0 16px;font-size:15px}
#lbc-gate label{display:flex;flex-direction:column;gap:4px;font-size:13px;color:#b9c0c8;margin-bottom:10px}
#lbc-gate input{font:inherit;font-size:17px;padding:11px 12px;border-radius:6px;border:1px solid #2e3540;background:#1b2028;color:#f4f1ea}
#lbc-gate button{font:inherit;font-weight:700;font-size:16px;width:100%;padding:13px;border-radius:6px;border:0;background:#ff5a1f;color:#12161c;cursor:pointer;margin-top:4px}
#lbc-gate button.alt{background:none;color:#5ec4f0;font-weight:600;font-size:14.5px}
#lbc-gate .err{color:#f2867f;font-size:14px;min-height:1.2em;margin:4px 0}
#lbc-gate .stripe{height:6px;background:linear-gradient(#ff5a1f 0 50%,#5ec4f0 50% 100%);border-radius:3px;width:64px}
#lbc-bar{display:flex;gap:10px;align-items:center;justify-content:flex-end;flex-wrap:wrap;font-size:13px;color:var(--muted,#5b636d);max-width:1040px;margin:8px auto -6px;padding:0 16px;font-family:Barlow,system-ui,sans-serif}
#lbc-bar b{color:var(--fg,#12161c)}
#lbc-bar .dot{width:8px;height:8px;border-radius:50%;background:#1f7a4a;display:inline-block;margin-right:4px}
#lbc-bar .dot.off{background:#c2410c}
#lbc-bar button{font:inherit;font-size:13px;background:none;border:1px solid var(--line,#dcd8cf);border-radius:5px;padding:3px 9px;color:inherit;cursor:pointer}
#lbc-new{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(env(safe-area-inset-bottom,0px) + 70px);z-index:30;background:#12161c;color:#f4f1ea;border-left:4px solid #5ec4f0;border-radius:5px;padding:10px 14px;font:600 14px Barlow,system-ui,sans-serif;display:flex;gap:10px;align-items:center;max-width:calc(100% - 32px)}
#lbc-new button{font:inherit;background:#5ec4f0;color:#12161c;border:0;border-radius:4px;padding:6px 10px;cursor:pointer}
body.rol-tec nav.tabs [data-p="p-aviso"],body.rol-tec nav.tabs [data-p="p-recibir"],body.rol-tec nav.tabs [data-p="p-lista"],body.rol-tec nav.tabs a,body.rol-tec ol.flow{display:none!important}
#lbc-mis .lrow{cursor:pointer}
#lbc-cob .owe{font-family:var(--display,inherit);font-size:30px;font-weight:800;font-variant-numeric:tabular-nums}
#lbc-cob .pg{border:1px solid var(--line,#dcd8cf);border-radius:8px;padding:10px 12px;margin-top:10px}
#lbc-cob .pg.wait{border-color:#ff5a1f;background:rgba(255,90,31,.08)}
#lbc-cob canvas{display:block;width:100%;height:150px;background:#fff;border:1px dashed #8c96a3;border-radius:6px;touch-action:none;margin:8px 0}
#lbc-cob .pg .row{display:flex;gap:8px;flex-wrap:wrap}
#lbc-cob .ok{color:#1f8a4c;font-weight:600}
#lbc-mis .lrow:hover{background:var(--field,#faf8f4)}
.lbc-users .u{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr) minmax(0,1fr) auto;gap:6px;align-items:end;padding:8px 0;border-bottom:1px solid var(--line,#dcd8cf)}
.lbc-users .u label{display:flex;flex-direction:column;gap:2px;font-size:11.5px;color:var(--muted,#5b636d)}
.lbc-users input,.lbc-users select{font:inherit;font-size:15px;padding:6px 8px;border-radius:5px;border:1px solid var(--line,#dcd8cf);background:var(--field,#faf8f4);color:var(--fg,#12161c);min-width:0;width:100%}
.lbc-users .who b{display:block}.lbc-users .who small{color:var(--muted,#5b636d)}
@media (max-width:640px){.lbc-users .u{grid-template-columns:1fr 1fr}.lbc-users .who{grid-column:1/-1}}
.lbc-tecs{display:flex;flex-wrap:wrap;gap:8px;margin:2px 0 12px}
.lbc-tecs .h{width:100%;font-size:12.5px;color:var(--muted,#5b636d)}
.lbc-tec{font:inherit;text-align:left;border:1px solid var(--line,#dcd8cf);background:var(--field,#faf8f4);color:var(--fg,#12161c);border-radius:8px;padding:8px 12px;cursor:pointer;min-width:150px;line-height:1.25}
.lbc-tec b{display:block;font-size:15.5px}.lbc-tec small{display:block;font-size:12.5px;color:var(--muted,#5b636d)}
.lbc-tec .ap{color:#1f7a4a;font-weight:600}.lbc-tec .na{color:#b45309}
.lbc-tec[aria-pressed="true"]{border:2px solid #ff5a1f;padding:7px 11px}
.lbc-ph{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:8px;margin-top:8px}
.lbc-ph figure{position:relative;margin:0;aspect-ratio:1;border-radius:8px;overflow:hidden;background:#e9e6df}
.lbc-ph a{display:block;height:100%}.lbc-ph img{width:100%;height:100%;object-fit:cover;display:block}
.lbc-ph figure span{position:absolute;left:4px;bottom:4px;background:#ff5a1f;color:#fff;font-size:11px;padding:1px 6px;border-radius:4px}
.lbc-ph figure button{position:absolute;top:4px;right:4px;width:30px;height:30px;border-radius:50%;border:0;background:rgba(0,0,0,.6);color:#fff;font-size:18px;line-height:1;padding:0;cursor:pointer}
`;
  const st=document.createElement('style');st.textContent=css;document.head.appendChild(st);
  const LOGO='data:image/svg+xml;utf8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="#1b2028"/><g fill="none" stroke-width="10"><polyline points="22,44 50,22 78,44" stroke="#ff5a1f"/><polyline points="22,60 50,38 78,60" stroke="#f4f1ea"/><polyline points="22,76 50,54 78,76" stroke="#5ec4f0"/></g></svg>');
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const slug=u=>String(u||'').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9._-]+/g,'');
  const gate=document.createElement('div');gate.id='lbc-gate';
  function showGate(html){gate.innerHTML='<div class="box"><img src="'+LOGO+'" width="56" height="56" alt=""><h1><em>La</em> Brigada</h1><div class="stripe"></div>'+html+'</div>';if(!gate.isConnected)document.body.appendChild(gate)}
  const hideGate=()=>gate.remove();
  function toastNew(text,btn,fn){let el=document.getElementById('lbc-new');if(!el){el=document.createElement('div');el.id='lbc-new';document.body.appendChild(el)}
    el.innerHTML='<span></span>'+(btn?'<button type="button"></button>':'');el.firstChild.textContent=text;if(btn){el.lastChild.textContent=btn;el.lastChild.onclick=fn}
    clearTimeout(el._t);if(!btn)el._t=setTimeout(()=>el.remove(),3500)}

  // ---------- Cliente ----------
  if(!window.supabase&&!window.LB_CLOUD_MOCK){console.warn('supabase no cargó');return}
  const sb=window.LB_CLOUD_MOCK||window.supabase.createClient(CFG.url,CFG.key,{auth:{persistSession:true,autoRefreshToken:true,storageKey:'lbc-auth'}});
  let me=lsGet(ME),perfiles=[],online=true,pagos=[],loggingOut=false;
  // Si la sesión muere (caducada o cerrada en otro sitio), se pide entrar otra vez en vez de seguir sin datos
  const sesionCaida=()=>{if(loggingOut||document.getElementById('lbc-gate'))return;loginForm('Tu sesión se ha cerrado. Vuelve a entrar con tu usuario y contraseña.')};
  try{if(sb.auth.onAuthStateChange)sb.auth.onAuthStateChange(ev=>{if(ev==='SIGNED_OUT'&&me)sesionCaida()})}catch(e){}
  const rolDe=p=>{if(p&&p.rol==='oficina'&&p.gerente)p.rol='gerente';return p}; // en la nube: oficina + gerente=true

  function loginForm(msg){
    showGate('<p>Entra con tu usuario.</p><form id="lbc-in"><label>Usuario<input name="u" autocomplete="username" autocapitalize="none" required></label><label>Contraseña<input name="p" type="password" autocomplete="current-password" required></label><div class="err">'+esc(msg||'')+'</div><button>Entrar</button></form><button class="alt" id="lbc-go-up" type="button">Soy nuevo · crear usuario</button>');
    gate.querySelector('#lbc-go-up').onclick=signupForm;
    gate.querySelector('#lbc-in').onsubmit=async e=>{e.preventDefault();const f=e.target,b=f.querySelector('button'),er=f.querySelector('.err');b.disabled=true;er.textContent='';
      const{error}=await sb.auth.signInWithPassword({email:slug(f.u.value)+DOM,password:f.p.value});
      b.disabled=false;if(error){er.textContent=/invalid/i.test(error.message)?'Usuario o contraseña incorrectos.':'No se pudo entrar: '+error.message;return}
      start(true)};
  }
  function signupForm(){
    showGate('<p>Crea tu usuario. Después la oficina te da de alta.</p><form id="lbc-up"><label>Tu nombre (como sale en los avisos)<input name="n" required></label><label>Usuario (sin espacios)<input name="u" autocomplete="username" autocapitalize="none" required></label><label>Contraseña (mínimo 6)<input name="p" type="password" minlength="6" autocomplete="new-password" required></label><div class="err"></div><button>Crear usuario</button></form><button class="alt" type="button" id="lbc-go-in">Ya tengo usuario · entrar</button>');
    gate.querySelector('#lbc-go-in').onclick=()=>loginForm();
    gate.querySelector('#lbc-up').onsubmit=async e=>{e.preventDefault();const f=e.target,b=f.querySelector('button'),er=f.querySelector('.err');
      const u=slug(f.u.value);if(u.length<3){er.textContent='El usuario necesita al menos 3 letras o números.';return}
      b.disabled=true;er.textContent='';
      const{data,error}=await sb.auth.signUp({email:u+DOM,password:f.p.value,options:{data:{nombre:f.n.value.trim()}}});
      b.disabled=false;
      if(error){er.textContent=/registered|exists/i.test(error.message)?'Ese usuario ya existe. Elige otro.':'No se pudo crear: '+error.message;return}
      if(!data.session){er.textContent='Usuario creado, pero la nube pide confirmar el correo. La oficina tiene que desactivar «Confirm email» en Supabase.';return}
      start(true)};
  }
  function waitForm(p){
    showGate('<p>Hola'+(p&&p.nombre?' '+esc(p.nombre):'')+'. Tu usuario <b>'+esc(p?p.usuario:'')+'</b> está '+(p&&p.rol==='baja'?'dado de baja':'pendiente de alta')+'.</p><p>Pide a la oficina que te dé de alta en el Panel → Usuarios, y luego toca «Ya me han dado de alta».</p><button id="lbc-retry">Ya me han dado de alta</button><button class="alt" id="lbc-out">Salir</button>');
    gate.querySelector('#lbc-retry').onclick=()=>start(true);gate.querySelector('#lbc-out').onclick=logout;
  }
  async function logout(){loggingOut=true;try{await sb.auth.signOut({scope:'local'})}catch(e){} // solo este aparato: los demás siguen dentro
    // Al salir se borra lo guardado en este aparato para que otro usuario no lo vea
    [LIST,...DATOS,SYNCED,ME,OUTBOX,'lbav-mios','lbav-tdraft','lbav-draft','lb2-draft'].forEach(k=>{applying=true;try{rawDel.call(LS,k)}finally{applying=false}});
    location.reload()}

  function bar(){
    let el=document.getElementById('lbc-bar');
    if(!el){el=document.createElement('div');el.id='lbc-bar';const s=document.querySelector('.stripe');(s&&s.nextSibling)?s.parentNode.insertBefore(el,s.nextSibling):document.body.prepend(el)}
    el.innerHTML='<span><span class="dot'+(online?'':' off')+'"></span>'+(online?'En la nube':'Sin conexión · se guarda al volver')+'</span><span>'+(me.rol==='gerente'?'Gerente':me.rol==='oficina'?'Oficina':'Técnico')+' · <b>'+esc(me.nombre||me.usuario)+'</b></span><button type="button">Salir</button>';
    el.querySelector('button').onclick=()=>{if(confirm('¿Salir? Para volver a entrar necesitas tu usuario y contraseña.'))logout()};
  }

  // ---------- Arranque ----------
  async function start(fresh){
    let s=null;try{s=(await sb.auth.getSession()).data.session}catch(e){}
    if(!s){if(me){/* sin red pero ya entró antes: deja trabajar con lo guardado */online=false;if(OF(me.rol)||me.rol==='tecnico'){hideGate();route();bar();return}}loginForm();return}
    const{data,error}=await sb.from('perfiles').select('*').eq('id',s.user.id).maybeSingle();
    if(error&&me){online=false;hideGate();route();bar();return}
    const p=rolDe(data);if(!p||(!OF(p.rol)&&p.rol!=='tecnico')){waitForm(p);return}
    const changedUser=!me||me.id!==p.id;me=p;lsSet(ME,p);
    if(changedUser&&fresh===true&&lsGet(SYNCED)&&lsGet(SYNCED).user!==p.id)lsSet(SYNCED,null);
    hideGate();if(!route())return;bar();
    const changed=await sync();
    if(fresh===true&&changed&&PAGE!=='panel.html'){
      // como mucho una recarga automática por minuto, para que nunca entre en bucle
      let last=0;try{last=Number(sessionStorage.getItem('lbc-reload'))||0}catch(e){}
      if(Date.now()-last>60000){try{sessionStorage.setItem('lbc-reload',String(Date.now()))}catch(e){}location.reload();return}
    }
    setInterval(sync,30000);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync()});
    window.addEventListener('online',()=>sync());
  }
  // Técnicos: solo la pestaña Albarán. Oficina: todo.
  function route(){
    if(me.rol==='tecnico'){
      if(PAGE!=='index.html'&&PAGE!==''){location.replace('index.html#tecnico');return false}
      document.body.classList.add('rol-tec');
      const t=document.getElementById('tab-tecnico');if(t&&t.getAttribute('aria-selected')!=='true')t.click();
      misAvisosCard();outboxBtn();fotosCard();
    }
    if(OF(me.rol)){document.body.classList.add(me.rol==='gerente'?'rol-gerente':'rol-oficina');
      if(me.rol==='gerente'&&!DATOS.includes('lb-caja'))DATOS.push('lb-caja'); // la caja solo la ve y la toca el gerente
    }
    if(me.rol==='gerente'&&PAGE==='panel.html')usersCard();
    if(OF(me.rol)&&PAGE==='index.html')renderTecs();
    return true;
  }

  // ---------- Sincronización ----------
  let syncing=false;
  function schedulePush(){clearTimeout(pushT);pushT=setTimeout(()=>sync(),1200)}
  async function sync(){
    if(syncing||!me){return false}syncing=true;let changed=false;
    try{
      if(OF(me.rol)){await pushOficina();changed=await pullOficina()}
      else{await flushOutbox();changed=await pullTecnico()}
      online=true;
    }catch(e){online=false;console.warn('nube',e)}
    finally{syncing=false;bar()}
    if(changed){window.dispatchEvent(new CustomEvent('lb-cloud-change'));if(PAGE!=='panel.html'&&!document.getElementById('lbc-gate'))toastNew('Hay datos nuevos de la nube','Actualizar',()=>location.reload())}
    return changed;
  }
  const rowOf=it=>({n:it.a.n,aviso:it.a,estado:it.st||'sent',ts:it.ts||0});
  const itemHash=it=>H({a:it.a,b:it.b||null,st:it.st||'sent'});
  function tecId(it){const name=String((it.a.tec&&it.a.tec.n)||(it.b&&it.b.tec)||'').trim().toLowerCase();if(!name)return null;
    const p=perfiles.find(x=>x.rol==='tecnico'&&(String(x.nombre).trim().toLowerCase()===name||String(x.usuario).toLowerCase()===slug(name)));return p?p.id:null}
  async function pushOficina(){
    if(!perfiles.length){const r=await sb.from('perfiles').select('*');if(r.error)throw r.error;perfiles=(r.data||[]).map(rolDe)}
    const syn=lsGet(SYNCED)||{user:me.id,rows:{},datos:{}};
    // Avisos nuevos o cambiados
    if(dirty.has(LIST)||!syn.full){
      const list=lsGet(LIST)||[],up=[],seen=new Set(),missing=new Set();
      list.forEach(it=>{if(!it||!it.a||!it.a.n)return;seen.add(it.a.n);const h=itemHash(it);if(syn.rows[it.a.n]===h)return;
        const row=rowOf(it);row.tecnico_id=tecId(it);if(!row.tecnico_id&&(it.a.tec&&it.a.tec.n))missing.add(it.a.tec.n);if(it.b)row.albaran=it.b;row.actualizado=new Date().toISOString();up.push([row,h])});
      for(let i=0;i<up.length;i+=50){const chunk=up.slice(i,i+50);const r=await sb.from('avisos').upsert(chunk.map(x=>x[0]),{onConflict:'n'});if(r.error)throw r.error;chunk.forEach(([row,h])=>syn.rows[row.n]=h)}
      const gone=Object.keys(syn.rows).filter(n=>!seen.has(n));
      if(gone.length&&syn.full){const r=await sb.from('avisos').delete().in('n',gone);if(r.error)throw r.error;gone.forEach(n=>delete syn.rows[n])}
      dirty.delete(LIST);
      if(missing.size)toastNew('Sin usuario en la app: '+[...missing].join(', ')+'. Dale de alta en Panel → Usuarios con ese mismo nombre.');
    }
    for(const k of DATOS){if(!dirty.has(k))continue;const v=lsGet(k);
      if(v!=null&&syn.datos[k]===H(v)){dirty.delete(k);continue}
      const r=v==null?await sb.from('datos').delete().eq('clave',k):await sb.from('datos').upsert({clave:k,valor:v,actualizado:new Date().toISOString()},{onConflict:'clave'});
      if(r.error)throw r.error;syn.datos[k]=H(v);dirty.delete(k)}
    lsSet(SYNCED,syn);
  }
  async function pullOficina(){
    const[ra,rd,rp]=await Promise.all([sb.from('avisos').select('*'),sb.from('datos').select('*'),sb.from('perfiles').select('*')]);
    if(ra.error)throw ra.error;if(rd.error)throw rd.error;if(!rp.error){if(!(rp.data||[]).some(x=>x.id===me.id)){sesionCaida();throw new Error('sin sesión')}perfiles=(rp.data||[]).map(rolDe)}
    const syn=lsGet(SYNCED)||{user:me.id,rows:{},datos:{}};let changed=false;
    // Avisos: la nube manda, salvo cambios de este aparato que aún no han subido
    const local=lsGet(LIST)||[],byN=new Map(local.filter(x=>x&&x.a).map(x=>[x.a.n,x])),out=[],srv=new Set();
    for(const row of ra.data||[]){srv.add(row.n);const cur=byN.get(row.n);
      const fromSrv={a:row.aviso,b:row.albaran||null,st:row.estado||'sent',ts:Number(row.ts)||0};
      const localChg=cur&&syn.rows[row.n]!==undefined&&itemHash(cur)!==syn.rows[row.n];
      if(localChg){
        // cambio local sin subir: se queda el local, pero si el técnico ya entregó el albarán se toma de la nube
        if(!cur.b&&fromSrv.b){cur.b=fromSrv.b;cur.st=fromSrv.st;changed=true;dirty.add(LIST)}
        out.push(cur);continue}
      if(!cur||itemHash(cur)!==itemHash(fromSrv))changed=true;
      out.push(cur?Object.assign(cur,fromSrv):fromSrv);syn.rows[row.n]=itemHash(fromSrv)}
    for(const it of local){if(!it||!it.a||srv.has(it.a.n))continue;
      if(syn.full&&syn.rows[it.a.n]!==undefined){delete syn.rows[it.a.n];changed=true;continue} // borrado en otro aparato
      out.push(it);dirty.add(LIST)} // nuevo en este aparato: se sube
    if(changed)lsSet(LIST,out);
    // Datos
    const dmap=new Map((rd.data||[]).map(r=>[r.clave,r.valor]));
    for(const k of DATOS){if(dirty.has(k))continue;
      if(dmap.has(k)){const v=dmap.get(k);if(H(v)!==H(lsGet(k))){lsSet(k,v);changed=true}syn.datos[k]=H(v)}
      else if(lsGet(k)!=null&&!syn.full){dirty.add(k)} // la nube aún no lo tiene: se sube
    }
    const first=!syn.full;syn.full=true;syn.user=me.id;lsSet(SYNCED,syn);
    if(first||dirty.size)schedulePush();
    const rg=await sb.from('pagos').select('*').order('creado',{ascending:false});
    if(!rg.error){const np=rg.data||[];if(H(np)!==H(pagos)){pagos=np;window.LBC_PAGOS=pagos;changed=true}}
    if(PAGE==='panel.html')renderUsers();
    if(PAGE==='index.html')renderTecs();
    return changed;
  }

  // ---------- Técnico ----------
  let mis=[];
  const b64u=s=>{const u=new TextEncoder().encode(s);let b='';for(let i=0;i<u.length;i+=0x8000)b+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000));return btoa(b).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')};
  async function pullTecnico(){
    const r=await sb.from('avisos').select('*').order('actualizado',{ascending:false});if(r.error)throw r.error;
    const before=H(mis);mis=r.data||[];
    // «Mis trabajos» se rehace con lo que hay en la nube (lo entregado), sin perder lo apuntado en el móvil
    const old=lsGet('lbav-mios')||[],m=new Map(old.map(x=>[x.n,x]));
    mis.filter(x=>x.albaran).forEach(x=>{const b=x.albaran,a=x.aviso||{},pc=Number(a.pc??50),mo=(b.mo!==undefined&&b.mo!==''&&b.mo!==null)?(Number(b.mo)||0):(Number(b.h)||0)*(Number(b.ph)||0),des=b.cd===false?0:(Number(b.pd)||0),mat=(b.m||[]).reduce((s,i)=>s+(Number(i.q)||0)*(Number(i.p)||0),0),base=mo+des;
      m.set(x.n,Object.assign(m.get(x.n)||{},{n:x.n,f:b.f||a.f,cl:(a.cl&&a.cl.n)||'',st:b.st,h:Number(b.h)||0,base,pc,pay:Math.round(base*pc)/100,ts:Number(x.ts)||Date.now()}))});
    const nv=[...m.values()];if(H(nv)!==H(old)){lsSet('lbav-mios',nv)}
    const rg=await sb.from('pagos').select('*').order('creado',{ascending:false});
    if(!rg.error)pagos=rg.data||[];
    renderMis();renderCob();
    return false; // el técnico no necesita recargar: la lista se pinta sola
  }
  function misAvisosCard(){
    const p=document.getElementById('p-tecnico');if(!p||document.getElementById('lbc-mis'))return;
    const c=document.createElement('section');c.className='card';c.id='lbc-mis';
    c.innerHTML='<h2>Mis avisos</h2><div id="lbc-mis-l"><p class="hint">Cargando…</p></div>';
    p.insertBefore(c,p.firstChild);
    const cb=document.createElement('section');cb.className='card';cb.id='lbc-cob';cb.innerHTML='<h2>Mis cobros</h2><div id="lbc-cob-l"><p class="hint">Cargando…</p></div>';
    c.after(cb);
    const load=document.getElementById('t-load');if(load){const h=load.querySelector('h2');if(h)h.textContent='¿Te llegó un aviso por WhatsApp? Pégalo aquí'}
  }
  function renderMis(){
    const box=document.getElementById('lbc-mis-l');if(!box)return;
    const pend=mis.filter(x=>!x.albaran),hech=mis.filter(x=>x.albaran).slice(0,5);
    const row=(x,done)=>'<div class="lrow" data-n="'+esc(x.n)+'"><div><b>'+esc(x.n)+'</b> '+(x.aviso&&x.aviso.pr==='urgente'?'<span class="chip urg">Urgente</span> ':'')+(done?'<span class="chip done">Entregado</span>':'<span class="chip sent">Por hacer</span>')+'<small>'+esc([(x.aviso.cl||{}).n,(x.aviso.cl||{}).d,(x.aviso.eq||{}).t].filter(Boolean).join(' · '))+'</small></div><span aria-hidden="true">›</span></div>';
    box.innerHTML=(pend.length?pend.map(x=>row(x,false)).join(''):'<p class="hint">No tienes avisos pendientes.</p>')+(hech.length?'<p class="hint" style="margin:10px 0 2px">Entregados hace poco</p>'+hech.map(x=>row(x,true)).join(''):'');
    box.querySelectorAll('.lrow').forEach(el=>el.onclick=()=>{const x=mis.find(y=>y.n===el.dataset.n);if(!x)return;
      if(x.albaran)try{rawSet.call(LS,'lbav-tdraft',JSON.stringify(Object.assign({},x.albaran,{a:x.aviso})))}catch(e){}
      location.hash='#a='+encodeURIComponent('LB0:'+b64u(JSON.stringify(x.aviso)));
      setTimeout(()=>{const f=document.getElementById('t-form');if(f)f.scrollIntoView({behavior:'smooth'})},300)});
  }
  // «Mis cobros»: lo que le deben (50 % de sus albaranes entregados − lo ya pagado) y firma de cada pago
  const eurN=n=>(Number(n)||0).toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2,useGrouping:'always'})+' €';
  const dmy=t=>{try{return new Date(t).toLocaleDateString('es-ES',{day:'numeric',month:'short'})}catch(e){return ''}};
  function renderCob(){
    const box=document.getElementById('lbc-cob-l');if(!box)return;
    if(box.querySelector('canvas[data-drawn]'))return; // no borrar una firma a medias
    const ganado=(lsGet('lbav-mios')||[]).filter(x=>mis.some(y=>y.n===x.n&&y.albaran)).reduce((s,x)=>s+(Number(x.pay)||0),0);
    const pagado=pagos.reduce((s,x)=>s+(Number(x.importe)||0),0),debe=Math.max(0,Math.round((ganado-pagado)*100)/100);
    const wait=pagos.filter(x=>!x.firmado),ok=pagos.filter(x=>x.firmado).slice(0,6);
    box.innerHTML='<small class="hint">Pendiente de cobrar</small><div class="owe">'+eurN(debe)+'</div><p class="hint">Tu parte de los albaranes entregados: '+eurN(ganado)+' · ya cobrado '+eurN(pagado)+'</p>'+
      wait.map(x=>'<div class="pg wait" data-id="'+esc(x.id)+'"><b>La oficina te ha pagado '+eurN(x.importe)+' '+(x.fp==='banco'?'por banco':'en efectivo')+'</b><small class="hint" style="display:block">'+esc(x.concepto||'')+' · '+dmy(x.creado)+'</small>'+
        '<p class="hint" style="margin-top:6px">Firma aquí para confirmar que lo has cobrado:</p><canvas width="600" height="200"></canvas><div class="row"><button type="button" class="primary" data-ok>Firmar y confirmar cobro</button><button type="button" data-clr>Borrar firma</button></div></div>').join('')+
      (ok.length?'<p class="hint" style="margin:12px 0 0">Cobros firmados</p>'+ok.map(x=>'<div class="lrow"><div><b>'+eurN(x.importe)+'</b> <span class="ok">Cobrado ✓</span><small>'+esc((x.fp==='banco'?'Banco':'Efectivo')+' · firmado el '+dmy(x.firmado)+(x.concepto?' · '+x.concepto:''))+'</small></div></div>').join(''):'');
    box.querySelectorAll('.pg.wait').forEach(el=>{
      const cv=el.querySelector('canvas'),cx=cv.getContext('2d'),st=[];let cur=null;
      cx.lineWidth=3.5;cx.lineCap='round';cx.lineJoin='round';cx.strokeStyle='#12161c';
      const pt=e=>{const r=cv.getBoundingClientRect();return[Math.round((e.clientX-r.left)*cv.width/r.width),Math.round((e.clientY-r.top)*cv.height/r.height)]};
      cv.addEventListener('pointerdown',e=>{e.preventDefault();cv.setPointerCapture(e.pointerId);const[x,y]=pt(e);cur=[x,y];st.push(cur);cv.dataset.drawn='1';cx.beginPath();cx.moveTo(x,y);cx.lineTo(x+.5,y);cx.stroke()});
      cv.addEventListener('pointermove',e=>{if(!cur)return;const[x,y]=pt(e);const l=cur.length;cx.beginPath();cx.moveTo(cur[l-2],cur[l-1]);cx.lineTo(x,y);cx.stroke();cur.push(x,y)});
      const end=()=>{cur=null};cv.addEventListener('pointerup',end);cv.addEventListener('pointercancel',end);
      el.querySelector('[data-clr]').onclick=()=>{st.length=0;cx.clearRect(0,0,cv.width,cv.height);delete cv.dataset.drawn};
      el.querySelector('[data-ok]').onclick=async b=>{if(!st.length){toastNew('Firma primero en el recuadro');return}
        const btn=el.querySelector('[data-ok]');btn.disabled=true;btn.textContent='Guardando…';
        const r=await sb.rpc('firmar_pago',{p_id:el.dataset.id,p_firma:st});
        if(r.error||r.data===false){btn.disabled=false;btn.textContent='Firmar y confirmar cobro';toastNew('No se pudo guardar la firma. Revisa la conexión.');return}
        const x=pagos.find(y=>y.id===el.dataset.id);if(x){x.firmado=new Date().toISOString();x.firma=st}
        delete cv.dataset.drawn;renderCob();toastNew('Cobro confirmado ✓');
      };
    });
  }
  // La oficina apunta un pago a un técnico desde el Panel → se le pide la firma en su móvil
  window.addEventListener('lb-pago',async e=>{
    if(!me||!OF(me.rol))return;const d=e.detail||{},name=String(d.tec||'').trim().toLowerCase();
    if(!perfiles.length){const r=await sb.from('perfiles').select('*');if(!r.error)perfiles=(r.data||[]).map(rolDe)}
    const p=perfiles.find(x=>x.rol==='tecnico'&&(String(x.nombre).trim().toLowerCase()===name||String(x.usuario).toLowerCase()===slug(name)));
    if(!p){toastNew(d.tec+' no tiene usuario en la app: el pago queda apuntado, pero no podrá firmarlo.');return}
    const r=await sb.from('pagos').insert({tecnico_id:p.id,tecnico:d.tec,importe:d.imp,fp:d.fp==='efectivo'?'efectivo':'banco',concepto:d.d||''}).select();
    if(r.error){toastNew('No se pudo enviar el pago para firmar: '+r.error.message);return}
    pagos=[...(r.data||[]),...pagos];window.LBC_PAGOS=pagos;window.dispatchEvent(new CustomEvent('lb-cloud-change'));
    toastNew('Enviado a '+d.tec+' para que firme el cobro');
  });

  // Entregar el albarán a la oficina por la nube (el WhatsApp sigue sirviendo de aviso)
  function outboxBtn(){
    const wa=document.getElementById('btn-wa-alb');if(!wa||document.getElementById('lbc-send'))return;
    const b=document.createElement('button');b.type='button';b.className='primary';b.id='lbc-send';b.textContent='Entregar albarán a la oficina';
    wa.parentNode.insertBefore(b,wa);wa.textContent='Avisar por WhatsApp';wa.classList.remove('primary');
    b.onclick=()=>entregar(b);
    ['btn-wa-alb','btn-copy-alb'].forEach(id=>{const e=document.getElementById(id);if(e)e.addEventListener('click',()=>setTimeout(()=>entregar(null,true),450))});
  }
  async function entregar(btn,quiet){
    await new Promise(r=>setTimeout(r,350)); // la app guarda el borrador con un pequeño retraso
    const B=lsGet('lbav-tdraft');if(!B||!B.a||!B.a.n){if(!quiet)toastNew('Carga primero un aviso.');return}
    if(!quiet&&!(await nFotos(B.a.n))){toastNew('Haz al menos una foto del trabajo antes de entregar el albarán.');const fc=document.getElementById('lbc-fotos');if(fc)fc.scrollIntoView({behavior:'smooth',block:'center'});return}
    if(!quiet&&!(B.sig&&B.sig.length)&&!confirm('Falta la firma del cliente. ¿Entregar igualmente?'))return;
    const alb=Object.assign({},B);delete alb.a;alb.a=B.a; // el albarán lleva su aviso, como en el enlace de WhatsApp
    const ob=lsGet(OUTBOX)||{};ob[B.a.n]=alb;lsSet(OUTBOX,ob);
    if(btn){btn.disabled=true;btn.textContent='Entregando…'}
    await flushFotos();const ok=await flushOutbox();
    if(btn){btn.disabled=false;btn.textContent='Entregar albarán a la oficina'}
    if(ok)toastNew('Albarán '+B.a.n+' entregado a la oficina ✓');
    else if(!quiet)toastNew('Sin conexión: se entregará solo cuando vuelva la cobertura.');
    pullTecnico().catch(()=>{});
  }
  async function flushOutbox(){
    const ob=lsGet(OUTBOX)||{};let ok=true;
    for(const n of Object.keys(ob)){
      try{const r=await sb.rpc('enviar_albaran',{p_n:n,p_albaran:ob[n]});
        if(r.error)throw r.error;
        if(r.data===false){ok=false;toastNew('El aviso '+n+' no está a tu nombre en la nube. Mándalo por WhatsApp.');}
        delete ob[n];
      }catch(e){ok=false;online=false;break}
    }
    lsSet(OUTBOX,ob);return ok;
  }


  // ---------- Fotos del trabajo: el técnico las hace en el albarán, la oficina las ve en el Panel ----------
  // Van a Storage (fotos/<nº aviso>/<id>.jpg). Primero a una cola en el móvil (IndexedDB) para no perderlas sin cobertura.
  const FB='fotos';let fotoN=null,fotoRemote=[];const objU=[];
  const curN=()=>{const B=lsGet('lbav-tdraft');return(B&&B.a&&B.a.n)||''};
  const fotoDB=()=>new Promise((res,rej)=>{const r=indexedDB.open('lbc-fotoq',1);r.onupgradeneeded=()=>r.result.createObjectStore('q',{keyPath:'id'});r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});
  async function qAll(){try{const d=await fotoDB();return await new Promise(r=>{const g=d.transaction('q').objectStore('q').getAll();g.onsuccess=()=>r(g.result||[]);g.onerror=()=>r([])})}catch(e){return[]}}
  async function qPut(o){const d=await fotoDB();return new Promise((r,j)=>{const t=d.transaction('q','readwrite');t.objectStore('q').put(o);t.oncomplete=r;t.onerror=()=>j(t.error)})}
  async function qDel(id){try{const d=await fotoDB();await new Promise(r=>{const t=d.transaction('q','readwrite');t.objectStore('q').delete(id);t.oncomplete=r;t.onerror=r})}catch(e){}}
  function shrink(file){return new Promise((res,rej)=>{const u=URL.createObjectURL(file),im=new Image();
    im.onload=()=>{const k=Math.min(1,1600/Math.max(im.width,im.height)),c=document.createElement('canvas');c.width=Math.round(im.width*k);c.height=Math.round(im.height*k);c.getContext('2d').drawImage(im,0,0,c.width,c.height);URL.revokeObjectURL(u);c.toBlob(b=>b?res(b):rej(new Error('foto')),'image/jpeg',.75)};
    im.onerror=()=>{URL.revokeObjectURL(u);rej(new Error('foto'))};im.src=u})}
  let flushing=null;
  function flushFotos(){if(flushing)return flushing;flushing=(async()=>{let ok=true;
    for(const o of await qAll()){try{const r=await sb.storage.from(FB).upload(o.n+'/'+o.id+'.jpg',o.blob,{contentType:'image/jpeg',upsert:false});
      if(r.error&&!/exist|duplicate/i.test(r.error.message||''))throw r.error;await qDel(o.id)}catch(e){ok=false;break}}
    return ok})().finally(()=>{flushing=null});return flushing}
  async function listFotos(n){const r=await sb.storage.from(FB).list(n,{limit:100,sortBy:{column:'name',order:'asc'}});if(r.error)throw r.error;
    const ps=(r.data||[]).filter(f=>/\.jpg$/i.test(f.name||'')).map(f=>n+'/'+f.name);if(!ps.length)return[];
    const s=await sb.storage.from(FB).createSignedUrls(ps,3600);if(s.error)throw s.error;return(s.data||[]).map((x,i)=>({p:ps[i],u:x.signedUrl})).filter(x=>x.u)}
  async function nFotos(n){let k=(await qAll()).filter(o=>o.n===n).length;try{k+=(await listFotos(n)).length}catch(e){k+=fotoRemote.length}return k}
  function fotosCard(){
    const sig=document.getElementById('sig'),sec=sig&&sig.closest('section');if(!sec||document.getElementById('lbc-fotos'))return;
    const c=document.createElement('section');c.className='card';c.id='lbc-fotos';
    c.innerHTML='<h2>Fotos del trabajo</h2><p class="hint">Haz fotos del equipo, de la avería y de la pieza que hay que cambiar. La oficina las ve con el albarán. Hace falta al menos una para entregarlo.</p><div class="ph"></div>'+
      '<input type="file" accept="image/*" capture="environment" hidden><input type="file" accept="image/*" multiple hidden>'+
      '<div class="bar" style="margin-top:10px"><button type="button" class="primary" data-cam>📷 Hacer foto</button><button type="button" data-gal>Elegir de la galería</button></div>';
    sec.parentNode.insertBefore(c,sec);
    const [cam,gal]=c.querySelectorAll('input');c.querySelector('[data-cam]').onclick=()=>cam.click();c.querySelector('[data-gal]').onclick=()=>gal.click();
    [cam,gal].forEach(i=>i.onchange=async()=>{const n=curN(),fs=[...i.files];i.value='';if(!n){toastNew('Carga primero un aviso.');return}
      for(const f of fs){try{await qPut({id:Date.now().toString(36)+Math.random().toString(36).slice(2,6),n,blob:await shrink(f)})}catch(e){toastNew('No se pudo leer la foto.')}}
      await drawFotos(false);const ok=await flushFotos();if(!ok)toastNew('Sin cobertura: las fotos se subirán solas cuando vuelva.');drawFotos(true)});
    setInterval(()=>{if(curN()!==fotoN)drawFotos(true)},1500);
    window.addEventListener('online',()=>flushFotos().then(()=>drawFotos(true)));
    drawFotos(true);flushFotos().then(()=>drawFotos(true));
  }
  async function drawFotos(refresh){
    const box=document.querySelector('#lbc-fotos .ph');if(!box)return;const n=curN();
    if(n!==fotoN){fotoN=n;fotoRemote=[];refresh=true}
    if(!n){box.innerHTML='<p class="hint">Carga un aviso para hacer fotos.</p>';return}
    if(refresh){try{fotoRemote=await listFotos(n)}catch(e){}}
    if(n!==fotoN)return;
    const q=(await qAll()).filter(o=>o.n===n);objU.splice(0).forEach(u=>URL.revokeObjectURL(u));
    const items=fotoRemote.map(x=>({u:x.u,p:x.p})).concat(q.map(o=>{const u=URL.createObjectURL(o.blob);objU.push(u);return{u,q:o.id}}));
    box.innerHTML=items.length?'<div class="lbc-ph">'+items.map(x=>'<figure><img src="'+esc(x.u)+'" alt="Foto del trabajo">'+(x.q?'<span>Sin subir</span>':'')+'<button type="button" aria-label="Quitar foto" data-p="'+esc(x.p||'')+'" data-q="'+esc(x.q||'')+'">×</button></figure>').join('')+'</div>':'<p class="hint"><b>Todavía no hay fotos.</b></p>';
    box.querySelectorAll('button').forEach(b=>b.onclick=async()=>{if(!confirm('¿Quitar esta foto?'))return;
      if(b.dataset.q)await qDel(b.dataset.q);else{const r=await sb.storage.from(FB).remove([b.dataset.p]);if(r.error){toastNew('No se pudo quitar la foto.');return}}drawFotos(true)});
  }
  // Panel → Albaranes: fotos del técnico (panel.html llama a LBC_fotos al abrir un albarán)
  window.LBC_fotos=async(el,n)=>{if(!el)return;
    try{const l=await listFotos(n);el.innerHTML=l.length?l.map(x=>'<figure><a href="'+esc(x.u)+'" target="_blank" rel="noopener"><img src="'+esc(x.u)+'" alt="Foto del técnico" loading="lazy"></a></figure>').join(''):'<p class="hint" style="grid-column:1/-1">El técnico no ha puesto fotos.</p>'}
    catch(e){el.innerHTML='<p class="hint" style="grid-column:1/-1">No se pudieron cargar las fotos (sin conexión).</p>'}};

  // ---------- Oficina: técnicos para elegir en el aviso ----------
  function tecList(){
    const st=lsGet('lbav-settings')||{},list=lsGet(LIST)||[],map=new Map();
    const key=n=>String(n||'').trim().toLowerCase();
    perfiles.filter(p=>p.rol==='tecnico').forEach(p=>{const n=String(p.nombre||p.usuario).trim();if(n)map.set(key(n),{n,t:p.tel||'',app:true})});
    (st.tecs||[]).forEach(t=>{const k=key(t.n);if(!k)return;const e=map.get(k);if(e){if(!e.t)e.t=t.t||''}else map.set(k,{n:String(t.n).trim(),t:t.t||'',app:false})});
    map.forEach((e,k)=>{e.pend=list.filter(x=>x&&x.a&&key(x.a.tec&&x.a.tec.n)===k&&!x.b).length});
    return[...map.values()].sort((a,b)=>(b.app-a.app)||a.n.localeCompare(b.n));
  }
  function renderTecs(){
    const inp=document.getElementById('a-tn');if(!inp)return;
    let box=document.getElementById('lbc-tecs');
    if(!box){box=document.createElement('div');box.id='lbc-tecs';box.className='lbc-tecs';const f=inp.closest('.fields');f.parentNode.insertBefore(box,f);
      inp.addEventListener('input',mark)}
    const l=tecList();
    box.innerHTML=l.length?'<span class="h">Elige el técnico (se rellena su WhatsApp)</span>':'';
    l.forEach(t=>{const b=document.createElement('button');b.type='button';b.className='lbc-tec';b.dataset.n=t.n;
      b.innerHTML='<b></b><small></small><small></small>';b.children[0].textContent=t.n;
      b.children[1].textContent=t.t?'📱 '+t.t:'📱 sin teléfono';
      b.children[2].innerHTML=(t.app?'<span class="ap">● Con la app</span>':'<span class="na">○ Sin usuario en la app</span>')+(t.pend?' · '+t.pend+' pendiente'+(t.pend>1?'s':''):'');
      b.onclick=()=>{const tt=document.getElementById('a-tt');inp.value=t.n;inp.dispatchEvent(new Event('input',{bubbles:true}));
        if(t.t&&tt){tt.value=t.t;tt.dispatchEvent(new Event('input',{bubbles:true}))}mark()};
      box.appendChild(b)});
    const dl=document.getElementById('dl-tec');if(dl)dl.innerHTML=l.map(t=>'<option value="'+esc(t.n)+'">').join('');
    mark();
  }
  function mark(){const v=String((document.getElementById('a-tn')||{}).value||'').trim().toLowerCase();
    document.querySelectorAll('#lbc-tecs .lbc-tec').forEach(b=>b.setAttribute('aria-pressed',b.dataset.n.toLowerCase()===v))}

  // ---------- Oficina: usuarios (en el Panel) ----------
  function usersCard(){
    const anchor=document.getElementById('sec-users');if(!anchor)return;anchor.hidden=false;renderUsers();
  }
  function renderUsers(){
    const box=document.getElementById('lbc-users');if(!box)return;
    const l=perfiles.slice().sort((a,b)=>(a.rol==='pendiente'?0:1)-(b.rol==='pendiente'?0:1)||String(a.nombre).localeCompare(String(b.nombre)));
    if(box.contains(document.activeElement))return; // no pisar lo que se está escribiendo
    box.innerHTML=l.map(p=>'<div class="u" data-id="'+esc(p.id)+'"><div class="who"><b>'+esc(p.nombre||p.usuario)+'</b><small>usuario: '+esc(p.usuario)+(p.id===me.id?' · tú':'')+'</small></div>'+
      '<label>Nombre en los avisos<input data-k="nombre" value="'+esc(p.nombre)+'"></label>'+
      '<label>Teléfono<input data-k="tel" inputmode="tel" value="'+esc(p.tel)+'"></label>'+
      '<label>Rol<select data-k="rol"'+(p.id===me.id?' disabled':'')+'>'+[['pendiente','Pendiente'],['tecnico','Técnico'],['oficina','Oficina'],['gerente','Gerente'],['baja','De baja']].map(([v,t])=>'<option value="'+v+'"'+(p.rol===v?' selected':'')+'>'+t+'</option>').join('')+'</select></label></div>').join('')||'<p class="hint">Nadie más todavía.</p>';
    box.querySelectorAll('[data-k]').forEach(inp=>inp.addEventListener('change',async()=>{
      const id=inp.closest('.u').dataset.id,patch={[inp.dataset.k]:inp.value.trim()};
      const dbp=inp.dataset.k==='rol'?(patch.rol==='gerente'?{rol:'oficina',gerente:true}:{rol:patch.rol,gerente:false}):patch;
      const r=await sb.from('perfiles').update(dbp).eq('id',id);
      if(r.error){toastNew('No se pudo guardar: '+r.error.message);return}
      const p=perfiles.find(x=>x.id===id);if(p)Object.assign(p,patch);
      // al dar de alta o renombrar a un técnico, se vuelven a asignar sus avisos
      const syn=lsGet(SYNCED);if(syn){syn.rows={};lsSet(SYNCED,syn)}dirty.add(LIST);schedulePush();
      toastNew('Guardado');
    }));
  }

  // Arranca cuando la página ya está pintada
  const go=()=>{if(!me)showGate('<p>Cargando…</p>');start(true)};
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',go):go();
  window.LBCloud={sync,get me(){return me}};
})();
