/* Service worker: app sempre aggiornata quando c'è rete, tutto disponibile offline. */
'use strict';

var SHELL = 'vault-shell-v1';
var SONGS = 'vault-songs-v1';
var SHELL_FILES = [
  './', 'index.html', 'app.js', 'style.css', 'songs.json', 'manifest.webmanifest',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(SHELL).then(function (c) {
    return c.addAll(SHELL_FILES.map(function (u) { return new Request(u, { cache: 'reload' }); }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== SHELL && k !== SONGS; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // Canzoni: l'URL contiene ?v=<hash del contenuto>, quindi la cache non invecchia
  if (url.pathname.indexOf('/songs/') !== -1) {
    e.respondWith(caches.open(SONGS).then(function (c) {
      return c.match(req).then(function (hit) {
        return hit || fetch(req).then(function (res) {
          if (res.ok) c.put(req, res.clone());
          return res;
        });
      });
    }));
    return;
  }

  // App e songs.json: prima la rete, poi la cache
  e.respondWith(fetch(req).then(function (res) {
    if (res.ok) {
      var copy = res.clone();
      caches.open(SHELL).then(function (c) { c.put(req, copy); });
    }
    return res;
  }).catch(function () {
    return caches.match(req, { ignoreSearch: true }).then(function (hit) {
      return hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error());
    });
  }));
});

// La pagina manda l'elenco delle canzoni: si salvano quelle mancanti e si
// buttano le versioni vecchie.
self.addEventListener('message', function (e) {
  var d = e.data || {};
  if (d.type !== 'precache' || !Array.isArray(d.urls)) return;
  var client = e.source;
  e.waitUntil(precache(d.urls, function (msg) {
    if (client) client.postMessage(msg);
  }));
});

var running = null;
function precache(urls, report) {
  if (running) return running;
  var wanted = new Set(urls);
  running = caches.open(SONGS).then(function (c) {
    return c.keys().then(function (keys) {
      var have = new Set();
      return Promise.all(keys.map(function (k) {
        if (wanted.has(k.url)) { have.add(k.url); return null; }
        return c.delete(k);
      })).then(function () {
        var todo = urls.filter(function (u) { return !have.has(u); });
        var total = urls.length, done = total - todo.length, failed = 0;
        report({ type: 'precache-progress', done: done, total: total, failed: 0 });
        function worker() {
          var u = todo.shift();
          if (!u) return Promise.resolve();
          return fetch(u).then(function (res) {
            if (!res.ok) throw new Error(res.status);
            return c.put(u, res);
          }).then(function () { done++; }, function () { failed++; }).then(function () {
            if ((done + failed) % 25 === 0 || !todo.length) {
              report({ type: 'precache-progress', done: done, total: total, failed: failed });
            }
            return worker();
          });
        }
        var workers = [];
        for (var i = 0; i < 6; i++) workers.push(worker());
        return Promise.all(workers).then(function () {
          report({ type: 'precache-progress', done: done, total: total, failed: failed });
        });
      });
    });
  }).finally(function () { running = null; });
  return running;
}
