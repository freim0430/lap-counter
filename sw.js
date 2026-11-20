/* 阿讃ラップロガー service worker: keeps the app and the OCR files on the phone for use without signal.
   Bump VERSION whenever any file in ASSETS changes, so phones pick up the new copy. */
const VERSION = 'v1';
const CACHE = 'asan-lap-' + VERSION;
const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'icon-192.png',
  'icon-512.png',
  'vendor/tesseract/tesseract.min.js',
  'vendor/tesseract/worker.min.js',
  'vendor/core/tesseract-core-simd-lstm.wasm.js',
  'vendor/core/tesseract-core-lstm.wasm.js',
  'vendor/lang/eng.traineddata.gz',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('asan-lap-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// The page itself: try the network first (to get updates), but give up after a few seconds and use the saved copy.
// Everything else: use the saved copy first.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const isPage = req.mode === 'navigate' || /\/(index\.html)?$/.test(new URL(req.url).pathname);
  e.respondWith(isPage ? pageFirst(req) : cacheFirst(req));
});

async function pageFirst(req){
  const cache = await caches.open(CACHE);
  try {
    const res = await Promise.race([
      fetch(req),
      new Promise((_, reject) => setTimeout(() => reject(new Error('slow')), 4000)),
    ]);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    cache.put('index.html', res.clone());
    return res;
  } catch (err) {
    return (await cache.match('index.html')) || (await cache.match('./')) || Response.error();
  }
}

async function cacheFirst(req){
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req, { ignoreSearch:true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

self.addEventListener('message', e => {
  if (!e.data || e.data.type !== 'status' || !e.ports[0]) return;
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    let missing = 0;
    for (const a of ASSETS) if (!(await cache.match(a))) missing++;
    e.ports[0].postMessage({ version:VERSION, missing });
  })());
});
