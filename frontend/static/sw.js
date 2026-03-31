const CACHE = 'lldash-v3';
const STATIC = ['/','/static/css/app.css','/static/js/api.js','/static/js/app.js',
  '/static/js/pages/dashboard.js','/static/js/pages/schedule.js','/static/js/pages/rankings.js',
  '/static/js/pages/scouting.js','/static/js/pages/alliance.js','/static/js/pages/simulator.js',
  '/static/js/pages/hub.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(STATIC)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.pathname.startsWith('/api')||url.pathname.startsWith('/auth')) {
    e.respondWith(fetch(e.request).catch(()=>new Response(JSON.stringify({error:'Offline'}),{headers:{'Content-Type':'application/json'}})));
    return;
  }
  e.respondWith(caches.match(e.request).then(cached => {
    if (cached) return cached;
    return fetch(e.request).then(res => { if(res.ok){const c=res.clone();caches.open(CACHE).then(ca=>ca.put(e.request,c));} return res; });
  }));
});
