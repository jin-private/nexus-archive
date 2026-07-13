'use strict';
const CACHE_NAME='nexus-v10-personal-stock-os-20260713-r3';
const APP_SHELL=[
  './','./index.html','./manifest.webmanifest',
  './assets/css/base.css?v=10.0.1','./assets/css/portal.css?v=10.0.1','./assets/css/extensions.css?v=10.0.1','./assets/css/features.css?v=10.0.1','./assets/css/v93.css?v=10.0.1','./assets/css/v10.css?v=10.0.1',
  './assets/js/core.js?v=10.0.1','./assets/js/guides.data.js?v=10.0.1','./assets/js/features.js?v=10.0.1','./assets/js/app.js?v=10.0.1','./assets/js/v93.js?v=10.0.1','./assets/js/v10.js?v=10.0.1',
  './assets/icons/icon-192.png','./assets/icons/icon-512.png'
];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(APP_SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE_NAME).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin)return;
  if(req.mode==='navigate'){
    event.respondWith(fetch(req,{cache:'no-store'}).then(response=>{
      if(response.ok)caches.open(CACHE_NAME).then(cache=>cache.put('./index.html',response.clone()));
      return response;
    }).catch(()=>caches.match('./index.html')));
    return;
  }
  event.respondWith(caches.match(req).then(cached=>{
    const update=fetch(req).then(response=>{
      if(response.ok)caches.open(CACHE_NAME).then(cache=>cache.put(req,response.clone()));
      return response;
    }).catch(()=>cached);
    return cached||update;
  }));
});
