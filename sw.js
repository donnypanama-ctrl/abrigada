// Red primero: siempre la última versión; si no hay cobertura, la copia guardada.
const C='lb-v23';
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(C).then(c=>c.addAll(['./','index.html','panel.html','cotizaciones.html','supabase.js','cloud.js','manifest.webmanifest','icon-192.png','html2canvas.min.js','jspdf.umd.min.js','xlsx.mini.min.js'])))});
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==C).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET'||new URL(e.request.url).origin!==location.origin)return;
  e.respondWith(fetch(e.request.mode==='navigate'?new Request(e.request.url,{cache:'no-cache',credentials:'same-origin',redirect:'manual'}):new Request(e.request,{cache:'no-cache'})).then(r=>{if(r.ok&&new URL(e.request.url).origin===location.origin){const k=r.clone();caches.open(C).then(c=>c.put(e.request,k))}return r}).catch(()=>{const u=new URL(e.request.url),h=u.pathname.endsWith('/')||/\.[a-z0-9]+$/i.test(u.pathname)?null:u.pathname+'.html';return caches.match(e.request,{ignoreSearch:true}).then(m=>m||(h&&caches.match(h))).then(m=>m||caches.match('index.html')).then(m=>m&&m.redirected?m.blob().then(b=>new Response(b,{headers:m.headers})):m)}));
});
