// Olympus: the rules of an account on the Supabase server (supabase/functions/olympus/core.js).
//
//   usernames  3 to 20 letters, digits, dots and underscores, unique without regard to case;
//   resets     a 6-digit code sent to the account's e-mail, valid 15 minutes, 5 tries;
//   Google     an ID token from Google Sign-In, checked by Google's tokeninfo endpoint against the
//              server's client ID(s) (GOOGLE_CLIENT_ID), giving a verified e-mail and Google's id.
//
// Pure functions and one network call (verifyGoogle); core.js holds the documents and the locks.
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
const USERNAME_RE = /^[A-Za-z0-9](?:[A-Za-z0-9._]*[A-Za-z0-9_])?$/;
// Names that would read as the app or its staff speaking.
const RESERVED = new Set(['admin', 'administrator', 'olympus', 'hercules', 'athena', 'chiron', 'support', 'help', 'root', 'system', 'moderator', 'owner', 'staff', 'official']);

/** What is wrong with `name` as a username, or null: 'too-short' | 'too-long' | 'chars' | 'reserved'. */
export function usernameProblem(name) {
  const n = typeof name === 'string' ? name.trim() : '';
  if (n.length < USERNAME_MIN) return 'too-short';
  if (n.length > USERNAME_MAX) return 'too-long';
  if (!USERNAME_RE.test(n) || n.includes('..')) return 'chars';
  if (RESERVED.has(n.toLowerCase())) return 'reserved';
  return null;
}
export const USERNAME_ERRORS = {
  'too-short': `a username has at least ${USERNAME_MIN} characters`,
  'too-long': `a username has at most ${USERNAME_MAX} characters`,
  chars: 'a username uses only letters, digits, dots and underscores',
  reserved: 'that username is reserved',
};

/**
 * A free username made from a Google profile: the name or the e-mail's local part, cut down to
 * the allowed characters, with digits added until no profile has it. `taken(name)` says whether
 * a profile already signs in with it.
 */
export function usernameFrom({ name, email }, taken, rand = n => crypto.randomInt(n)) {
  const clean = s => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '.').replace(/[^A-Za-z0-9._]/g, '')
    .replace(/\.{2,}/g, '.').replace(/^[._]+|[.]+$/g, '').slice(0, 15);
  let base = clean(String(email || '').split('@')[0]) || clean(name);
  if (base.length < USERNAME_MIN) base = (base + 'athlete').slice(0, 15);
  if (RESERVED.has(base.toLowerCase())) base = base + '1';
  if (!taken(base)) return base;
  for (let i = 0; i < 200; i++) {
    const n = base.slice(0, USERNAME_MAX - 4) + String(rand(10000)).padStart(4, '0');
    if (!taken(n)) return n;
  }
  throw new Error('no free username');
}

/* ------------------------------ password reset ----------------------------- */

export const RESET_TTL_MS = 15 * 60000;
export const RESET_TRIES = 5;
export const RESET_GAP_MS = 60000;          // one e-mail a minute per account
export const RESET_PER_DAY = 5;

const codeHash = (secret, uid, code) => crypto.createHmac('sha256', secret).update(uid + ':' + code).digest('base64url');

/**
 * A new reset for `user` at `now`: { code, reset } where `reset` is what the account keeps (the
 * code's hash, never the code). Throws 'wait' or 'limit' when e-mails go out too often.
 */
export function startReset(user, secret, now, rand = () => crypto.randomInt(1000000)) {
  const sent = (user.reset?.sent || []).filter(t => t > now - 86400000);
  if (sent.length && now - sent[sent.length - 1] < RESET_GAP_MS) throw new Error('wait');
  if (sent.length >= RESET_PER_DAY) throw new Error('limit');
  const code = String(rand()).padStart(6, '0');
  return { code, reset: { h: codeHash(secret, user.id, code), exp: now + RESET_TTL_MS, tries: 0, sent: [...sent, now] } };
}

/** Checks `code` against the account's reset: 'ok' | 'expired' | 'wrong' (a try used) | 'none'. */
export function checkReset(user, secret, code, now) {
  const r = user.reset;
  if (!r?.h) return 'none';
  if (r.exp < now || (r.tries || 0) >= RESET_TRIES) return 'expired';
  const want = Buffer.from(r.h), got = Buffer.from(codeHash(secret, user.id, String(code || '').replace(/\D/g, '')));
  if (want.length === got.length && crypto.timingSafeEqual(want, got)) return 'ok';
  r.tries = (r.tries || 0) + 1;
  return 'wrong';
}

/** The reset e-mail: { to, subject, text, html }. */
export function resetMail(user, code) {
  const text = [
    `Hi ${user.name},`,
    '',
    `Your Olympus password reset code is: ${code}`,
    '',
    'Enter it in the app with your new password. It works for 15 minutes.',
    'If you did not ask for this, ignore this e-mail: your password stays as it is.',
  ].join('\n');
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#111">
<p>Hi ${esc(user.name)},</p><p>Your Olympus password reset code is:</p>
<p style="font-size:30px;font-weight:700;letter-spacing:6px;margin:18px 0">${code}</p>
<p>Enter it in the app with your new password. It works for 15 minutes.</p>
<p style="color:#666">If you did not ask for this, ignore this e-mail: your password stays as it is.</p></div>`;
  return { to: user.email, subject: `${code} is your Olympus reset code`, text, html };
}

/* ------------------------------ Google ------------------------------------ */

/** The client IDs Google tokens may be for (GOOGLE_CLIENT_ID, comma separated); [] = Google off. */
export const googleClients = env => String(env?.GOOGLE_CLIENT_ID || '').split(',').map(s => s.trim()).filter(Boolean);

/**
 * Checks a Google ID token with Google itself and returns { sub, email, name } or throws an Error
 * whose message is the reason ('google-off', 'google-invalid', 'google-email').
 */
export async function verifyGoogle(idToken, env, fetchImpl = globalThis.fetch, now = Date.now()) {
  const clients = googleClients(env);
  if (!clients.length) throw new Error('google-off');
  if (typeof idToken !== 'string' || idToken.length < 20 || idToken.length > 4096) throw new Error('google-invalid');
  const res = await fetchImpl('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken));
  if (!res.ok) throw new Error('google-invalid');
  const t = await res.json();
  if (!clients.includes(t.aud)) throw new Error('google-invalid');
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(t.iss)) throw new Error('google-invalid');
  if (!(Number(t.exp) * 1000 > now)) throw new Error('google-invalid');
  if (!t.email || !(t.email_verified === true || t.email_verified === 'true')) throw new Error('google-email');
  return { sub: String(t.sub), email: String(t.email).toLowerCase(), name: String(t.name || t.given_name || '') };
}
