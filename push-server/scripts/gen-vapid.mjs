// Makes one VAPID key pair for the push server.
//   node scripts/gen-vapid.mjs             prints the public key, writes the private key to vapid-private.key
//   node scripts/gen-vapid.mjs --dev-vars  writes both to .dev.vars instead, for `wrangler dev`
// Both files are git-ignored. Store the private key with
//   npx wrangler secret put VAPID_PRIVATE_KEY < vapid-private.key
// then delete the file. Never commit the private key.
import { writeFileSync } from 'node:fs';
const b64u = u => Buffer.from(u).toString('base64url');
const k = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
const pub = b64u(new Uint8Array(await crypto.subtle.exportKey('raw', k.publicKey)));
const priv = (await crypto.subtle.exportKey('jwk', k.privateKey)).d;
const here = f => new URL('../' + f, import.meta.url);
if (process.argv.includes('--dev-vars')) {
  writeFileSync(here('.dev.vars'), `VAPID_PUBLIC_KEY=${pub}\nVAPID_PRIVATE_KEY=${priv}\n`, { mode: 0o600 });
  console.error('Wrote .dev.vars');
} else {
  writeFileSync(here('vapid-private.key'), priv, { mode: 0o600 });
  console.error('Wrote the private key to vapid-private.key. Public key:');
}
console.log(pub);
