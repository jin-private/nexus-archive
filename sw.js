'use strict';
const CACHE_NAME='nexus-v9-2-quality-20260709-r1';
const APP_SHELL=[
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./assets/css/base.css?v=9.2.0",
  "./assets/css/portal.css?v=9.2.0",
  "./assets/css/extensions.css?v=9.2.0",
  "./assets/css/features.css?v=9.2.0",
  "./assets/js/core.js?v=9.2.0",
  "./assets/js/guides.data.js?v=9.2.0",
  "./assets/js/features.js?v=9.2.0",
  "./assets/js/app.js?v=9.2.0",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/images/embedded/064bbc1c753d038c.webp",
  "./assets/images/embedded/12e1a0eafb2e178e.webp",
  "./assets/images/embedded/59fd8fdea7ffe8b3.webp",
  "./assets/images/embedded/7ed36904962e7ee0.webp",
  "./assets/images/embedded/9301bd9b08d415d4.webp",
  "./assets/images/embedded/9b96c365972365bb.webp",
  "./assets/images/embedded/cce1de7b5a0e3e84.webp",
  "./assets/images/embedded/d7fcaf1cb96df38b.webp",
  "./assets/images/embedded/e0596c9029204be6.webp",
  "./assets/images/embedded/eb6fd6208fac41d2.webp"
];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(APP_SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE_NAME).map(key=>caches.delete(key)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{const req=event.request;if(req.method!=='GET')return;const url=new URL(req.url);if(url.origin!==self.location.origin)return;if(req.mode==='navigate'){event.respondWith(fetch(req).then(response=>{const copy=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put('./index.html',copy));return response}).catch(()=>caches.match('./index.html')));return}event.respondWith(caches.match(req).then(cached=>{const network=fetch(req).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put(req,copy))}return response}).catch(()=>cached);return cached||network}))});
