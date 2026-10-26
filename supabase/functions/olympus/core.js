// Olympus server for Supabase: the routes the phone app uses, on Postgres instead of files.
//
// The Node server (api/server.js) keeps everything in files and runs all the time; a Supabase
// Edge Function starts per request and keeps nothing. So this is the same API, answered the
// same way, with the state held in three kinds of documents in one table (store.js):
//   'db'          the accounts            { users: [...] }
//   'state:<uid>' one profile's training  (the document GET/PUT /api/data move)
//   'social'      the social layer        (api/social.js's document)
//   'secret'      the key that signs sessions
//   'hercules', 'athena'   today's count of messages to each coach, per profile (hercules.js)
// A request that changes a document takes its row lock first, so two phones writing at once
// are serialized the way the single Node process serialized them.
//
// Shared with the Node server, unchanged: the social layer (social.js), the sync conflict rules
// (sync-stamps.js), password hashing (password.js) and the Hercules coach (hercules.js) — copied next to this file by
// scripts/supabase-bundle.mjs, and a test keeps the copies identical.
//
// Not here, on purpose: passkeys and pairing codes (the app signs in with a name and password),
// Web Push, the plan-writing AI Coach (Hercules, the chat coach, is), exercise media uploads, the admin dashboard.
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';
import { createSocial, SocialError } from './social.js';
import { stampPut } from './sync-stamps.js';
import { herculesConfig, handleHercules, leftToday, dayOf, HerculesError } from './hercules.js';
import { hashPassword, verifyPassword, needsRehash, passwordProblem, nameKey, normalizeEmail, BusyError, MIN_LENGTH, MAX_LENGTH } from './password.js';

const SESSION_DAYS = 90;
const WID_KEEP = 50;
const MAX_BODY = 5 * 1024 * 1024;
const LOCK_FREE = 5;                       // wrong passwords an account gets before a pause
const LOCK_BASE_MS = 60000;                // first pause; doubles per further failure
const LOCK_MAX_MS = 3600000;

class HttpError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}

const text = v => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
const record = x => !!x && typeof x === 'object' && !Array.isArray(x);
const records = v => (Array.isArray(v) ? v.filter(record) : []);
const forClient = S => {
  if (!S || typeof S !== 'object' || !('_unstamped' in S || '_prior' in S)) return S;
  const { _unstamped, _prior, ...rest } = S;
  return rest;
};
const POLICY_ERRORS = {
  'too-short': `the password needs at least ${MIN_LENGTH} characters`,
  'too-long': `the password can have at most ${MAX_LENGTH} characters`,
  'too-common': 'this password is too easy to guess',
};
const WRONG = { error: 'wrong name or password', code: 'bad-credentials' };
const publicUser = u => ({ id: u.id, name: u.name, admin: !!u.admin });
const sessionVersion = u => u.sv || 0;

/**
 * `store`:  read(key) -> object | null, and update(keys, fn) running fn({ get, set }) while it
 *           holds those documents' locks (fn may be async; what it set is saved when it returns).
 * `photos`: put(name, bytes, contentType), get(name) -> Uint8Array | null, del(name).
 */
export function createApp({ store, photos, now = () => Date.now(), env = {}, fetchImpl = globalThis.fetch }) {
  const coaches = { hercules: herculesConfig(env, 'hercules'), athena: herculesConfig(env, 'athena') };
  let secret = null;
  async function key() {
    if (secret) return secret;
    let s = (await store.read('secret'))?.key;
    if (!s) {
      await store.update(['secret'], ({ get, set }) => {
        s = get('secret')?.key;
        if (!s) { s = crypto.randomBytes(32).toString('hex'); set('secret', { key: s }); }
      });
    }
    return (secret = s);
  }
  const sign = async payload => payload + '.' + crypto.createHmac('sha256', await key()).update(payload).digest('base64url');
  async function verifySig(token) {
    const i = token.lastIndexOf('.');
    if (i < 0) return null;
    const payload = token.slice(0, i), mac = token.slice(i + 1);
    const expect = crypto.createHmac('sha256', await key()).update(payload).digest('base64url');
    try { if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expect))) return null; } catch { return null; }
    return payload;
  }
  const makeSession = user => sign(user.id + ':' + (now() + SESSION_DAYS * 86400000) + ':' + sessionVersion(user));

  const usersOf = db => (Array.isArray(db?.users) ? db.users : []);
  async function sessionOf(req) {
    const auth = req.headers.get('authorization') || '';
    const tok = auth.startsWith('Bearer ') ? auth.slice(7).trim() : null;
    if (!tok) return null;
    const payload = await verifySig(tok);
    if (!payload) return null;
    const [uid, exp, ver] = payload.split(':');
    if (!uid || +exp < now()) return null;
    const user = usersOf(await store.read('db')).find(u => u.id === uid);
    if (!user || user.disabled) return null;
    if (Number(ver ?? 0) !== sessionVersion(user)) return null;
    return { user, exp: +exp };
  }
  async function signedIn(req) {
    const s = await sessionOf(req);
    if (!s) throw new HttpError(401, 'not signed in');
    return s;
  }

  // Passwords: the same identifier rules as the Node server (a name, or an address with an @).
  const holder = (users, k) => (k.includes('@') ? users.find(u => u.email === k && u.pw) : null)
    || users.find(u => u.pw && nameKey(u.name) === k) || null;
  const nameTaken = (users, name, exceptId) => users.some(u => u.id !== exceptId && u.pw && nameKey(u.name) === nameKey(name));
  const lockedFor = u => Math.max(0, (u?.lockUntil || 0) - now());

  async function login(body) {
    const k = nameKey(text(body.identifier ?? body.name ?? body.email).slice(0, 300));
    const pw = typeof body.password === 'string' ? body.password : '';
    if (!k || !pw) throw new HttpError(400, 'name and password required', 'missing');
    const users = usersOf(await store.read('db'));
    const target = holder(users, k);
    const wait = lockedFor(target);
    if (wait) return { status: 429, body: { error: 'too many attempts', code: 'locked', retryAfter: Math.ceil(wait / 1000) } };
    const ok = await verifyPassword(pw, target?.pw?.h);
    let out = null;
    await store.update(['db'], async ({ get, set }) => {
      const db = get('db') || { users: [] };
      const u = target && usersOf(db).find(x => x.id === target.id);
      if (!u) return;
      if (!ok || u.pw?.h !== target.pw.h) {
        u.fails = (u.fails || 0) + 1;
        if (u.fails > LOCK_FREE) u.lockUntil = now() + Math.min(LOCK_MAX_MS, LOCK_BASE_MS * 2 ** (u.fails - LOCK_FREE - 1));
        set('db', db);
        return;
      }
      if (u.disabled) { out = { status: 403, body: { error: 'this account has been disabled', code: 'disabled' } }; return; }
      delete u.fails; delete u.lockUntil;
      if (needsRehash(u.pw.h)) { try { u.pw.h = await hashPassword(pw); } catch (e) { if (!(e instanceof BusyError)) throw e; } }
      set('db', db);
      out = { status: 200, body: { user: publicUser(u), token: await makeSession(u) } };
    });
    return out || { status: 401, body: WRONG };
  }

  async function signup(body) {
    const name = text(body.name).trim().slice(0, 40);
    if (!name) throw new HttpError(400, 'name required', 'missing');
    const problem = passwordProblem(body.password, name);
    if (problem) return { status: 400, body: { error: POLICY_ERRORS[problem], code: problem } };
    const hasEmail = typeof body.email === 'string' && body.email.trim() !== '';
    const email = hasEmail ? normalizeEmail(body.email) : null;
    if (hasEmail && !email) return { status: 400, body: { error: 'that is not an e-mail address', code: 'email-invalid' } };
    const h = await hashPassword(body.password);
    let out;
    await store.update(['db'], async ({ get, set }) => {
      const db = get('db') || { users: [] };
      db.users = usersOf(db);
      if (nameTaken(db.users, name)) { out = { status: 409, body: { error: 'another profile already signs in with this name', code: 'name-taken' } }; return; }
      if (email && db.users.some(u => u.email === email)) { out = { status: 409, body: { error: 'another profile already uses this e-mail address', code: 'email-taken' } }; return; }
      const created = new Date(now()).toISOString();
      // The first profile on a new server is its admin, as with FIRST_USER_ADMIN on the Node server,
      // and its founder (the badge api/social.js shows), which is never handed on.
      const user = { id: crypto.randomBytes(12).toString('base64url'), name, created, pw: { h, set: created }, ...(email ? { email } : {}), ...(db.users.length ? {} : { admin: true, founder: true }) };
      db.users.push(user);
      set('db', db);
      out = { status: 200, body: { user: publicUser(user), token: await makeSession(user) } };
    });
    return out;
  }

  // The social layer for one request: its document read under the lock, its photo writes made
  // before the lock is let go, its photo deletions after.
  async function withSocial(fn) {
    const users = usersOf(await store.read('db'));
    let result;
    const deletes = [];
    await store.update(['social'], async ({ get, set }) => {
      const raw = get('social');
      const writes = [];
      let saved = null;
      const social = createSocial({
        users: () => users, now,
        io: {
          read: () => (raw ? JSON.stringify(raw) : null),
          save: t => { saved = t; },
          writePhoto: (id, type, buf) => { writes.push([`${id}.${type}`, buf, type === 'png' ? 'image/png' : 'image/jpeg']); },
          deletePhoto: (id, type) => { deletes.push(`${id}.${type}`); },
        },
      });
      result = fn(social);
      for (const [name, buf, type] of writes) await photos.put(name, buf, type);
      if (saved != null) set('social', JSON.parse(saved));
    });
    for (const name of deletes) { try { await photos.del(name); } catch { /* best effort */ } }
    return result;
  }

  // Hercules and Athena, the free coaches (hercules.js): whether each is on and how many messages
  // are left today, and one message with the conversation so far.
  const coachStatus = id => async req => {
    const { user } = await signedIn(req);
    const doc = await store.read(id);
    return { status: 200, body: { on: !!coaches[id].key, perDay: coaches[id].perDay, left: leftToday(doc, user.id, dayOf(now()), coaches[id].perDay) } };
  };
  const coachAsk = id => async req => {
    const { user } = await signedIn(req);
    const body = await readJson(req);
    const quota = fn => store.update([id], ({ get, set }) => { set(id, fn(get(id))); });
    return { status: 200, body: await handleHercules({ user, body, config: coaches[id], quota, now: now(), fetchImpl }) };
  };

  async function readJson(req) {
    const raw = await req.text();
    if (raw.length > MAX_BODY) throw new HttpError(413, 'body too large');
    if (!raw) return {};
    try { const v = JSON.parse(raw); return v && typeof v === 'object' ? v : {}; } catch { throw new HttpError(400, 'invalid JSON'); }
  }

  const routes = {
    'GET /api/health': async () => ({ status: 200, body: { ok: true, writable: true } }),
    'GET /api/config': async () => ({ status: 200, body: { invite_only: false, allow_guest: false, password_login: true, server: 'supabase' } }),

    'POST /api/app/login': async req => login(await readJson(req)),
    'POST /api/app/signup': async req => signup(await readJson(req)),
    // The browser routes answer the same, for anything that uses them; no cookie is ever set here.
    'POST /api/login/password': async req => login(await readJson(req)),
    'POST /api/register/password': async req => signup(await readJson(req)),

    'GET /api/me': async req => {
      const { user, exp } = await signedIn(req);
      const renew = exp - now() < SESSION_DAYS * 86400000 / 2;
      return { status: 200, body: { user: publicUser(user), ...(renew ? { token: await makeSession(user) } : {}) } };
    },
    'POST /api/logout': async () => ({ status: 200, body: { ok: true } }),
    'POST /api/logout/all': async req => {
      const { user } = await signedIn(req);
      await store.update(['db'], ({ get, set }) => {
        const db = get('db'); const u = usersOf(db).find(x => x.id === user.id);
        if (u) { u.sv = sessionVersion(u) + 1; set('db', db); }
      });
      return { status: 200, body: { ok: true } };
    },
    'POST /api/activity': async req => { await signedIn(req); await req.text(); return { status: 200, body: { ok: true } }; },

    'GET /api/account/password': async req => {
      const { user } = await signedIn(req);
      const users = usersOf(await store.read('db'));
      return { status: 200, body: { set: !!user.pw, setAt: user.pw?.set || null, passkeys: 0, name: user.name, nameTaken: nameTaken(users, user.name, user.id), email: user.email || null } };
    },
    'POST /api/account/password': async req => {
      const { user } = await signedIn(req);
      const body = await readJson(req);
      if (!(await verifyPassword(text(body.current), user.pw?.h))) return { status: 401, body: { error: 'your current password is not right', code: 'current-wrong' } };
      const problem = passwordProblem(body.next, user.name);
      if (problem) return { status: 400, body: { error: POLICY_ERRORS[problem], code: problem } };
      const h = await hashPassword(body.next);
      let token;
      await store.update(['db'], async ({ get, set }) => {
        const db = get('db'); const u = usersOf(db).find(x => x.id === user.id);
        if (!u) return;
        u.pw = { h, set: new Date(now()).toISOString() };
        u.sv = sessionVersion(u) + 1;           // every other device signs in again
        set('db', db);
        token = await makeSession(u);
      });
      return { status: 200, body: { ok: true, token } };
    },

    // A new profile name, by the rules of signup: 1 to 40 characters, not another profile's.
    'POST /api/account/name': async req => {
      const { user } = await signedIn(req);
      const body = await readJson(req);
      const name = text(body.name).trim().slice(0, 40);
      if (!name) return { status: 400, body: { error: 'name required', code: 'missing' } };
      let out = { status: 200, body: { ok: true, name } };
      await store.update(['db'], async ({ get, set }) => {
        const db = get('db'); const users = usersOf(db); const u = users.find(x => x.id === user.id);
        if (!u || u.name === name) return;
        if (nameTaken(users, name, u.id)) { out = { status: 409, body: { error: 'another profile already signs in with this name', code: 'name-taken' } }; return; }
        u.name = name;
        set('db', db);
      });
      return out;
    },

    // Deleting one's own profile, confirmed with its password: the account, its training document,
    // and everything of it in the social layer (posts, photos, likes, comments, follows).
    'POST /api/account/delete': async req => {
      const { user } = await signedIn(req);
      const body = await readJson(req);
      if (!(await verifyPassword(text(body.password), user.pw?.h))) return { status: 401, body: { error: 'your current password is not right', code: 'current-wrong' } };
      await withSocial(s => s.removeUser(user.id));
      await store.update(['db', 'state:' + user.id], ({ get, set }) => {
        const db = get('db');
        db.users = usersOf(db).filter(u => u.id !== user.id);
        // The first profile left becomes the admin when the admin leaves.
        if (db.users.length && !db.users.some(u => u.admin)) db.users[0].admin = true;
        set('db', db);
        set('state:' + user.id, null);
      });
      return { status: 200, body: { ok: true } };
    },

    // Training data: the same document, revision and conflict rules as the Node server.
    'GET /api/data': async req => {
      const { user } = await signedIn(req);
      const state = await store.read('state:' + user.id);
      return { status: 200, body: { state: forClient(state), rev: state?._rev || 0 } };
    },
    'GET /api/data/rev': async req => {
      const { user } = await signedIn(req);
      const doc = await store.read('state:' + user.id);
      return { status: 200, body: { rev: doc?._rev || 0, ...(doc?._wid ? { wid: doc._wid } : {}) } };
    },
    'PUT /api/data': async req => {
      const { user } = await signedIn(req);
      const body = await readJson(req);
      if (!body.state || typeof body.state !== 'object') return { status: 400, body: { error: 'state required' } };
      if (!Array.isArray(body.state) && !Object.keys(body.state).some(k => k !== '_rev' && k !== '_ts')) return { status: 400, body: { error: 'state required' } };
      const list = v => v == null || Array.isArray(v);
      if (Array.isArray(body.state) || !list(body.state.workouts) || !list(body.state.routines)) return { status: 400, body: { error: 'invalid state' } };
      for (const k of ['workouts', 'routines']) if (Array.isArray(body.state[k])) body.state[k] = records(body.state[k]);
      const docKey = 'state:' + user.id;
      let out;
      await store.update([docKey], ({ get, set }) => {
        const cur = get(docKey);
        const curRev = cur?._rev || 0;
        if ((body.baseRev != null && body.baseRev !== curRev) ||
            (body.baseRev != null && typeof body.baseWid === 'string' && cur?._wid && body.baseWid !== cur._wid)) {
          out = { status: 409, body: { error: 'conflict', rev: curRev, state: forClient(cur) } };
          return;
        }
        delete body.state.active;
        const storedReset = Number(cur?.resetAt) || 0;
        if (storedReset > (Number(body.state.resetAt) || 0)) {
          body.state.resetAt = cur.resetAt;
          if (cur.resetIds && typeof cur.resetIds === 'object') body.state.resetIds = cur.resetIds;
          else delete body.state.resetIds;
        }
        const report = {};
        try { stampPut(cur, body.state, { overRead: body.baseRev != null && body.baseRev === curRev, stamped: body.stamped === true, report, now: now() }); }
        catch (e) { if (e instanceof RangeError) { out = { status: 400, body: { error: 'invalid state' } }; return; } throw e; }
        body.state._rev = curRev + (report.changed ? 2 : 1);
        body.state._wids = [...(Array.isArray(cur?._wids) ? cur._wids : []), ...(cur?._wid ? [cur._wid] : [])]
          .filter(x => typeof x === 'string').slice(-WID_KEEP);
        body.state._wid = crypto.randomBytes(8).toString('hex');
        try { JSON.stringify(body.state); } catch (e) { if (e instanceof RangeError) { out = { status: 400, body: { error: 'invalid state' } }; return; } throw e; }
        set(docKey, body.state);
        out = { status: 200, body: { ok: true, ts: body.state._ts || null, rev: curRev + 1, wid: body.state._wid } };
      });
      return out;
    },

    // Hercules and Athena, the free coaches (hercules.js): whether each is on and how many messages
    // are left today, and one message with the conversation so far.
    'GET /api/hercules': coachStatus('hercules'),
    'POST /api/hercules': coachAsk('hercules'),
    'GET /api/athena': coachStatus('athena'),
    'POST /api/athena': coachAsk('athena'),

    // The social layer, route for route as in api/server.js.
    'GET /api/social/search': async (req, q) => { const { user: me } = await signedIn(req); return { body: { users: await withSocial(s => s.search(me, q.get('q') || '')) } }; },
    'GET /api/social/profile': async (req, q) => { const { user: me } = await signedIn(req); return { body: await withSocial(s => s.profile(me, q.get('id') || '', { before: q.get('before') })) }; },
    'POST /api/social/profile': async req => {
      const { user: me } = await signedIn(req); const body = await readJson(req);
      const change = {};
      if (body.bio !== undefined) change.bio = text(body.bio);
      if (typeof body.private === 'boolean') change.private = body.private;
      if (typeof body.pushSocial === 'boolean') change.pushSocial = body.pushSocial;
      if (body.avatar === null || typeof body.avatar === 'string') change.avatar = body.avatar;
      return { body: { user: await withSocial(s => s.setProfile(me, change)) } };
    },
    'GET /api/social/post': async (req, q) => { const { user: me } = await signedIn(req); return { body: { post: await withSocial(s => s.post(me, q.get('id') || '')) } }; },
    'POST /api/social/followers/remove': async req => { const { user: me } = await signedIn(req); const b = await readJson(req); return { body: { user: await withSocial(s => s.removeFollower(me, text(b.id))) } }; },
    'GET /api/social/requests': async req => { const { user: me } = await signedIn(req); return { body: { users: await withSocial(s => s.requests(me)) } }; },
    'POST /api/social/requests/answer': async req => { const { user: me } = await signedIn(req); const b = await readJson(req); return { body: { users: await withSocial(s => s.answerRequest(me, text(b.id), b.accept === true)) } }; },
    'POST /api/social/block': async req => { const { user: me } = await signedIn(req); const b = await readJson(req); return { body: { user: await withSocial(s => s.block(me, text(b.id), b.block !== false)) } }; },
    'GET /api/social/blocked': async req => { const { user: me } = await signedIn(req); return { body: { users: await withSocial(s => s.blockedList(me)) } }; },
    'GET /api/social/notifications': async req => { const { user: me } = await signedIn(req); return { body: await withSocial(s => s.notifications(me)) }; },
    'POST /api/social/notifications/read': async req => { const { user: me } = await signedIn(req); return { body: await withSocial(s => s.markRead(me)) }; },
    'POST /api/social/photos': async req => {
      const { user: me } = await signedIn(req); const b = await readJson(req);
      return { body: await withSocial(s => { const r = s.uploadPhoto(me, b.data); s.sweepOrphans(); return r; }) };
    },
    'GET /api/social/photo': async (req, q) => {
      const { user: me } = await signedIn(req);
      const f = await withSocial(s => s.photo(me, q.get('id') || ''));
      const bytes = await photos.get(f.name);
      if (!bytes) return { status: 404, body: { error: 'photo not found', code: 'no-photo' } };
      return { status: 200, raw: bytes, headers: { 'Content-Type': f.type, 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff' } };
    },
    'GET /api/social/connections': async (req, q) => { const { user: me } = await signedIn(req); return { body: { users: await withSocial(s => s.connections(me, q.get('id') || '', q.get('kind'))) } }; },
    'POST /api/social/follow': async req => { const { user: me } = await signedIn(req); const b = await readJson(req); return { body: { user: await withSocial(s => s.follow(me, text(b.id), b.follow !== false)) } }; },
    'GET /api/social/feed': async (req, q) => { const { user: me } = await signedIn(req); return { body: await withSocial(s => s.feed(me, { before: q.get('before') })) }; },
    'GET /api/social/discover': async (req, q) => { const { user: me } = await signedIn(req); return { body: await withSocial(s => s.discover(me, { before: q.get('before') })) }; },
    'POST /api/social/posts': async req => { const { user: me } = await signedIn(req); const b = await readJson(req); return { body: { post: await withSocial(s => s.createPost(me, b)) } }; },
    'POST /api/social/posts/edit': async req => { const { user: me } = await signedIn(req); const b = await readJson(req); return { body: { post: await withSocial(s => s.editPost(me, b)) } }; },
    'POST /api/social/posts/delete': async req => { const { user: me } = await signedIn(req); const b = await readJson(req); return { body: await withSocial(s => s.deletePost(me, text(b.id), { asAdmin: !!me.admin })) }; },
    'POST /api/social/posts/like': async req => { const { user: me } = await signedIn(req); const b = await readJson(req); return { body: { post: await withSocial(s => s.like(me, text(b.id), b.like !== false, text(b.kind) || 'heart')) } }; },
    'POST /api/social/posts/comment': async req => { const { user: me } = await signedIn(req); const b = await readJson(req); return { body: { post: await withSocial(s => s.comment(me, text(b.id), text(b.text))) } }; },
    'POST /api/social/posts/comment/delete': async req => { const { user: me } = await signedIn(req); const b = await readJson(req); return { body: { post: await withSocial(s => s.deleteComment(me, text(b.id), text(b.commentId))) } }; },
  };

  const cors = origin => ({ ...(origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}) });
  const json = (status, body, extra = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra } });

  /** One request in, one response out. `path` is the part from /api/ on. */
  async function handle(req) {
    const url = new URL(req.url);
    const at = url.pathname.indexOf('/api/');
    const path = at >= 0 ? url.pathname.slice(at) : url.pathname;
    const origin = req.headers.get('origin');
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { ...cors(origin), 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, CF-Access-Client-Id, CF-Access-Client-Secret', 'Access-Control-Max-Age': '86400' } });
    }
    const route = routes[`${req.method} ${path}`];
    if (!route) return json(404, { error: 'not found' }, cors(origin));
    try {
      // The signing key first, outside any document's lock: a route signs inside one.
      await key();
      const r = await route(req, url.searchParams);
      if (r.raw) return new Response(r.raw, { status: r.status || 200, headers: { ...cors(origin), ...r.headers } });
      return json(r.status || 200, r.body, cors(origin));
    } catch (e) {
      if (e instanceof HttpError) return json(e.status, { error: e.message, ...(e.code ? { code: e.code } : {}) }, cors(origin));
      if (e instanceof SocialError) return json(e.status, { error: e.message, code: e.code }, cors(origin));
      if (e instanceof HerculesError) return json(e.status, { error: e.message, code: e.code, ...(e.left != null ? { left: e.left } : {}) }, cors(origin));
      if (e instanceof BusyError) return json(503, { error: 'the server is busy', code: 'busy' }, { ...cors(origin), 'Retry-After': '2' });
      console.error(`${req.method} ${path}`, e);
      return json(500, { error: 'server error' }, cors(origin));
    }
  }
  return { handle, routes: Object.keys(routes) };
}

/** Documents and photos in memory: the tests' store, and the shape store.js implements. */
export function memoryStore() {
  const docs = new Map();
  let chain = Promise.resolve();
  const clone = v => (v == null ? null : JSON.parse(JSON.stringify(v)));
  return {
    docs,
    async read(key) { return clone(docs.get(key)); },
    update(keys, fn) {
      // One at a time, like the row locks.
      const run = chain.then(async () => {
        const pending = new Map();
        const r = await fn({ get: k => (pending.has(k) ? pending.get(k) : clone(docs.get(k))), set: (k, v) => pending.set(k, clone(v)) });
        // As in Postgres (store.js): a document set to null is removed, never stored as null.
        for (const [k, v] of pending) { if (v == null) docs.delete(k); else docs.set(k, v); }
        return r;
      });
      chain = run.catch(() => {});
      return run;
    },
  };
}
export function memoryPhotos() {
  const files = new Map();
  return {
    files,
    async put(name, bytes) { files.set(name, new Uint8Array(bytes)); },
    async get(name) { return files.get(name) || null; },
    async del(name) { files.delete(name); },
  };
}
