#!/usr/bin/env node
// Olympus: the live server checked the way the phone uses it. Two fresh profiles sign up, sync a
// training document (with a conflict), post with a photo, follow, like, read notifications, go
// private, answer a request and block. Every step prints a line; a failure is a GitHub error
// annotation and exit code 1.
//   OLYMPUS_SERVER=https://<ref>.supabase.co/functions/v1/olympus node scripts/supabase-e2e.mjs
const BASE = (process.env.OLYMPUS_SERVER || '').replace(/\/+$/, '');
if (!BASE) { console.error('set OLYMPUS_SERVER'); process.exit(2); }
const tag = 'e2e' + Date.now().toString(36);
let failed = 0;
const ok = (cond, what, extra = '') => {
  if (cond) console.log('ok   ' + what);
  else { failed++; console.log(`::error title=Olympus e2e::${what} ${extra}`.slice(0, 900)); }
};
async function call(method, path, { body, token, raw } = {}) {
  const res = await fetch(BASE + path, {
    method, headers: { 'Content-Type': 'application/json', Origin: 'https://localhost', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (raw) return res;
  let data = null; try { data = await res.json(); } catch { /* not json */ }
  return { status: res.status, body: data, headers: res.headers };
}

const t0 = Date.now();
const cfg = await call('GET', '/api/config');
ok(cfg.status === 200 && cfg.body?.password_login === true, 'config says password sign-in', JSON.stringify(cfg.body));
ok(cfg.headers.get('access-control-allow-origin') === 'https://localhost', 'CORS answers the app origin');
const pre = await fetch(BASE + '/api/data', { method: 'OPTIONS', headers: { Origin: 'https://localhost', 'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Headers': 'authorization,content-type' } });
ok(pre.status === 204 && /authorization/i.test(pre.headers.get('access-control-allow-headers') || ''), 'preflight allows Authorization', String(pre.status));

const A = await call('POST', '/api/app/signup', { body: { name: tag + ' Ana', password: 'e2e correct horse battery A' } });
const B = await call('POST', '/api/app/signup', { body: { name: tag + ' Ben', password: 'e2e correct horse battery B' } });
ok(A.status === 200 && A.body.token && B.status === 200, 'two profiles sign up', JSON.stringify([A.body, B.body]));
const a = A.body.token, b = B.body.token, aid = A.body.user.id, bid = B.body.user.id;
const login = await call('POST', '/api/app/login', { body: { identifier: tag + ' ana', password: 'e2e correct horse battery A' } });
ok(login.status === 200 && login.body.token, 'sign in by name, any case');
ok((await call('GET', '/api/me', { token: a })).body?.user?.id === aid, '/api/me knows the token');

// Sync
const put1 = await call('PUT', '/api/data', { token: a, body: { state: { workouts: [{ id: 'w1', d: '2026-10-20', name: 'Push', entries: [] }], routines: [], active: { x: 1 } }, baseRev: 0 } });
ok(put1.status === 200 && put1.body.rev === 1, 'first push stores revision 1', JSON.stringify(put1.body));
const rev = await call('GET', '/api/data/rev', { token: a });
ok(rev.body?.rev === 1 && rev.body?.wid === put1.body.wid, 'revision check', JSON.stringify(rev.body));
const got = await call('GET', '/api/data', { token: a });
ok(got.body?.state?.workouts?.[0]?.id === 'w1' && !('active' in (got.body?.state || {})), 'pull returns the document without the live workout');
const stale = await call('PUT', '/api/data', { token: a, body: { state: { workouts: [], routines: [] }, baseRev: 0 } });
ok(stale.status === 409 && stale.body?.state?.workouts?.[0]?.id === 'w1', 'a stale push is a conflict carrying the current copy', String(stale.status));
const put2 = await call('PUT', '/api/data', { token: a, body: { state: { ...got.body.state, workouts: [...got.body.state.workouts, { id: 'w2', d: '2026-10-21', name: 'Pull', entries: [] }] }, baseRev: 1, baseWid: put1.body.wid } });
ok(put2.status === 200 && put2.body.rev === 2, 'a push over the current copy succeeds', JSON.stringify(put2.body));
ok((await call('GET', '/api/data', { token: b })).body?.state === null, 'each profile sees only its own document');

// Social, with a photo (a minimal JPEG carrying an EXIF block that must not survive)
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x08, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0xff, 0xda, 0x00, 0x02, 0x11, 0x22, 0xff, 0xd9]);
const up = await call('POST', '/api/social/photos', { token: b, body: { data: 'data:image/jpeg;base64,' + jpeg.toString('base64') } });
ok(up.status === 200 && up.body?.id, 'photo upload', JSON.stringify(up.body));
const post = await call('POST', '/api/social/posts', { token: b, body: { text: tag + ' leg day', photos: [up.body.id] } });
ok(post.status === 200 && post.body?.post?.photos?.length === 1, 'post with the photo', JSON.stringify(post.body));
const disc = await call('GET', '/api/social/discover', { token: a });
ok(disc.body?.posts?.some(p => p.id === post.body.post.id), 'the other profile discovers it');
const pic = await call('GET', '/api/social/photo?id=' + up.body.id, { token: a, raw: true });
const bytes = Buffer.from(await pic.arrayBuffer());
ok(pic.status === 200 && pic.headers.get('content-type') === 'image/jpeg' && bytes[0] === 0xff && !bytes.includes(Buffer.from('Exif')), 'photo served, metadata stripped', `${pic.status} ${bytes.length}`);
await call('POST', '/api/social/follow', { token: a, body: { id: bid } });
await call('POST', '/api/social/posts/like', { token: a, body: { id: post.body.post.id } });
await call('POST', '/api/social/posts/comment', { token: a, body: { id: post.body.post.id, text: 'strong' } });
const feed = await call('GET', '/api/social/feed', { token: a });
ok(feed.body?.posts?.[0]?.likes === 1 && feed.body.posts[0].comments.length === 1, 'feed shows the like and the comment', JSON.stringify(feed.body?.posts?.[0] || feed.body));
const notes = await call('GET', '/api/social/notifications', { token: b });
ok(['follow', 'like', 'comment'].every(k => notes.body?.items?.some(n => n.kind === k)), 'notifications for follow, like and comment', JSON.stringify(notes.body));
await call('POST', '/api/social/profile', { token: a, body: { private: true, bio: 'e2e' } });
const asked = await call('POST', '/api/social/follow', { token: b, body: { id: aid } });
ok(asked.body?.user?.requested === true, 'following a private profile is a request', JSON.stringify(asked.body));
const answered = await call('POST', '/api/social/requests/answer', { token: a, body: { id: bid, accept: true } });
ok(Array.isArray(answered.body?.users) && answered.body.users.length === 0, 'the request is answered');
await call('POST', '/api/social/block', { token: a, body: { id: bid } });
const after = await call('GET', '/api/social/photo?id=' + up.body.id, { token: a });
ok(after.status === 404, 'blocked: their photo is no longer reachable', String(after.status));
const del = await call('POST', '/api/social/posts/delete', { token: b, body: { id: post.body.post.id } });
ok(del.status === 200, 'the author deletes the post');

// Leave nothing behind: both test profiles delete themselves.
for (const [tok, pw, who] of [[a, 'e2e correct horse battery A', 'Ana'], [b, 'e2e correct horse battery B', 'Ben']]) {
  const gone = await call('POST', '/api/account/delete', { token: tok, body: { password: pw } });
  ok(gone.status === 200, `test profile ${who} deletes itself`, JSON.stringify(gone.body));
}
ok((await call('GET', '/api/me', { token: a })).status === 401, 'a deleted profile is signed out');

console.log(`${failed ? 'FAILED' : 'passed'} in ${Date.now() - t0} ms`);
if (!failed) console.log('::notice title=Olympus e2e::all checks passed against ' + BASE);
process.exit(failed ? 1 : 0);
