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
import { createSocial, cleanWorkout, stripJpeg, stripPng, photoType, LIMITS } from '../social.js';

const API = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function store(t, users) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-social-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  let clock = 1_000_000;
  const pushes = [];
  const s = createSocial({ dataDir: dir, write: (f, c) => fs.writeFileSync(f, c), users: () => users, now: () => clock, onNotify: (uid, note) => pushes.push({ uid, ...note }) });
  return { s, dir, pushes, tick: ms => { clock += ms; } };
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
  assert.throws(() => s.createPost(ANNA, { text: '   ' }), /needs text, a workout or a photo/);
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

/* ---------------- private profiles, requests, blocks ---------------- */

const DANA = { id: 'u_dana', name: 'Dana' };

test('a private profile: following asks first, posts wait for the answer', t => {
  const { s, pushes } = store(t, [ANNA, BEN, DANA]);
  s.setProfile(ANNA, { private: true });
  const secret = s.createPost(ANNA, { text: 'only for friends' });
  // Findable, with counts, but no posts and no lists.
  const prof = s.profile(BEN, ANNA.id);
  assert.equal(prof.user.private, true);
  assert.equal(prof.user.canSeePosts, false);
  assert.deepEqual(prof.posts, []);
  assert.deepEqual(s.discover(BEN).posts, []);
  assert.throws(() => s.post(BEN, secret.id), /not found/);
  assert.throws(() => s.like(BEN, secret.id), /not found/);
  assert.throws(() => s.connections(BEN, ANNA.id, 'followers'), /private/);

  const asked = s.follow(BEN, ANNA.id);
  assert.equal(asked.isFollowing, false);
  assert.equal(asked.requested, true);
  assert.deepEqual(s.requests(ANNA).map(u => u.id), [BEN.id]);
  assert.equal(s.notifications(ANNA).requests, 1);
  assert.equal(pushes.at(-1).kind, 'request');

  s.answerRequest(ANNA, BEN.id, true);
  assert.deepEqual(s.requests(ANNA), []);
  assert.equal(s.profile(BEN, ANNA.id).user.isFollowing, true);
  assert.deepEqual(s.feed(BEN).posts.map(p => p.id), [secret.id]);
  assert.equal(s.notifications(BEN).items[0].kind, 'accepted');

  // Taking access back: remove the follower.
  s.removeFollower(ANNA, BEN.id);
  assert.deepEqual(s.feed(BEN).posts, []);

  // A declined request leaves nothing behind; going public lets the waiting in.
  s.follow(DANA, ANNA.id);
  s.answerRequest(ANNA, DANA.id, false);
  assert.equal(s.profile(DANA, ANNA.id).user.requested, false);
  s.follow(DANA, ANNA.id);
  s.setProfile(ANNA, { private: false });
  assert.equal(s.profile(DANA, ANNA.id).user.isFollowing, true);
  assert.deepEqual(s.requests(ANNA), []);
});

test('cancelling a request takes the notification back too', t => {
  const { s } = store(t, [ANNA, BEN]);
  s.setProfile(ANNA, { private: true });
  s.follow(BEN, ANNA.id);
  s.follow(BEN, ANNA.id, false);
  assert.deepEqual(s.requests(ANNA), []);
  assert.equal(s.notifications(ANNA).items.length, 0);
});

test('a block cuts both ways and leaves no connection behind', t => {
  const { s } = store(t, [ANNA, BEN, DANA]);
  s.follow(ANNA, BEN.id); s.follow(BEN, ANNA.id);
  const benPost = s.createPost(BEN, { text: 'ben' });
  const annaPost = s.createPost(ANNA, { text: 'anna' });
  s.comment(BEN, annaPost.id, 'from ben');
  s.comment(DANA, annaPost.id, 'from dana');

  s.block(ANNA, BEN.id);
  // Follows gone both ways.
  assert.equal(s.profile(ANNA, BEN.id).user.isFollowing, false);
  assert.equal(s.profile(ANNA, BEN.id).user.followsMe, false);
  // The blocked one cannot find, open or reach the blocker.
  assert.deepEqual(s.search(BEN, 'anna'), []);
  assert.throws(() => s.profile(BEN, ANNA.id), /not found/);
  assert.throws(() => s.follow(BEN, ANNA.id), /not found/);
  assert.throws(() => s.comment(BEN, annaPost.id, 'still here?'), /not found/);
  // Neither sees the other's posts; the blocker no longer sees the blocked one's comments.
  assert.ok(!s.discover(ANNA).posts.some(p => p.id === benPost.id));
  assert.ok(!s.discover(BEN).posts.some(p => p.id === annaPost.id));
  assert.deepEqual(s.post(ANNA, annaPost.id).comments.map(c => c.text), ['from dana']);
  // The blocker can still open the profile, to unblock it, and cannot follow it until then.
  assert.equal(s.profile(ANNA, BEN.id).user.blockedByMe, true);
  assert.throws(() => s.follow(ANNA, BEN.id), /unblock/);
  assert.deepEqual(s.blockedList(ANNA).map(u => u.id), [BEN.id]);
  // Notifications from the blocked profile are gone and no new ones arrive.
  assert.ok(!s.notifications(ANNA).items.some(n => n.from.id === BEN.id));

  s.block(ANNA, BEN.id, false);
  assert.deepEqual(s.blockedList(ANNA), []);
  assert.equal(s.search(BEN, 'anna').length, 1);
  assert.throws(() => s.block(ANNA, ANNA.id), /yourself/);
});

/* ---------------- notifications ---------------- */

test('likes, comments and follows notify the author, once each, never yourself', t => {
  const { s, pushes } = store(t, [ANNA, BEN]);
  const p = s.createPost(ANNA, { text: 'pr day' });
  s.like(ANNA, p.id);                      // your own like: nothing
  s.like(BEN, p.id); s.like(BEN, p.id, false); s.like(BEN, p.id);
  s.comment(BEN, p.id, 'huge');
  s.follow(BEN, ANNA.id);
  const n = s.notifications(ANNA);
  assert.deepEqual(n.items.map(x => x.kind), ['follow', 'comment', 'like']);
  assert.equal(n.unread, 3);
  assert.equal(n.items[1].text, 'huge');
  assert.equal(n.items[2].postId, p.id);
  assert.deepEqual(pushes.map(x => x.kind), ['like', 'like', 'comment', 'follow']);
  assert.equal(pushes[0].fromName, BEN.name);
  assert.equal(s.markRead(ANNA).unread, 0);
  // Switched off: still listed in the app, no push.
  s.setProfile(ANNA, { pushSocial: false });
  s.comment(BEN, p.id, 'again');
  assert.equal(pushes.length, 4);
  assert.equal(s.notifications(ANNA).unread, 1);
  assert.equal(s.profile(ANNA, '').user.pushSocial, false);
});

test('a deleted post takes its notifications with it', t => {
  const { s } = store(t, [ANNA, BEN]);
  const p = s.createPost(ANNA, { text: 'x' });
  s.like(BEN, p.id);
  s.deletePost(ANNA, p.id);
  assert.equal(s.notifications(ANNA).items.length, 0);
});

/* ---------------- photos ---------------- */

const seg = (marker, body) => Buffer.concat([Buffer.from([0xff, marker]), Buffer.from([(body.length + 2) >> 8, (body.length + 2) & 255]), body]);
function jpeg() {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    seg(0xe0, Buffer.from('JFIF\0\x01\x01\0\0\x01\0\x01\0\0', 'latin1')),
    seg(0xe1, Buffer.from('Exif\0\0GPS 45.4064N 11.8768E', 'latin1')),
    seg(0xfe, Buffer.from('a private comment', 'latin1')),
    seg(0xdb, Buffer.from([0, 1, 2, 3])),
    seg(0xda, Buffer.from([1, 2, 3, 4])), Buffer.from([9, 9, 9, 9]), Buffer.from([0xff, 0xd9]),
  ]);
}
const chunk = (type, data) => Buffer.concat([Buffer.from([0, 0, data.length >> 8, data.length & 255]), Buffer.from(type, 'latin1'), data, Buffer.alloc(4)]);
function png() {
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', Buffer.alloc(13)), chunk('tEXt', Buffer.from('Location\0Padova', 'latin1')), chunk('IDAT', Buffer.from([1, 2])), chunk('IEND', Buffer.alloc(0))]);
}

test('a photo loses its metadata, keeps its picture', () => {
  const clean = stripJpeg(jpeg());
  assert.equal(photoType(clean), 'jpg');
  const text = clean.toString('latin1');
  assert.ok(text.includes('JFIF'));
  assert.ok(!text.includes('GPS') && !text.includes('private comment'));
  assert.ok(clean.subarray(-6).equals(Buffer.from([9, 9, 9, 9, 0xff, 0xd9])), 'image data untouched');
  const p = stripPng(png());
  assert.ok(!p.toString('latin1').includes('Padova'));
  assert.ok(p.toString('latin1').includes('IDAT'));
  assert.equal(stripJpeg(Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff])), null, 'a segment longer than the file');
  assert.equal(photoType(Buffer.from('GIF89a')), null);
});

test('photos attach to one post of their owner, follow its visibility, and go with it', t => {
  const { s, dir, tick } = store(t, [ANNA, BEN, DANA]);
  const { id } = s.uploadPhoto(ANNA, jpeg().toString('base64'));
  const onDisk = path.join(dir, 'social-photos', id + '.jpg');
  assert.ok(fs.existsSync(onDisk));
  assert.ok(!fs.readFileSync(onDisk, 'latin1').includes('GPS'));
  assert.throws(() => s.photo(BEN, id), /not found/, 'not posted yet: only its owner');
  assert.throws(() => s.createPost(BEN, { photos: [id] }), /unknown photo/, 'someone else’s photo');
  const p = s.createPost(ANNA, { photos: [id] });
  assert.deepEqual(p.photos, [id]);
  assert.equal(s.photo(BEN, id).type, 'image/jpeg');
  assert.throws(() => s.createPost(ANNA, { photos: [id] }), /unknown photo/, 'already on a post');
  // Private now: only accepted followers see the photo.
  s.setProfile(ANNA, { private: true });
  assert.throws(() => s.photo(DANA, id), /not found/);
  s.deletePost(ANNA, p.id);
  assert.ok(!fs.existsSync(onDisk));

  // Refusals.
  assert.throws(() => s.uploadPhoto(ANNA, Buffer.from('GIF89a....').toString('base64')), /JPEG and PNG/);
  assert.throws(() => s.uploadPhoto(ANNA, 'not base64 !!'), /base64/);
  assert.throws(() => s.uploadPhoto(ANNA, Buffer.alloc(LIMITS.photoBytes + 10, 0xff).toString('base64')), /too large/);
  assert.throws(() => s.createPost(ANNA, { photos: ['a', 'b', 'c', 'd', 'e'] }), /at most 4/);

  // Never posted: swept after a day.
  const orphan = s.uploadPhoto(ANNA, png().toString('base64'));
  assert.equal(s.sweepOrphans(), 0);
  tick(LIMITS.photoOrphanMs + 1);
  assert.equal(s.sweepOrphans(), 1);
  assert.throws(() => s.photo(ANNA, orphan.id), /not found/);
});

test('a profile picture: shown on the profile and its posts, seen past private, replaced cleanly', t => {
  const { s, dir, tick } = store(t, [ANNA, BEN, DANA]);
  const first = s.uploadPhoto(ANNA, jpeg().toString('base64')).id;
  const onDisk = id => path.join(dir, 'social-photos', id + '.jpg');
  assert.throws(() => s.setProfile(BEN, { avatar: first }), /unknown photo/, 'someone else’s photo');
  assert.equal(s.setProfile(ANNA, { avatar: first }).avatar, first);
  s.setProfile(ANNA, { private: true });
  // A private profile's picture is still seen: it is how people recognise whom to ask.
  assert.equal(s.profile(DANA, ANNA.id).user.avatar, first);
  assert.equal(s.photo(DANA, first).type, 'image/jpeg');
  assert.equal(s.search(BEN, 'anna')[0].avatar, first);
  // Not usable as a post photo, and never swept as an orphan.
  assert.throws(() => s.createPost(ANNA, { photos: [first] }), /unknown photo/);
  tick(LIMITS.photoOrphanMs + 1);
  assert.equal(s.sweepOrphans(), 0);
  // Authors of posts carry it.
  s.setProfile(ANNA, { private: false });
  const p = s.createPost(ANNA, { text: 'hi' });
  assert.equal(p.author.avatar, first);
  // Replacing deletes the old file; a block hides the picture.
  const second = s.uploadPhoto(ANNA, jpeg().toString('base64')).id;
  s.setProfile(ANNA, { avatar: second });
  assert.ok(!fs.existsSync(onDisk(first)));
  assert.throws(() => s.photo(ANNA, first), /not found/);
  s.block(ANNA, BEN.id, true);
  assert.throws(() => s.photo(BEN, second), /not found/);
  // Removing it.
  assert.equal(s.setProfile(ANNA, { avatar: null }).avatar, null);
  assert.ok(!fs.existsSync(onDisk(second)));
  assert.equal(s.post(DANA, p.id).author.avatar, undefined);
});

test('the founder mark comes from the user record and shows wherever the name does', t => {
  const FOUNDER = { id: 'u_found', name: 'Giuseppe', founder: true };
  const { s } = store(t, [FOUNDER, BEN]);
  s.setProfile(FOUNDER, { founder: false, bio: 'x' });
  assert.equal(s.profile(BEN, FOUNDER.id).user.founder, true, 'a request cannot take it off');
  s.setProfile(BEN, { founder: true });
  assert.equal(s.profile(FOUNDER, BEN.id).user.founder, undefined, 'nor put it on');
  const p = s.createPost(FOUNDER, { text: 'first' });
  assert.equal(p.author.founder, true);
  assert.equal(s.post(BEN, p.id).author.founder, true);
  assert.equal(s.createPost(BEN, { text: 'hi' }).author.founder, undefined);
});

test('a version 1 document is read as it was', t => {
  const { dir } = store(t, [ANNA]);
  fs.writeFileSync(path.join(dir, 'social.json'), JSON.stringify({ v: 1, follows: { u_anna: ['u_ben'] }, posts: [{ id: 'p1', uid: 'u_anna', ts: 5, text: 'old', likes: [], comments: [] }], profiles: {} }));
  const s = createSocial({ dataDir: dir, write: (f, c) => fs.writeFileSync(f, c), users: () => [ANNA, BEN] });
  assert.equal(s.discover(BEN).posts[0].text, 'old');
  // Anna follows Ben, as the old document said; nothing else appeared.
  assert.equal(s.profile(ANNA, BEN.id).user.isFollowing, true);
  assert.equal(s.profile(BEN, ANNA.id).user.followsMe, true);
  assert.equal(s.profile(BEN, ANNA.id).user.isFollowing, false);
  assert.deepEqual(s.requests(ANNA), []);
  assert.deepEqual(s.blockedList(ANNA), []);
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
  return { call, dataDir, base, log: () => log };
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

test('server: photo upload and download, private profile and block', async t => {
  const h = await server(t);
  const up = await h.call(ANNA.id, 'POST', '/api/social/photos', { data: 'data:image/jpeg;base64,' + jpeg().toString('base64') });
  assert.equal(up.status, 200);
  const posted = await h.call(ANNA.id, 'POST', '/api/social/posts', { text: 'look', photos: [up.body.id] });
  assert.deepEqual(posted.body.post.photos, [up.body.id]);
  const r = await fetch(`${h.base}/api/social/photo?id=${up.body.id}`, { headers: { Cookie: `gymsid=${mint(BEN.id)}` } });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'image/jpeg');
  assert.ok(!Buffer.from(await r.arrayBuffer()).toString('latin1').includes('GPS'));

  assert.equal((await h.call(ANNA.id, 'POST', '/api/social/profile', { private: true })).body.user.private, true);
  assert.equal((await fetch(`${h.base}/api/social/photo?id=${up.body.id}`, { headers: { Cookie: `gymsid=${mint(BEN.id)}` } })).status, 404);
  assert.equal((await h.call(BEN.id, 'POST', '/api/social/follow', { id: ANNA.id })).body.user.requested, true);
  assert.deepEqual((await h.call(ANNA.id, 'GET', '/api/social/requests')).body.users.map(u => u.id), [BEN.id]);
  await h.call(ANNA.id, 'POST', '/api/social/requests/answer', { id: BEN.id, accept: true });
  assert.equal((await h.call(BEN.id, 'GET', `/api/social/post?id=${posted.body.post.id}`)).status, 200);

  // The answered request is no longer news for Anna; the answer is news for Ben.
  assert.equal((await h.call(ANNA.id, 'GET', '/api/social/notifications')).body.requests, 0);
  const benNotes = await h.call(BEN.id, 'GET', '/api/social/notifications');
  assert.equal(benNotes.body.items[0].kind, 'accepted');
  assert.equal(benNotes.body.unread, 1);
  assert.equal((await h.call(BEN.id, 'POST', '/api/social/notifications/read')).body.unread, 0);

  assert.equal((await h.call(ANNA.id, 'POST', '/api/social/block', { id: BEN.id })).status, 200);
  assert.equal((await h.call(BEN.id, 'GET', `/api/social/profile?id=${ANNA.id}`)).status, 404);
  assert.deepEqual((await h.call(ANNA.id, 'GET', '/api/social/blocked')).body.users.map(u => u.id), [BEN.id]);
  assert.equal(h.log().split('\n').filter(l => /^\s+at /.test(l)).length, 0, 'no stack traces:\n' + h.log());
});

test('social pushes speak the profile’s language and fall back to English', async () => {
  const { socialPush } = await import('../push-messages.js');
  assert.deepEqual(socialPush('it', { kind: 'like', fromName: 'Ben' }), { title: 'Olympus', body: 'A Ben piace il tuo post', tag: 'social-like' });
  assert.equal(socialPush('es-MX', { kind: 'follow', fromName: 'Ana' }).body, 'Ana empezó a seguirte');
  assert.equal(socialPush('pt-BR', { kind: 'comment', fromName: 'Bia', text: 'boa!' }).body, 'Bia comentou: boa!');
  assert.equal(socialPush('ja', { kind: 'request', fromName: 'Ken' }).body, 'Ken wants to follow you');
});

test('a workout posted twice (an offline retry, a second device) stays one post', t => {
  const { s } = store(t, [ANNA, BEN]);
  const w = { name: 'Chest & Triceps', d: '2026-10-25', sets: 12, exercises: [{ n: 'bench press', sets: 4, best: '80 kg × 6' }] };
  const a = s.createPost(ANNA, { wid: 'mh3k2abc12', workout: w });
  const b = s.createPost(ANNA, { wid: 'mh3k2abc12', workout: w });
  assert.equal(a.id, b.id);
  assert.equal(a.wid, 'mh3k2abc12');
  assert.equal(s.discover(ANNA).posts.length, 1);
  // only the author is told which workout a post came from
  assert.equal(s.discover(BEN).posts[0].wid, undefined);
  // another profile's workout id is its own
  const c = s.createPost(BEN, { wid: 'mh3k2abc12', workout: w });
  assert.notEqual(c.id, a.id);
  // junk is not an id
  const d = s.createPost(ANNA, { wid: '../x y', workout: w });
  assert.equal(d.wid, undefined);
});

test('the author changes a post: text, photos kept, added and removed, the workout renamed', t => {
  const { s } = store(t, [ANNA, BEN]);
  const a = s.uploadPhoto(ANNA, jpeg().toString('base64')).id, b = s.uploadPhoto(ANNA, jpeg().toString('base64')).id;
  const w = { name: 'Chest', d: '2026-10-25', sets: 3, exercises: [{ n: 'bench press', sets: 3, best: '60 kg × 8' }] };
  const p = s.createPost(ANNA, { wid: 'w1', workout: w, photos: [a] });
  const edited = s.editPost(ANNA, { id: p.id, text: 'New bench PR!', photos: [a, b], workout: { ...w, name: 'Bench day' } });
  assert.equal(edited.text, 'New bench PR!');
  assert.deepEqual(edited.photos, [a, b]);
  assert.equal(edited.workout.name, 'Bench day');
  const less = s.editPost(ANNA, { id: p.id, photos: [b] });
  assert.deepEqual(less.photos, [b]);
  assert.equal(less.text, 'New bench PR!');
  assert.throws(() => s.photo(ANNA, a), /photo/);
  assert.throws(() => s.editPost(BEN, { id: p.id, text: 'mine now' }), e => e.status === 403);
  assert.throws(() => s.editPost(ANNA, { id: p.id, photos: ['nope'] }), e => e.code === 'bad-photos');
});
