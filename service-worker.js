const CACHE_NAME = 'meu-vocab-v05-20261028';
const CORE = ['./','./index.html','./style.css','./app.js','./vocabulary.js','./lessons.js','./audio.js','./manifest.webmanifest','./pwa.js','./icon.svg','./icon-192.png','./icon-512.png'];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE_NAME&&key.startsWith('meu-vocab-')).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin)return;
  if(req.mode==='navigate'){
    event.respondWith(fetch(req).then(res=>{
      if(res.ok){const clone=res.clone();caches.open(CACHE_NAME).then(c=>c.put(req,clone));}
      return res;
    }).catch(()=>caches.match(req).then(c=>c||caches.match('./index.html'))));
    return;
  }
  event.respondWith(caches.match(req).then(cached=>cached||fetch(req).then(response=>{
    if(response.ok){const clone=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put(req,clone));}
    return response;
  })));
});
