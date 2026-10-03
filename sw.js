// NotePannuda service worker: lets the app open offline and load instantly from the home screen,
// and receives files and text shared to NotePannuda from Android's share sheet.
// Network first for the app itself (so updates arrive right away), cached copy when offline.
const CACHE = 'notepannuda-v23';
const SHARE_CACHE = 'notepannuda-share';
const ASSETS = ['./notepannuda.html', './manifest.webmanifest', './favicon.ico', './favicon.svg', './favicon-16.png', './favicon-32.png', './apple-touch-icon.png', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './logo-96.png', './badge-96.png', './shortcut-new.png', './shortcut-tasks.png'];

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

// ---------- notifications ----------
// Tapping a notification brings NotePannuda forward (or opens it) on the right view.
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './notepannuda.html', self.registration.scope).href;
  e.waitUntil((async () => {
    const wins = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of wins) if (c.url.startsWith(self.registration.scope)) { await c.focus(); c.postMessage({ type: 'open', url }); return; }
    await clients.openWindow(url);
  })());
});

// Background check (Chrome, installed app): posts the "due today" summary even when the app is closed.
// Chrome decides when it runs, based on how often you use the app. Reads the app's own on-device storage.
self.addEventListener('periodicsync', e => { if (e.tag === 'notepannuda-due') e.waitUntil(dueCheck()); });
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('notepannuda', 1);
    r.onupgradeneeded = () => { for (const st of ['meta', 'shards']) if (!r.result.objectStoreNames.contains(st)) r.result.createObjectStore(st); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
function req(db, store, mode, fn) { return new Promise((res, rej) => { const tx = db.transaction(store, mode); const q = fn(tx.objectStore(store)); tx.oncomplete = () => res(q && q.result); tx.onerror = () => rej(tx.error); }); }
async function dueCheck() {
  const open = await clients.matchAll({ type: 'window' });
  if (open.some(c => c.visibilityState === 'visible')) return;          // the app is on screen: it handles this itself
  const db = await idb();
  const meta = (await req(db, 'meta', 'readonly', os => os.get('meta'))) || {};
  const prefs = Object.assign({ due: true, dueTime: '09:00' }, meta.notify || {});
  if (!prefs.due) return;
  const now = new Date(), [h, m] = prefs.dueTime.split(':').map(Number);
  if (now.getHours() * 60 + now.getMinutes() < h * 60 + m) return;
  const td = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  if ((await req(db, 'meta', 'readonly', os => os.get('dueNotified'))) === td) return;
  const items = ((await req(db, 'shards', 'readonly', os => os.getAll())) || []).flatMap(s => s.items || []);
  const tasks = items.filter(i => i && !i.deleted && i.type === 'task' && !i.done && i.due);
  const dueToday = tasks.filter(i => i.due === td), overdue = tasks.filter(i => i.due < td);
  if (dueToday.length || overdue.length) {
    const n = (k, one, many) => `${k} ${k === 1 ? one : many}`;
    const title = dueToday.length ? `${n(dueToday.length, 'task', 'tasks')} due today${overdue.length ? `, ${overdue.length} overdue` : ''}` : n(overdue.length, 'overdue task', 'overdue tasks');
    const list = [...dueToday, ...overdue], more = list.length - 3;
    const body = list.slice(0, 3).map(t => '\u2022 ' + ((t.text || '').split('\n')[0].trim() || 'Untitled task')).join('\n') + (more > 0 ? `\n+${more} more` : '');
    await self.registration.showNotification(title, { body, icon: 'icon-192.png', badge: 'badge-96.png', tag: 'due-' + td, data: { url: './notepannuda.html?view=today' } });
  }
  await req(db, 'meta', 'readwrite', os => os.put(td, 'dueNotified'));
}
