const CACHE='dg-v2';

self.addEventListener('install',e=>{
  self.skipWaiting();
});

self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});

self.addEventListener('fetch',e=>{
  // Network-first for everything — always get latest, fall back to cache offline
  e.respondWith(
    fetch(e.request).then(resp=>{
      const clone=resp.clone();
      caches.open(CACHE).then(c=>c.put(e.request,clone));
      return resp;
    }).catch(()=>caches.match(e.request))
  );
});
