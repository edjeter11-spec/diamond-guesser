const CACHE='dg-v6-direct-fetch';

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

// Handle notification clicks — open/focus the app
self.addEventListener('notificationclick',e=>{
  e.notification.close();
  e.waitUntil(
    clients.matchAll({type:'window',includeUncontrolled:true}).then(clientList=>{
      // If app is already open, focus it
      for(const client of clientList){
        if(client.url.includes('diamond-guesser')&&'focus' in client)return client.focus();
      }
      // Otherwise open a new window
      return clients.openWindow('/diamond-guesser/');
    })
  );
});
