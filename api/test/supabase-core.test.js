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
const signup = async (s, name, password = PW) => (await s.call('POST', '/api/app/signup', { body: { name, password } })).body;

test('the bundled copies of the shared server modules are current', () => {
  execFileSync(process.execPath, [path.join(ROOT, 'scripts/supabase-bundle.mjs'), '--check'], { stdio: 'pipe' });
});

test('signup, sign in, the token, wrong passwords and the pause', async () => {
  const s = server();
  const ana = await signup(s, 'Ana');
  assert.ok(ana.token);
  assert.deepEqual(ana.user, { id: ana.user.id, name: 'Ana', admin: true }, 'the first profile is the admin');
  const ben = await signup(s, 'Ben', PW + ' two');
  assert.equal(ben.user.admin, false);
  assert.equal((await s.call('POST', '/api/app/signup', { body: { name: 'ana', password: PW + ' x' } })).status, 409);
  assert.equal((await s.call('POST', '/api/app/signup', { body: { name: 'Cleo', password: 'short' } })).body.code, 'too-short');

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
