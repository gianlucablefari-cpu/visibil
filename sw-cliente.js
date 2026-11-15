// Service worker minimo: serve solo a rendere installabile l'area cliente come app.
// Non mette niente in cache: ogni richiesta va in rete come sempre.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
