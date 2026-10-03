# NotePannuda push server

A small Cloudflare Worker that makes reminders and the daily summary arrive on time, even when NotePannuda is closed. It runs on Cloudflare's free plan.

Each device sends the server its own schedule of notifications. At each due time the server hands the notification to the browser's push service (Google for Chrome and Android, Apple for Safari, Mozilla for Firefox), which delivers it to the device.

## What the server can and can't see

The server can see:

- a random ID for each device that turned the option on
- that device's push address: a URL at Google, Apple, Mozilla or Microsoft
- when each notification is due, and roughly how long it is

It can't see what any notification says. Each device seals its notifications before uploading them, using its browser's push keys ([RFC 8291](https://www.rfc-editor.org/rfc/rfc8291)). The private half of those keys never leaves the browser, so only that browser can open them. The server stores the sealed bytes and passes them on, signed with its own VAPID key ([RFC 8292](https://www.rfc-editor.org/rfc/rfc8292)).

The VAPID key only proves to the push service that this server is allowed to send to a device. It can't open messages, and anyone who stole it couldn't send readable ones.

## How it works

- **One schedule per device.** Each device has its own Durable Object, a small SQLite database on Cloudflare. It holds that device's push address, a hash of the device's token, and its schedule.
- **Waking up.** The Durable Object sets an alarm for the next due time. When the alarm fires, it sends everything that's due, deletes it, and sets the next alarm.
- **Replacing the schedule.** Every upload replaces the device's whole schedule, so there are no partial updates to reconcile.
- **One topic per entry.** Each entry gets its own Topic header, so a push service holding an undelivered copy replaces it instead of piling up duplicates.
- **Retries.** If the push service is busy (status 429 or 5xx), the server retries every minute while the message is still within its lifetime.
- **Dropped addresses.** If the push service says the address is gone (404 or 410), the device is marked `gone`. The app registers again the next time it opens.

Entry names say what each entry is and which device it's for:

| Entry | Name |
|---|---|
| Reminder for a task | `rem:<task id>:<device id>` |
| Daily summary | `sum:<YYYY-MM-DD>:<device id>` |

## API

Every call needs `Authorization: Bearer <token>`. The device makes its token itself. The first registration claims the device ID, and after that every call must use the same token.

| Call | Body | What it does |
|---|---|---|
| `PUT /v1/d/<id>` | `{ "endpoint": "https://fcm.googleapis.com/..." }` | Register or update the push address. A new address clears the schedule, since it was sealed for the old keys. |
| `PUT /v1/d/<id>/schedule` | `{ "entries": [{ "slot", "at", "payload", "ttl"?, "urgency"? }] }` | Replace the schedule. `at` is in milliseconds since 1970, `payload` is the sealed message in base64url. |
| `GET /v1/d/<id>` | | Status (`ok` or `gone`), the slots still waiting, and the last 10 delivery results. |
| `DELETE /v1/d/<id>` | | Forget this device. |

Limits: 500 entries per device, 3,000 bytes per sealed message, and at most 62 days ahead. Push addresses must belong to a known push service, so the server can't be used to send requests anywhere else.

## Deploy

You need Node.js and a free Cloudflare account.

```
cd push-server
npm install
npx wrangler login
```

1. Make a VAPID key pair:
   ```
   node scripts/gen-vapid.mjs
   ```
   This prints the public key and writes the private key to `vapid-private.key` (git-ignored). Put the public key in `wrangler.toml` as `VAPID_PUBLIC_KEY`.
2. Store the private key as a secret, then delete the file:
   ```
   npx wrangler secret put VAPID_PRIVATE_KEY < vapid-private.key
   rm vapid-private.key
   ```
3. Deploy, then note the `https://notepannuda-push.<you>.workers.dev` address it prints:
   ```
   npx wrangler deploy
   ```
4. In `notepannuda.html`, set `PUSH_SERVER` to that address and `PUSH_VAPID_KEY` to the public key. Then publish the app.
5. In the app, open **Settings**, then **Notifications**, and turn on **On time, even when NotePannuda is closed** on each device.

Changing the VAPID key later is safe. Each device notices the new key the next time it opens and registers again.

### Local testing

```
node scripts/gen-vapid.mjs --dev-vars        # writes a test key pair to .dev.vars (git-ignored)
npx wrangler dev --port 8787
```

For automated tests, `DEV_ALLOW_ENDPOINT=http://127.0.0.1:8799/` in `.dev.vars` lets the server send to a fake push service. It is never set on the real server.

## Free plan

The free plan covers 100,000 requests and 100,000 Durable Object writes a day. One device uses a few dozen of each.

If someone deliberately floods the server past those limits, requests fail until the next day. Nothing is ever billed on the free plan. While the server is unavailable, the app's local notifications keep working.

## Later: scheduling for other devices

Today each device schedules only for itself. A device that's been closed for a while has an out-of-date schedule: it misses reminders set elsewhere and may still remind you about tasks completed elsewhere.

Letting devices schedule for each other was left out on purpose, and the design leaves room for it:

- **Entry names already include the target device,** so entries from different writers never collide.
- **The `entries` table already has a `ver` column.** With several writers, an upload would keep an entry only if its version (the task's newest sync stamp) is higher than what's stored. Entries for completed or deleted tasks would be stored as "cancelled" until their time passes.
- **New pieces needed:**
  - a group record per pairing group, keyed by an ID derived from the pairing code;
  - per-slot updates, instead of each device replacing its whole schedule;
  - sharing each device's push keys through the app's encrypted sync, so other devices can seal for it;
  - cleanup when a device is removed: the group moves to a new code and the old group's entries are deleted.
