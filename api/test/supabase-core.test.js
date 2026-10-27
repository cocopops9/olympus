/* Olympus on Supabase (supabase/functions/olympus/core.js): the routes the phone app uses, run
   here against the in-memory store, which keeps the same contract as the Postgres one. The app
   must not be able to tell this server from the Node one on these routes. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp, memoryStore, memoryPhotos } from '../../supabase/functions/olympus/core.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASE = 'https://proj.supabase.co/functions/v1/olympus';
const PW = 'correct horse battery staple';

function server(clock = { t: Date.parse('2026-10-24T12:00:00Z') }) {
  const store = memoryStore(), photos = memoryPhotos();
  const app = createApp({ store, photos, now: () => clock.t });
  const call = async (method, p, { body, token, raw } = {}) => {
    const res = await app.handle(new Request(BASE + p, {
      method, headers: { 'Content-Type': 'application/json', Origin: 'https://localhost', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    }));
    if (raw) return res;
    return { status: res.status, body: await res.json(), headers: res.headers };
  };
  return { app, store, photos, call, clock };
}
const signup = async (s, name, password = PW) => (await s.call('POST', '/api/app/signup', { body: { name, password, email: name.toLowerCase() + '@example.com' } })).body;

test('the bundled copies of the shared server modules are current', () => {
  execFileSync(process.execPath, [path.join(ROOT, 'scripts/supabase-bundle.mjs'), '--check'], { stdio: 'pipe' });
});

test('signup, sign in, the token, wrong passwords and the pause', async () => {
  const s = server();
  const ana = await signup(s, 'Ana');
  assert.ok(ana.token);
  assert.deepEqual(ana.user, { id: ana.user.id, name: 'Ana', admin: true, founder: true }, 'the first profile is the admin and the founder');
  const ben = await signup(s, 'Ben', PW + ' two');
  assert.equal(ben.user.admin, false);
  assert.equal((await s.call('POST', '/api/app/signup', { body: { name: 'ana', password: PW + ' x', email: 'other@example.com' } })).status, 409);
  assert.equal((await s.call('POST', '/api/app/signup', { body: { name: 'Cleo', password: 'short', email: 'cleo@example.com' } })).body.code, 'too-short');

  const me = await s.call('GET', '/api/me', { token: ana.token });
  assert.equal(me.status, 200);
  assert.equal(me.body.user.name, 'Ana');
  assert.equal((await s.call('GET', '/api/me', { token: ana.token + 'x' })).status, 401);
  assert.equal(me.headers.get('access-control-allow-origin'), 'https://localhost');

  const ok = await s.call('POST', '/api/app/login', { body: { identifier: '  ANA ', password: PW } });
  assert.equal(ok.status, 200);
  assert.ok(ok.body.token);
  for (let i = 0; i < 6; i++) assert.equal((await s.call('POST', '/api/app/login', { body: { identifier: 'Ana', password: 'nope nope nope' } })).status, 401);
  const paused = await s.call('POST', '/api/app/login', { body: { identifier: 'Ana', password: PW } });
  assert.equal(paused.status, 429);
  assert.equal(paused.body.code, 'locked');
  s.clock.t += 61000;
  assert.equal((await s.call('POST', '/api/app/login', { body: { identifier: 'Ana', password: PW } })).status, 200);

  // Sign out everywhere ends every token, a new sign-in works.
  await s.call('POST', '/api/logout/all', { token: ok.body.token });
  assert.equal((await s.call('GET', '/api/me', { token: ok.body.token })).status, 401);
  assert.equal((await s.call('GET', '/api/me', { token: ana.token })).status, 401);
});

test('the training document: revisions, conflicts carry the current copy, nothing device-local kept', async () => {
  const s = server();
  const { token } = await signup(s, 'Ana');
  assert.deepEqual((await s.call('GET', '/api/data', { token })).body, { state: null, rev: 0 });
  const first = await s.call('PUT', '/api/data', { token, body: { state: { workouts: [{ id: 'w1', d: '2026-10-20' }], routines: [], active: { x: 1 } }, baseRev: 0 } });
  assert.equal(first.status, 200);
  assert.equal(first.body.rev, 1);
  const rev = await s.call('GET', '/api/data/rev', { token });
  assert.deepEqual(rev.body, { rev: 1, wid: first.body.wid });
  const got = (await s.call('GET', '/api/data', { token })).body;
  assert.equal(got.state.workouts[0].id, 'w1');
  assert.equal('active' in got.state, false);
  const stale = await s.call('PUT', '/api/data', { token, body: { state: { workouts: [], routines: [] }, baseRev: 0 } });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.state.workouts[0].id, 'w1');
  assert.equal((await s.call('PUT', '/api/data', { token, body: { state: {} } })).status, 400);
  assert.equal((await s.call('GET', '/api/data')).status, 401);
});

test('the social layer end to end: posts with a photo, a private profile, a block', async () => {
  const s = server();
  const ana = await signup(s, 'Ana');
  const ben = await signup(s, 'Ben', PW + ' b');
  const A = ana.user.id, B = ben.user.id;
  // A tiny valid JPEG (SOI, an APP1 that must be stripped, SOS, EOI).
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x08, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0xff, 0xda, 0x00, 0x02, 0x11, 0x22, 0xff, 0xd9]);
  const up = await s.call('POST', '/api/social/photos', { token: ben.token, body: { data: 'data:image/jpeg;base64,' + jpeg.toString('base64') } });
  assert.equal(up.status, 200, JSON.stringify(up.body));
  const stored = s.photos.files.get(up.body.id + '.jpg');
  assert.ok(stored && !Buffer.from(stored).includes(Buffer.from('Exif')), 'metadata stripped before it is stored');
  const post = await s.call('POST', '/api/social/posts', { token: ben.token, body: { text: 'Leg day', photos: [up.body.id] } });
  assert.equal(post.status, 200);

  assert.equal((await s.call('GET', '/api/social/discover', { token: ana.token })).body.posts[0].text, 'Leg day');
  const pic = await s.call('GET', '/api/social/photo?id=' + up.body.id, { token: ana.token, raw: true });
  assert.equal(pic.status, 200);
  assert.equal(pic.headers.get('content-type'), 'image/jpeg');

  await s.call('POST', '/api/social/follow', { token: ana.token, body: { id: B } });
  await s.call('POST', '/api/social/posts/like', { token: ana.token, body: { id: post.body.post.id } });
  const notes = (await s.call('GET', '/api/social/notifications', { token: ben.token })).body;
  assert.deepEqual(notes.items.map(n => n.kind).sort(), ['follow', 'like']);

  // Private: a follow becomes a request, answered from the other side.
  await s.call('POST', '/api/social/profile', { token: ana.token, body: { private: true } });
  const asked = await s.call('POST', '/api/social/follow', { token: ben.token, body: { id: A } });
  assert.equal(asked.body.user.requested, true);
  const left = await s.call('POST', '/api/social/requests/answer', { token: ana.token, body: { id: B, accept: true } });
  assert.deepEqual(left.body.users, []);
  assert.equal((await s.call('GET', '/api/social/profile?id=' + A, { token: ben.token })).body.user.isFollowing, true);

  // Blocked: nothing visible, and the photo is gone for them too.
  await s.call('POST', '/api/social/block', { token: ana.token, body: { id: B } });
  assert.equal((await s.call('GET', '/api/social/photo?id=' + up.body.id, { token: ana.token })).status, 404);

  // Deleting the post deletes its photo.
  await s.call('POST', '/api/social/posts/delete', { token: ben.token, body: { id: post.body.post.id } });
  assert.equal(s.photos.files.has(up.body.id + '.jpg'), false);
  assert.equal((await s.call('GET', '/api/social/nothing', { token: ben.token })).status, 404);
});

test('concurrent writes to one document are serialized', async () => {
  const s = server();
  const { token } = await signup(s, 'Ana');
  await s.call('PUT', '/api/data', { token, body: { state: { workouts: [], routines: [] }, baseRev: 0 } });
  const both = await Promise.all([1, 2].map(i => s.call('PUT', '/api/data', { token, body: { state: { workouts: [{ id: 'w' + i }], routines: [] }, baseRev: 1 } })));
  assert.deepEqual(both.map(r => r.status).sort(), [200, 409]);
});

test('a profile deletes itself with its password, and nothing of it stays', async () => {
  const s = server();
  const ana = await signup(s, 'Ana');
  const ben = await signup(s, 'Ben', PW + ' b');
  await s.call('PUT', '/api/data', { token: ana.token, body: { state: { workouts: [{ id: 'w1' }], routines: [] } } });
  await s.call('POST', '/api/social/posts', { token: ana.token, body: { text: 'bye' } });
  await s.call('POST', '/api/social/follow', { token: ben.token, body: { id: ana.user.id } });
  assert.equal((await s.call('POST', '/api/account/delete', { token: ana.token, body: { password: 'wrong one' } })).status, 401);
  assert.equal((await s.call('POST', '/api/account/delete', { token: ana.token, body: { password: PW } })).status, 200);
  assert.equal((await s.call('GET', '/api/me', { token: ana.token })).status, 401);
  assert.deepEqual((await s.call('GET', '/api/social/discover', { token: ben.token })).body.posts, []);
  assert.deepEqual((await s.call('GET', '/api/social/search?q=Ana', { token: ben.token })).body.users, []);
  assert.equal(s.store.docs.has('state:' + ana.user.id), false);
  assert.equal((await s.call('GET', '/api/me', { token: ben.token })).body.user.admin, true, 'the admin role passes on');
});

test('a profile changes its name and its password, and keeps this device signed in', async () => {
  const s = server();
  const ana = await signup(s, 'Ana');
  await signup(s, 'Ben', PW + ' two');
  assert.equal((await s.call('POST', '/api/account/name', { token: ana.token, body: { name: 'ben' } })).status, 409, 'another profile’s name');
  assert.equal((await s.call('POST', '/api/account/name', { token: ana.token, body: { name: '   ' } })).body.code, 'missing');
  assert.equal((await s.call('POST', '/api/account/name', { token: ana.token, body: { name: 'Anna Maria' } })).body.code, 'username-chars', 'a username has no spaces');
  const renamed = await s.call('POST', '/api/account/name', { token: ana.token, body: { name: 'Anna_Maria' } });
  assert.equal(renamed.status, 200);
  assert.equal((await s.call('GET', '/api/me', { token: ana.token })).body.user.name, 'Anna_Maria');
  assert.equal((await s.call('POST', '/api/app/login', { body: { identifier: 'anna_maria', password: PW } })).status, 200);
  assert.equal((await s.call('POST', '/api/app/login', { body: { identifier: 'Ana', password: PW } })).status, 401, 'the old name signs in no more');

  const wrong = await s.call('POST', '/api/account/password', { token: ana.token, body: { current: 'not it at all', next: PW + ' new' } });
  assert.equal(wrong.status, 401);
  const changed = await s.call('POST', '/api/account/password', { token: ana.token, body: { current: PW, next: PW + ' new' } });
  assert.equal(changed.status, 200);
  assert.equal((await s.call('GET', '/api/me', { token: ana.token })).status, 401, 'the old session ended');
  assert.equal((await s.call('GET', '/api/me', { token: changed.body.token })).status, 200, 'the token handed back works');
  assert.equal((await s.call('POST', '/api/app/login', { body: { identifier: 'Anna_Maria', password: PW + ' new' } })).status, 200);
});

test('invites, usage statistics, feedback and the owner dashboard', async () => {
  const s = server();
  const env = { RESEND_API_KEY: 'k', FEEDBACK_EMAIL: 'owner@example.com' };
  const mails = [];
  const fetchImpl = async (url, init) => { mails.push({ url, body: JSON.parse(init.body) }); return { ok: true, text: async () => '' }; };
  const app = createApp({ store: s.store, photos: s.photos, now: () => s.clock.t, env, fetchImpl });
  const call = async (method, p, { body, token } = {}) => {
    const res = await app.handle(new Request(BASE + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }));
    const ct = res.headers.get('content-type') || '';
    return { status: res.status, body: ct.includes('json') ? await res.json() : await res.text() };
  };
  const owner = (await call('POST', '/api/app/signup', { body: { name: 'Boss', password: PW, email: 'boss@example.com' } })).body;
  const ref = await call('GET', '/api/referral', { token: owner.token });
  assert.match(ref.body.code, /^[A-Z2-9]{6}$/);
  const friend = (await call('POST', '/api/app/signup', { body: { name: 'Friend', password: PW, email: 'friend@example.com', ref: ref.body.code.toLowerCase() } })).body;
  assert.equal((await call('GET', '/api/referral', { token: owner.token })).body.invited, 1);

  assert.equal((await call('POST', '/api/telemetry', { token: friend.token, body: { events: [] } })).status, 400, 'needs consent');
  const t = s.clock.t;
  await call('POST', '/api/telemetry', { token: friend.token, body: { consent: true, platform: 'android', version: '1.0', events: [
    { t: t - 60000, type: 'open' }, { t: t - 50000, type: 'screen', path: '/plan/r/AbCdEfGhIjKlMn', sec: 120 }, { t: t - 40000, type: 'event', name: 'workout.finish' },
    { t: t + 9e9, type: 'open' }, { t, type: 'event', name: 'Bad Name!' },
  ] } });

  const fb = await call('POST', '/api/feedback', { token: friend.token, body: { ratings: { clarity: 5, enjoy: 4, useful: 9, recommend: 10 }, text: 'Great app' } });
  assert.equal(fb.body.mailed, true);
  assert.equal(mails[0].body.to[0], 'owner@example.com');
  assert.match(mails[0].body.text, /Clear and easy to use: 5\/5/);
  assert.match(mails[0].body.text, /Useful for training: 5\/5/, 'ratings are clamped to 1-5');

  assert.equal((await call('GET', '/api/owner/dashboard', { token: friend.token })).status, 403, 'only the founder');
  const board = (await call('GET', '/api/owner/dashboard', { token: owner.token })).body;
  assert.equal(board.totals.users, 2);
  assert.equal(board.totals.sharing, 1);
  assert.equal(board.totals.referred, 1);
  const f = board.people.find(p => p.name === 'Friend');
  assert.deepEqual([f.sessions, f.seconds, f.referredBy, f.platform], [1, 120, 'Boss', 'android']);
  assert.deepEqual(board.screens, [{ path: '/plan/r/:id', seconds: 120, users: 1 }]);
  assert.deepEqual(board.events, [{ name: 'workout.finish', n: 1, users: 1 }]);
  assert.equal(board.referrals[0].invited[0].name, 'Friend');
  assert.equal(board.feedback.ratings.clarity, 5);
  assert.equal(board.feedback.nps, 100);
  const person = (await call('GET', '/api/owner/person?id=' + f.id, { token: owner.token })).body;
  assert.equal(person.recent.length, 3);
  const csv = (await call('GET', '/api/owner/export?what=people', { token: owner.token })).body;
  assert.match(csv, /^id,name,email,created,referredBy/);
  assert.match(csv, /Friend/);
  const wrapped = (await call('GET', '/api/owner/export?what=feedback&wrap=1', { token: owner.token })).body;
  assert.equal(wrapped.filename, 'olympus-feedback.csv');
  assert.match(wrapped.csv, /Great app/);

  await call('POST', '/api/telemetry/forget', { token: friend.token });
  assert.equal((await call('GET', '/api/owner/dashboard', { token: owner.token })).body.totals.sharing, 0);
});

test('accounts: usernames, a required e-mail, the reset code by e-mail, Google sign-in', async () => {
  const mails = [];
  const tokens = {
    good: { aud: 'web.apps.googleusercontent.com', iss: 'https://accounts.google.com', exp: String(Date.parse('2026-10-24T13:00:00Z') / 1000), sub: 'g-1', email: 'Gia@Example.com', email_verified: 'true', name: 'Gia Rossi' },
    ana: { aud: 'web.apps.googleusercontent.com', iss: 'accounts.google.com', exp: String(Date.parse('2026-10-24T13:00:00Z') / 1000), sub: 'g-2', email: 'ana@example.com', email_verified: true, name: 'Ana' },
    other: { aud: 'someone-else', iss: 'accounts.google.com', exp: '9999999999', sub: 'g-3', email: 'x@example.com', email_verified: 'true' },
  };
  const fetchImpl = async (url, init) => {
    if (String(url).startsWith('https://oauth2.googleapis.com/tokeninfo')) {
      const t = tokens[decodeURIComponent(String(url).split('id_token=')[1]).replace(/^tok-/, '')];
      return t ? new Response(JSON.stringify(t), { status: 200 }) : new Response('{}', { status: 400 });
    }
    mails.push({ url, body: JSON.parse(init.body) });
    return new Response('{}', { status: 200 });
  };
  const clock = { t: Date.parse('2026-10-24T12:00:00Z') };
  const store = memoryStore();
  const app = createApp({ store, photos: memoryPhotos(), now: () => clock.t, env: { RESEND_API_KEY: 'k', MAIL_FROM: 'Olympus <no-reply@olympus.app>', GOOGLE_CLIENT_ID: 'web.apps.googleusercontent.com' }, fetchImpl });
  const call = async (method, p, body) => {
    const res = await app.handle(new Request(BASE + p, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }));
    return { status: res.status, body: await res.json() };
  };
  const cfg = (await call('GET', '/api/config')).body;
  assert.equal(cfg.google_client_id, 'web.apps.googleusercontent.com');
  assert.equal(cfg.password_reset, true);

  assert.equal((await call('POST', '/api/app/signup', { name: 'ana', password: PW })).body.code, 'email-missing');
  assert.equal((await call('POST', '/api/app/signup', { name: 'a b', password: PW, email: 'a@example.com' })).body.code, 'username-chars');
  assert.equal((await call('POST', '/api/app/signup', { name: 'admin', password: PW, email: 'a@example.com' })).body.code, 'username-reserved');
  assert.equal((await call('GET', '/api/app/username?name=Ana')).body.available, true);
  const ana = (await call('POST', '/api/app/signup', { name: 'Ana', password: PW, email: 'Ana@Example.com' })).body;
  assert.ok(ana.token);
  assert.deepEqual((await call('GET', '/api/app/username?name=ANA')).body, { available: false, code: 'name-taken', error: 'that username is taken' });
  assert.equal((await call('GET', '/api/app/username?name=x')).body.code, 'username-too-short');
  assert.equal((await call('POST', '/api/app/signup', { name: 'Ana2', password: PW, email: 'ana@example.com' })).body.code, 'email-taken');
  assert.equal((await call('POST', '/api/app/login', { identifier: 'ANA@example.com', password: PW })).status, 200, 'sign in with the e-mail');

  // Forgotten password: the same answer for an address nobody has, a code by e-mail for Ana.
  assert.deepEqual((await call('POST', '/api/app/password/forgot', { email: 'nobody@example.com' })).body, { ok: true });
  assert.equal(mails.length, 0);
  await call('POST', '/api/app/password/forgot', { email: 'ana@example.com' });
  assert.equal(mails.length, 1);
  assert.equal(mails[0].body.to[0], 'ana@example.com');
  assert.equal(mails[0].body.from, 'Olympus <no-reply@olympus.app>');
  const code = /code is: (\d{6})/.exec(mails[0].body.text)[1];
  await call('POST', '/api/app/password/forgot', { email: 'ana@example.com' });
  assert.equal(mails.length, 1, 'one e-mail a minute');
  assert.equal((await call('POST', '/api/app/password/reset', { email: 'ana@example.com', code: '000000' === code ? '111111' : '000000', password: PW + ' new' })).body.code, 'reset-invalid');
  const done = await call('POST', '/api/app/password/reset', { email: 'ana@example.com', code, password: PW + ' new' });
  assert.equal(done.status, 200);
  assert.ok(done.body.token);
  assert.equal((await call('POST', '/api/app/login', { identifier: 'Ana', password: PW })).status, 401, 'the old password is gone');
  assert.equal((await call('POST', '/api/app/login', { identifier: 'Ana', password: PW + ' new' })).status, 200);
  assert.equal((await call('POST', '/api/app/password/reset', { email: 'ana@example.com', code, password: PW + ' again' })).status, 400, 'a code works once');

  // Google: a new profile with a username made from the e-mail; the same Google id signs in to it.
  assert.equal((await call('POST', '/api/app/google', { idToken: 'tok-other-xxxxxxxxxxxxxxxx' })).body.code, 'google-invalid', 'a token for another app');
  const gia = await call('POST', '/api/app/google', { idToken: 'tok-good', ref: '' });
  assert.equal(gia.status, 401, 'too short to be a token');
  tokens['good-xxxxxxxxxxxxxxxxxxxx'] = tokens.good;
  const g1 = await call('POST', '/api/app/google', { idToken: 'tok-good-xxxxxxxxxxxxxxxxxxxx' });
  assert.equal(g1.status, 200);
  assert.equal(g1.body.created, true);
  assert.equal(g1.body.user.name, 'gia', 'from the e-mail');
  const g2 = await call('POST', '/api/app/google', { idToken: 'tok-good-xxxxxxxxxxxxxxxxxxxx' });
  assert.equal(g2.body.user.id, g1.body.user.id);
  assert.equal(g2.body.created, false);
  // Ana's e-mail was proved by the reset: Google links to her profile and her password stays.
  tokens['ana-xxxxxxxxxxxxxxxxxxxxx'] = tokens.ana;
  const g3 = await call('POST', '/api/app/google', { idToken: 'tok-ana-xxxxxxxxxxxxxxxxxxxxx' });
  assert.equal(g3.body.user.id, ana.user.id);
  assert.equal((await call('POST', '/api/app/login', { identifier: 'Ana', password: PW + ' new' })).status, 200);
  // A name made from a taken e-mail gets digits.
  assert.equal((await call('GET', '/api/app/username?name=gia')).body.available, false);
});

test('accounts: Google on a profile whose e-mail nobody proved takes its password away', async () => {
  const s = server();
  await signup(s, 'Mia');
  const env = { GOOGLE_CLIENT_ID: 'web' };
  const fetchImpl = async () => new Response(JSON.stringify({ aud: 'web', iss: 'accounts.google.com', exp: '9999999999', sub: 'g-9', email: 'mia@example.com', email_verified: 'true' }), { status: 200 });
  const app = createApp({ store: s.store, photos: s.photos, now: () => s.clock.t, env, fetchImpl });
  const res = await app.handle(new Request(BASE + '/api/app/google', { method: 'POST', body: JSON.stringify({ idToken: 'x'.repeat(40) }) }));
  assert.equal(res.status, 200);
  assert.equal((await s.call('POST', '/api/app/login', { body: { identifier: 'Mia', password: PW } })).status, 401);
});
