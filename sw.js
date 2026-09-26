// NotePannuda service worker: lets the app open offline and load instantly from the home screen,
// and receives files and text shared to NotePannuda from Android's share sheet.
// Network first for the app itself (so updates arrive right away), cached copy when offline.
const CACHE = 'notepannuda-v6';
const SHARE_CACHE = 'notepannuda-share';
const ASSETS = ['./notepannuda.html', './manifest.webmanifest', './icon.svg', './icon-180.png', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './shortcut-new.png', './shortcut-tasks.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== SHARE_CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// Share target: a shared .json file is kept for the app to import; shared text or links become a jot.
async function receiveShare(request) {
  const app = new URL('./notepannuda.html', self.registration.scope);
  try {
    const form = await request.formData();
    const file = form.get('file');
    if (file && typeof file === 'object' && file.size) {
      await (await caches.open(SHARE_CACHE)).put('shared-import', new Response(file));
      app.searchParams.set('import', 'shared');
    } else {
      for (const k of ['title', 'text', 'url']) { const v = form.get(k); if (v) app.searchParams.set(k, v); }
    }
  } catch (e) { }
  return Response.redirect(app.href, 303);
}

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  if (e.request.method === 'POST' && url.searchParams.get('share') === '1') { e.respondWith(receiveShare(e.request)); return; }
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(url.pathname, copy)); } return res; })
      .catch(() => caches.match(url.pathname).then(r => r || caches.match('./notepannuda.html')))
  );
});
