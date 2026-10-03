// NotePannuda push server: holds each device's own schedule of reminders and summaries and sends them as
// Web Push messages at the right time, so they arrive even when the app is closed.
//
// What it can see: a random device id, the device's push address (a URL at Google, Apple, Mozilla or
// Microsoft), and when each notification is due. What it can't: anything a notification says. Each device
// encrypts its own notifications (RFC 8291) with keys that never leave its browser; this server only stores
// the sealed bytes and hands them to the push service, signed with its VAPID key (RFC 8292).
//
// One Durable Object per device keeps that device's schedule in SQLite and wakes itself (an alarm) at the
// next due time.
//
// Today every device schedules only for itself (slot names end in the device's own id). The slot names and
// the `ver` column are there so devices can later schedule for each other: see push-server/README.md.

const PUSH_HOSTS = [/\.googleapis\.com$/, /\.push\.apple\.com$/, /\.push\.services\.mozilla\.com$/, /^push\.services\.mozilla\.com$/, /\.notify\.windows\.com$/];
const MAX_ENTRIES = 500;           // per device
const MAX_PAYLOAD = 3000;          // bytes of sealed message (Web Push allows 4096 in total)
const MAX_AHEAD = 62 * 864e5;      // schedule at most ~2 months ahead
const SLOT_RE = /^[a-z]{2,8}:[A-Za-z0-9_.:\-]{1,160}$/;
const ID_RE = /^[a-f0-9]{32}$/;

export default {
  async fetch(req, env) {
    const cors = corsHeaders(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const url = new URL(req.url);
    let res;
    if (url.pathname === '/' || url.pathname === '/v1') res = json({ app: 'notepannuda-push', v: 1, vapid: env.VAPID_PUBLIC_KEY || null });
    else {
      const m = url.pathname.match(/^\/v1\/d\/([^/]+)(\/schedule)?$/);
      if (!m || !ID_RE.test(m[1])) res = json({ error: 'not found' }, 404);
      else {
        const stub = env.DEVICES.get(env.DEVICES.idFromName(m[1]));
        res = await stub.fetch(new Request(`https://do/${m[2] ? 'schedule' : 'device'}`, req));
      }
    }
    const out = new Response(res.body, res);
    for (const [k, v] of Object.entries(cors)) out.headers.set(k, v);
    return out;
  }
};

function corsHeaders(req, env) {
  const origin = req.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const ok = !allowed.length || allowed.includes(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin || '*' : 'null',
    'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });

export class PushDevice {
  constructor(ctx, env) {
    this.ctx = ctx; this.env = env; this.sql = ctx.storage.sql;
    this.init();
  }

  init() {
    this.sql.exec(`CREATE TABLE IF NOT EXISTS device (k INTEGER PRIMARY KEY CHECK (k = 1), token TEXT NOT NULL, endpoint TEXT, status TEXT NOT NULL DEFAULT 'ok', updated INTEGER)`);
    // slot: "rem:<jot id>:<target device>" or "sum:<YYYY-MM-DD>:<target device>". ver: for schedules written by
    // several devices later (the newest version wins); unused while each device writes only its own slots.
    this.sql.exec(`CREATE TABLE IF NOT EXISTS entries (slot TEXT PRIMARY KEY, at INTEGER NOT NULL, payload BLOB NOT NULL, ttl INTEGER NOT NULL, urgency TEXT NOT NULL, ver TEXT)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS log (at INTEGER NOT NULL, slot TEXT, result TEXT)`);
  }

  async fetch(req) {
    const kind = new URL(req.url).pathname.slice(1);
    const dev = this.sql.exec('SELECT token, endpoint, status, updated FROM device').toArray()[0];
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!/^[A-Za-z0-9_-]{32,128}$/.test(token)) return json({ error: 'missing token' }, 401);
    const th = await sha256(token);
    // The first registration claims the id; after that every call needs the same token.
    if (dev && dev.token !== th) return json({ error: 'wrong token' }, 403);

    if (kind === 'device' && req.method === 'PUT') {
      const body = await req.json().catch(() => null);
      const endpoint = body && body.endpoint;
      if (!validEndpoint(endpoint, this.env)) return json({ error: 'not a push service address' }, 400);
      if (!dev) this.sql.exec('INSERT INTO device (k, token, endpoint, status, updated) VALUES (1, ?, ?, ?, ?)', th, endpoint, 'ok', Date.now());
      else {
        // A new push address means new browser keys: anything sealed for the old one can't be read any more.
        if (dev.endpoint !== endpoint) this.sql.exec('DELETE FROM entries');
        this.sql.exec('UPDATE device SET endpoint = ?, status = ?, updated = ?', endpoint, 'ok', Date.now());
      }
      await this.rearm();
      return json(this.state());
    }
    if (!dev) return json({ error: 'not registered' }, 404);
    if (kind === 'device' && req.method === 'GET') return json(this.state());
    if (kind === 'device' && req.method === 'DELETE') { await this.ctx.storage.deleteAlarm(); await this.ctx.storage.deleteAll(); this.init(); return json({ ok: true }); }

    if (kind === 'schedule' && req.method === 'PUT') {
      // The device sends its whole schedule; it replaces what was here.
      const body = await req.json().catch(() => null);
      const list = body && Array.isArray(body.entries) ? body.entries : null;
      if (!list) return json({ error: 'expected { entries: [...] }' }, 400);
      if (list.length > MAX_ENTRIES) return json({ error: `at most ${MAX_ENTRIES} entries` }, 413);
      const now = Date.now(), rows = [], seen = new Set();
      for (const e of list) {
        if (!e || typeof e.slot !== 'string' || !SLOT_RE.test(e.slot) || seen.has(e.slot)) return json({ error: 'bad slot', slot: e && e.slot }, 400);
        if (!Number.isFinite(e.at) || e.at > now + MAX_AHEAD) return json({ error: 'bad time', slot: e.slot }, 400);
        let payload; try { payload = fromB64u(e.payload); } catch (x) { return json({ error: 'bad payload', slot: e.slot }, 400); }
        if (!payload.length || payload.length > MAX_PAYLOAD) return json({ error: 'payload too large', slot: e.slot }, 413);
        seen.add(e.slot);
        if (e.at < now - 60000) continue; // already past: nothing to send
        const ttl = Math.min(Math.max(+e.ttl || 3600, 60), 86400);
        rows.push([e.slot, Math.round(e.at), payload, ttl, e.urgency === 'normal' ? 'normal' : 'high', typeof e.ver === 'string' ? e.ver.slice(0, 64) : null]);
      }
      this.ctx.storage.transactionSync(() => {
        this.sql.exec('DELETE FROM entries');
        for (const r of rows) this.sql.exec('INSERT INTO entries (slot, at, payload, ttl, urgency, ver) VALUES (?, ?, ?, ?, ?, ?)', ...r);
      });
      await this.rearm();
      return json(this.state());
    }
    if (kind === 'schedule' && req.method === 'GET') return json(this.state());
    return json({ error: 'not found' }, 404);
  }

  state() {
    const dev = this.sql.exec('SELECT status, updated FROM device').toArray()[0] || {};
    const slots = Object.fromEntries(this.sql.exec('SELECT slot, at FROM entries ORDER BY at').toArray().map(r => [r.slot, r.at]));
    const log = this.sql.exec('SELECT at, slot, result FROM log ORDER BY at DESC LIMIT 10').toArray();
    return { ok: true, status: dev.status, slots, log };
  }

  async rearm() {
    const next = this.sql.exec('SELECT MIN(at) AS at FROM entries').toArray()[0];
    if (next && next.at != null) await this.ctx.storage.setAlarm(Math.max(next.at, Date.now()));
    else await this.ctx.storage.deleteAlarm();
  }

  async alarm() {
    const dev = this.sql.exec('SELECT endpoint, status FROM device').toArray()[0];
    const due = this.sql.exec('SELECT slot, at, payload, ttl, urgency FROM entries WHERE at <= ? ORDER BY at LIMIT 20', Date.now() + 1000).toArray();
    for (const e of due) {
      let result = 'skipped';
      if (dev && dev.endpoint && dev.status === 'ok') {
        try {
          const r = await sendPush(this.env, dev.endpoint, new Uint8Array(e.payload), e.ttl, e.urgency, await topicOf(e.slot));
          result = String(r.status);
          if (r.status === 404 || r.status === 410) { // the browser dropped this push address: stop until the device registers again
            this.sql.exec("UPDATE device SET status = 'gone'"); dev.status = 'gone';
          } else if (r.status === 429 || r.status >= 500) { // push service busy: try again in a minute (within the message's lifetime)
            if (Date.now() < e.at + e.ttl * 1000) { this.sql.exec('UPDATE entries SET at = ? WHERE slot = ?', Date.now() + 60000, e.slot); this.addLog(e.slot, result + ' retry'); continue; }
          }
        } catch (x) { result = 'error: ' + String(x && x.message || x).slice(0, 80); }
      }
      this.sql.exec('DELETE FROM entries WHERE slot = ?', e.slot);
      this.addLog(e.slot, result);
    }
    await this.rearm();
  }

  addLog(slot, result) {
    this.sql.exec('INSERT INTO log (at, slot, result) VALUES (?, ?, ?)', Date.now(), slot, result);
    this.sql.exec('DELETE FROM log WHERE at < (SELECT at FROM log ORDER BY at DESC LIMIT 1 OFFSET 49)');
  }
}

function validEndpoint(s, env) {
  if (env.DEV_ALLOW_ENDPOINT && typeof s === 'string' && s.startsWith(env.DEV_ALLOW_ENDPOINT)) return true; // local testing only (.dev.vars)
  try { const u = new URL(s); return u.protocol === 'https:' && !u.port && PUSH_HOSTS.some(re => re.test(u.hostname)) && s.length < 1024; }
  catch (e) { return false; }
}

// Topic: an undelivered message with the same topic is replaced instead of piling up (RFC 8030). One per
// slot (a hash, since a topic is at most 32 characters), so a newer copy of the same reminder replaces an older one.
const topicOf = async slot => (await sha256(slot)).slice(0, 32);

async function sendPush(env, endpoint, body, ttl, urgency, topic) {
  const aud = new URL(endpoint).origin;
  const jwt = await vapidJwt(env, aud);
  return fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY}`,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      'TTL': String(ttl), 'Urgency': urgency, 'Topic': topic
    },
    body
  });
}

// VAPID (RFC 8292): a short-lived ES256 token that proves this server is the one the subscription was made for.
let signKey = null;
async function vapidJwt(env, aud) {
  if (!signKey) {
    const pub = fromB64u(env.VAPID_PUBLIC_KEY);
    signKey = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', d: env.VAPID_PRIVATE_KEY, x: b64u(pub.slice(1, 33)), y: b64u(pub.slice(33, 65)), ext: true },
      { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  }
  const enc = o => b64u(new TextEncoder().encode(JSON.stringify(o)));
  const unsigned = `${enc({ typ: 'JWT', alg: 'ES256' })}.${enc({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: env.VAPID_SUBJECT || 'https://github.com/araghunathan99/notepannuda' })}`;
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, signKey, new TextEncoder().encode(unsigned)));
  return `${unsigned}.${b64u(sig)}`;
}

async function sha256(s) { return b64u(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))); }
function b64u(u) { let s = ''; for (const c of u) s += String.fromCharCode(c); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function fromB64u(s) {
  if (typeof s !== 'string' || !/^[A-Za-z0-9_-]*$/.test(s)) throw new Error('not base64url');
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(b, c => c.charCodeAt(0));
}
