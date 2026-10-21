/* Olympus social layer: the store's rules on their own (social.js), then the same flows through
   the real server.js in a child process, with sessions minted the way the other server tests do. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { boundPort } from './helpers.mjs';
import { createSocial, cleanWorkout, LIMITS } from '../social.js';

const API = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function store(t, users) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-social-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  let clock = 1_000_000;
  const s = createSocial({ dataDir: dir, write: (f, c) => fs.writeFileSync(f, c), users: () => users, now: () => clock });
  return { s, dir, tick: ms => { clock += ms; } };
}

const ANNA = { id: 'u_anna', name: 'Anna' };
const BEN = { id: 'u_ben', name: 'Ben Stone' };
const CARL = { id: 'u_carl', name: 'Carl', disabled: true };

test('following decides the feed; discover shows every post', t => {
  const { s } = store(t, [ANNA, BEN]);
  const a = s.createPost(ANNA, { text: 'leg day' });
  const b = s.createPost(BEN, { text: 'bench PR' });
  assert.deepEqual(s.feed(ANNA).posts.map(p => p.id), [a.id], 'only her own post before following');
  s.follow(ANNA, BEN.id);
  assert.deepEqual(s.feed(ANNA).posts.map(p => p.id), [b.id, a.id], 'newest first, both now');
  assert.deepEqual(s.discover(BEN).posts.map(p => p.id), [b.id, a.id]);
  s.follow(ANNA, BEN.id, false);
  assert.deepEqual(s.feed(ANNA).posts.map(p => p.id), [a.id], 'unfollow takes them out again');
});

test('counts, search and the no-self-follow rule', t => {
  const { s } = store(t, [ANNA, BEN, CARL]);
  s.follow(ANNA, BEN.id);
  s.createPost(BEN, { text: 'hi' });
  const [ben] = s.search(ANNA, 'stone');
  assert.equal(ben.id, BEN.id);
  assert.equal(ben.followers, 1);
  assert.equal(ben.posts, 1);
  assert.equal(ben.isFollowing, true);
  assert.deepEqual(s.search(ANNA, 'carl'), [], 'a disabled profile cannot be found');
  assert.deepEqual(s.search(ANNA, '').map(u => u.id), [BEN.id], 'never yourself, never disabled');
  assert.throws(() => s.follow(ANNA, ANNA.id), /yourself/);
  assert.throws(() => s.follow(ANNA, CARL.id), /not found/);
});

test('likes and comments, and who may delete what', t => {
  const { s } = store(t, [ANNA, BEN]);
  const p = s.createPost(ANNA, { text: 'deadlift day' });
  assert.equal(s.like(BEN, p.id).likes, 1);
  assert.equal(s.like(BEN, p.id).likes, 1, 'a second like does not count twice');
  assert.equal(s.like(BEN, p.id, false).likes, 0);
  const withComment = s.comment(BEN, p.id, ' strong! ');
  assert.equal(withComment.comments[0].text, 'strong!');
  const cid = withComment.comments[0].id;
  // The post's author may remove a comment under it; nobody else but the commenter may.
  assert.equal(s.deleteComment(ANNA, p.id, cid).comments.length, 0);
  assert.throws(() => s.deletePost(BEN, p.id), /only the author/);
  assert.deepEqual(s.deletePost(BEN, p.id, { asAdmin: true }), { ok: true });
  assert.throws(() => s.like(ANNA, p.id), /not found/);
});

test('a post needs content, and its workout is bounded to the summary fields', t => {
  const { s } = store(t, [ANNA]);
  assert.throws(() => s.createPost(ANNA, { text: '   ' }), /needs text or a workout/);
  const p = s.createPost(ANNA, {
    workout: {
      name: 'Push', d: '2026-10-20', durMs: 3600000, vol: 5230.5, unit: 'kg', sets: 18, prs: 2,
      exercises: Array.from({ length: 40 }, (_, i) => ({ n: 'Ex ' + i, sets: 3, best: '80 kg × 5' })),
      entries: [{ secret: 'the whole session' }],
    },
  });
  assert.equal(p.workout.exercises.length, LIMITS.workoutExercises);
  assert.equal(p.workout.entries, undefined, 'unknown fields are dropped');
  assert.equal(p.workout.vol, 5230.5);
  assert.equal(cleanWorkout({ d: 'not a date', name: 'x' }).d, null);
  assert.equal(cleanWorkout('nope'), null);
});

test('paging is strict: no post repeats and none falls between pages', t => {
  const { s } = store(t, [ANNA, BEN]);
  // Same clock for all: the store must still give each post its own timestamp. Two authors, so
  // the hourly limit of one profile is not what the test runs into.
  const ids = Array.from({ length: 45 }, (_, i) => s.createPost(i % 2 ? BEN : ANNA, { text: 'p' + i }).id)
  const seen = [];
  let before;
  for (;;) {
    const page = s.discover(ANNA, { before });
    seen.push(...page.posts.map(p => p.id));
    if (!page.next) break;
    before = page.next;
  }
  assert.deepEqual(seen, ids.slice().reverse());
});

test('the hourly post limit holds and lapses', t => {
  const { s, tick } = store(t, [ANNA]);
  for (let i = 0; i < LIMITS.postsPerHour; i++) s.createPost(ANNA, { text: 'p' + i });
  assert.throws(() => s.createPost(ANNA, { text: 'one more' }), /too many/);
  tick(3600001);
  assert.ok(s.createPost(ANNA, { text: 'next hour' }).id);
});

test('removing a user takes everything of theirs out', t => {
  const users = [ANNA, BEN];
  const { s } = store(t, users);
  const p = s.createPost(ANNA, { text: 'mine' });
  s.createPost(BEN, { text: 'his' });
  s.follow(ANNA, BEN.id); s.follow(BEN, ANNA.id);
  s.like(BEN, p.id); s.comment(BEN, p.id, 'nice');
  s.removeUser(BEN.id);
  users.splice(1, 1);
  const doc = s._doc();
  assert.deepEqual(doc.posts.map(x => x.text), ['mine']);
  assert.deepEqual(doc.posts[0].likes, []);
  assert.deepEqual(doc.posts[0].comments, []);
  assert.deepEqual(doc.follows, {});
});

test('the document survives a restart and an unreadable file is kept aside', t => {
  const { s, dir } = store(t, [ANNA]);
  s.createPost(ANNA, { text: 'persisted' });
  const again = createSocial({ dataDir: dir, write: (f, c) => fs.writeFileSync(f, c), users: () => [ANNA] });
  assert.equal(again.discover(ANNA).posts[0].text, 'persisted');
  fs.writeFileSync(path.join(dir, 'social.json'), '{broken');
  const errors = [];
  const orig = console.error; console.error = m => errors.push(m);
  try { createSocial({ dataDir: dir, write: () => {}, users: () => [ANNA] }); } finally { console.error = orig; }
  assert.ok(fs.readdirSync(dir).some(f => f.startsWith('social.json.unreadable-')));
  assert.ok(errors.some(m => /cannot be read/.test(m)));
});

/* ---------------- through the server ---------------- */

const SECRET = crypto.randomBytes(32).toString('hex');
const mint = uid => {
  const payload = `${uid}:${Date.now() + 86400000}:0`;
  return payload + '.' + crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
};
const ORIGIN = 'http://localhost:8080';

async function server(t) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-social-srv-'));
  fs.writeFileSync(path.join(dataDir, 'secret'), SECRET, { mode: 0o600 });
  fs.writeFileSync(path.join(dataDir, 'db.json'), JSON.stringify({
    users: [
      { id: 'u_adm', name: 'Admin', created: new Date().toISOString(), admin: true },
      { id: ANNA.id, name: ANNA.name, created: new Date().toISOString() },
      { id: BEN.id, name: BEN.name, created: new Date().toISOString() },
    ],
    creds: [], subs: [], invites: [],
  }));
  const child = spawn(process.execPath, ['server.js'], {
    cwd: API, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: '0', DATA_DIR: dataDir, ORIGIN, RP_ID: 'localhost' },
  });
  let log = '';
  child.stdout.on('data', d => log += d);
  child.stderr.on('data', d => log += d);
  t.after(() => { child.kill('SIGKILL'); fs.rmSync(dataDir, { recursive: true, force: true }); });
  const port = await boundPort(child, () => log);
  const base = `http://127.0.0.1:${port}`;
  const call = async (uid, method, p, body) => {
    const headers = { 'Content-Type': 'application/json', Origin: ORIGIN };
    if (uid) headers.Cookie = `gymsid=${mint(uid)}`;
    const r = await fetch(base + p, { method, headers, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json() };
  };
  return { call, dataDir, log: () => log };
}

test('server: every social route needs a session', async t => {
  const h = await server(t);
  for (const [m, p] of [['GET', '/api/social/feed'], ['GET', '/api/social/search'], ['POST', '/api/social/posts']]) {
    const r = await h.call(null, m, p, m === 'POST' ? { text: 'x' } : undefined);
    assert.equal(r.status, 401, `${m} ${p}`);
  }
});

test('server: search, follow, post, like, comment, feed', async t => {
  const h = await server(t);
  const found = await h.call(ANNA.id, 'GET', '/api/social/search?q=ben');
  assert.equal(found.status, 200);
  assert.deepEqual(found.body.users.map(u => u.id), [BEN.id]);

  assert.equal((await h.call(ANNA.id, 'POST', '/api/social/follow', { id: BEN.id })).body.user.isFollowing, true);
  const posted = await h.call(BEN.id, 'POST', '/api/social/posts', { text: 'Push day', workout: { name: 'Push', sets: 12 } });
  assert.equal(posted.status, 200);
  const id = posted.body.post.id;

  const feed = await h.call(ANNA.id, 'GET', '/api/social/feed');
  assert.deepEqual(feed.body.posts.map(p => p.id), [id]);
  assert.equal(feed.body.posts[0].author.name, BEN.name);

  assert.equal((await h.call(ANNA.id, 'POST', '/api/social/posts/like', { id })).body.post.likes, 1);
  const c = await h.call(ANNA.id, 'POST', '/api/social/posts/comment', { id, text: 'beast' });
  assert.equal(c.body.post.comments[0].author.id, ANNA.id);

  const prof = await h.call(ANNA.id, 'GET', `/api/social/profile?id=${BEN.id}`);
  assert.equal(prof.body.user.followers, 1);
  assert.equal(prof.body.posts.length, 1);

  // Anna is not the author; an admin may take the post down.
  assert.equal((await h.call(ANNA.id, 'POST', '/api/social/posts/delete', { id })).status, 403);
  assert.equal((await h.call('u_adm', 'POST', '/api/social/posts/delete', { id })).status, 200);
  assert.equal((await h.call(ANNA.id, 'POST', '/api/social/posts/like', { id })).status, 404);

  assert.ok(fs.existsSync(path.join(h.dataDir, 'social.json')));
  assert.equal(h.log().split('\n').filter(l => /^\s+at /.test(l)).length, 0, 'no stack traces:\n' + h.log());
});

test('server: deleting an account removes its social data', async t => {
  const h = await server(t);
  await h.call(BEN.id, 'POST', '/api/social/posts', { text: 'bye' });
  await h.call(ANNA.id, 'POST', '/api/social/follow', { id: BEN.id });
  assert.equal((await h.call('u_adm', 'POST', '/api/admin/user/delete', { id: BEN.id })).status, 200);
  const doc = JSON.parse(fs.readFileSync(path.join(h.dataDir, 'social.json'), 'utf8'));
  assert.deepEqual(doc.posts, []);
  assert.deepEqual(doc.follows, {});
});
