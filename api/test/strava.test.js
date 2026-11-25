/* Strava on the Supabase server (supabase/functions/olympus/strava.js and its routes in core.js):
   connect through Strava's OAuth with a signed state, keep the tokens sealed, post each workout
   once, refresh a token that ran out, and forget a connection Strava revoked. Strava itself is a
   fake here: a fetch that answers the way developers.strava.com documents. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp, memoryStore, memoryPhotos } from '../../supabase/functions/olympus/core.js';
import { stravaConfig, authorizeUrl, cleanActivity, canWrite, trimPosted, POSTED_KEEP } from '../../supabase/functions/olympus/strava.js';

const BASE = 'https://proj.supabase.co/functions/v1/olympus';
const ENV = { SUPABASE_URL: 'https://proj.supabase.co', STRAVA_CLIENT_ID: '12345', STRAVA_CLIENT_SECRET: 'shh-secret' };
const PW = 'correct horse battery staple';
const T0 = Date.parse('2026-11-25T12:00:00Z');

function fakeStrava() {
  const calls = [];
  const s = {
    calls, nextId: 1000, revoked: false, refuse: null, unknownSports: new Set(),
    access: 'a'.repeat(40), refresh: 'r'.repeat(40),
  };
  s.fetch = async (url, init = {}) => {
    const body = Object.fromEntries(new URLSearchParams(init.body || ''));
    calls.push({ url: String(url), body, auth: init.headers?.Authorization || null });
    const reply = (status, b) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });
    if (url === 'https://www.strava.com/oauth/token') {
      if (body.client_secret !== ENV.STRAVA_CLIENT_SECRET) return reply(401, { message: 'Bad Request' });
      if (body.grant_type === 'authorization_code') {
        if (body.code !== 'good-code') return reply(400, { message: 'Bad Request', errors: [{ field: 'code', code: 'invalid' }] });
        return reply(200, { token_type: 'Bearer', expires_at: Math.floor(T0 / 1000) + 21600, expires_in: 21600, refresh_token: s.refresh, access_token: s.access, athlete: { id: 77, firstname: 'Ana', lastname: 'Rossi' } });
      }
      if (body.grant_type === 'refresh_token') {
        if (s.revoked || body.refresh_token !== s.refresh) return reply(400, { message: 'Bad Request', errors: [{ field: 'refresh_token', code: 'invalid' }] });
        s.access = 'b'.repeat(40); s.refresh = 'q'.repeat(40);
        return reply(200, { token_type: 'Bearer', access_token: s.access, refresh_token: s.refresh, expires_at: Math.floor(s.clock.t / 1000) + 21600 });
      }
    }
    if (url === 'https://www.strava.com/oauth/deauthorize') return reply(200, { access_token: body.access_token });
    if (url === 'https://www.strava.com/api/v3/activities') {
      if (init.headers?.Authorization !== 'Bearer ' + s.access || s.revoked) return reply(401, { message: 'Authorization Error' });
      if (s.refuse) return reply(400, { message: 'Bad Request', errors: [{ field: s.refuse, code: 'invalid' }] });
      if (s.unknownSports.has(body.sport_type)) return reply(400, { message: 'Bad Request', errors: [{ resource: 'Activity', field: 'sport_type', code: 'invalid' }] });
      return reply(201, { id: s.nextId++, name: body.name, sport_type: body.sport_type });
    }
    return reply(404, { message: 'Record Not Found' });
  };
  return s;
}

function server(env = ENV) {
  const clock = { t: T0 };
  const strava = fakeStrava();
  strava.clock = clock;
  const store = memoryStore();
  const app = createApp({ store, photos: memoryPhotos(), now: () => clock.t, env, fetchImpl: strava.fetch });
  const call = async (method, p, { body, token } = {}) => {
    const res = await app.handle(new Request(BASE + p, {
      method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    }));
    const type = res.headers.get('content-type') || '';
    return { status: res.status, body: type.includes('json') ? await res.json() : await res.text(), type };
  };
  return { app, store, call, clock, strava };
}
const signup = async (s, name) => (await s.call('POST', '/api/app/signup', { body: { name, password: PW, email: name.toLowerCase() + '@example.com' } })).body;

// Taps Connect, then plays Strava sending the browser back with `code` and `scope`.
async function connect(s, token, { code = 'good-code', scope = 'read,activity:write' } = {}) {
  const r = await s.call('POST', '/api/strava/connect', { token, body: {} });
  assert.equal(r.status, 200);
  const state = new URL(r.body.url).searchParams.get('state');
  return s.call('GET', '/api/strava/callback?' + new URLSearchParams({ state, code, scope }));
}

const WORKOUT = { wid: 'w1', name: 'Push day', sport_type: 'WeightTraining', start_date_local: '2026-11-25T18:00:00', elapsed_time: 3600, description: 'Bench press\n80×5, 80×5' };

test('the config needs both secrets, and the redirect is this function’s callback', () => {
  assert.equal(stravaConfig({ STRAVA_CLIENT_ID: '1' }), null);
  assert.deepEqual(stravaConfig(ENV), { id: '12345', secret: 'shh-secret', redirect: 'https://proj.supabase.co/functions/v1/olympus/api/strava/callback' });
  assert.equal(stravaConfig({ ...ENV, STRAVA_REDIRECT_URI: 'https://x.example/cb' }).redirect, 'https://x.example/cb');
  const u = new URL(authorizeUrl(stravaConfig(ENV), 'st', { mobile: true }));
  assert.equal(u.origin + u.pathname, 'https://www.strava.com/oauth/mobile/authorize');
  assert.equal(u.searchParams.get('scope'), 'read,activity:write');
  assert.equal(u.searchParams.get('response_type'), 'code');
  assert.ok(canWrite('read,activity:write'));
  assert.ok(!canWrite('read'));
});

test('a server without a Strava application says so', async () => {
  const s = server({ SUPABASE_URL: ENV.SUPABASE_URL });
  const { token } = await signup(s, 'Ana');
  assert.deepEqual((await s.call('GET', '/api/strava', { token })).body, { available: false, on: false });
  assert.equal((await s.call('POST', '/api/strava/connect', { token, body: {} })).body.code, 'no-strava');
});

test('connect: the approval lands on the profile that asked, with the tokens sealed', async () => {
  const s = server();
  const { token, user } = await signup(s, 'Ana');
  assert.deepEqual((await s.call('GET', '/api/strava', { token })).body, { available: true, on: false });
  const r = await s.call('POST', '/api/strava/connect', { token, body: {} });
  const u = new URL(r.body.url);
  assert.equal(u.origin + u.pathname, 'https://www.strava.com/oauth/authorize');
  assert.equal(u.searchParams.get('client_id'), '12345');
  assert.equal(u.searchParams.get('redirect_uri'), BASE + '/api/strava/callback');
  assert.ok(!r.body.url.includes('shh-secret'), 'the client secret never leaves the server');

  const back = await connect(s, token);
  assert.equal(back.status, 200);
  assert.match(back.type, /text\/plain/);
  assert.match(back.body, /Strava is connected/);
  const st = (await s.call('GET', '/api/strava', { token })).body;
  assert.equal(st.on, true);
  assert.deepEqual(st.athlete, { id: 77, name: 'Ana Rossi' });
  const doc = s.store.docs.get('strava:' + user.id);
  assert.ok(doc.a && doc.r);
  assert.ok(!JSON.stringify(doc).includes(s.strava.access) && !JSON.stringify(doc).includes(s.strava.refresh), 'tokens are kept sealed, not in plain');
});

test('callback: a forged, expired or scope-less approval connects nothing', async () => {
  const s = server();
  const { token } = await signup(s, 'Ana');
  const forged = await s.call('GET', '/api/strava/callback?' + new URLSearchParams({ state: 'strava:someone:9999999999999:x.bad', code: 'good-code', scope: 'read,activity:write' }));
  assert.equal(forged.status, 400);

  const r = await s.call('POST', '/api/strava/connect', { token, body: {} });
  const state = new URL(r.body.url).searchParams.get('state');
  s.clock.t += 11 * 60 * 1000;
  assert.equal((await s.call('GET', '/api/strava/callback?' + new URLSearchParams({ state, code: 'good-code', scope: 'read,activity:write' }))).status, 400, 'a state older than ten minutes is refused');

  const noWrite = await connect(s, token, { scope: 'read' });
  assert.match(noWrite.body, /permission to upload/);
  const denied = await s.call('GET', '/api/strava/callback?' + new URLSearchParams({ state: new URL((await s.call('POST', '/api/strava/connect', { token, body: {} })).body.url).searchParams.get('state'), error: 'access_denied' }));
  assert.match(denied.body, /not connected/);
  const badCode = await connect(s, token, { code: 'nope' });
  assert.equal(badCode.status, 502);
  assert.equal((await s.call('GET', '/api/strava', { token })).body.on, false);
});

test('post: one activity per workout, sent with the athlete’s token', async () => {
  const s = server();
  const { token } = await signup(s, 'Ana');
  assert.equal((await s.call('POST', '/api/strava/post', { token, body: WORKOUT })).body.code, 'strava-off', 'nothing to post to before connecting');
  await connect(s, token);

  const first = await s.call('POST', '/api/strava/post', { token, body: WORKOUT });
  assert.equal(first.status, 200);
  assert.equal(first.body.id, '1000');
  const sent = s.strava.calls.filter(c => c.url.endsWith('/api/v3/activities'));
  assert.equal(sent.length, 1);
  assert.equal(sent[0].auth, 'Bearer ' + s.strava.access);
  assert.deepEqual(sent[0].body, { name: 'Push day', sport_type: 'WeightTraining', start_date_local: '2026-11-25T18:00:00', elapsed_time: '3600', description: 'Bench press\n80×5, 80×5' });

  const again = await s.call('POST', '/api/strava/post', { token, body: WORKOUT });
  assert.deepEqual(again.body, { id: '1000', again: true });
  assert.equal(s.strava.calls.filter(c => c.url.endsWith('/api/v3/activities')).length, 1, 'a second post of the same workout is not sent');
  assert.equal((await s.call('GET', '/api/strava', { token })).body.posted, 1);
});

test('post: an expired token is refreshed first; a revoked one disconnects', async () => {
  const s = server();
  const { token } = await signup(s, 'Ana');
  await connect(s, token);
  s.clock.t += 7 * 3600 * 1000;
  const r = await s.call('POST', '/api/strava/post', { token, body: WORKOUT });
  assert.equal(r.status, 200);
  assert.equal(s.strava.access, 'b'.repeat(40));
  assert.equal(s.strava.calls.at(-1).auth, 'Bearer ' + 'b'.repeat(40), 'posted with the new token');

  s.strava.revoked = true;
  const gone = await s.call('POST', '/api/strava/post', { token, body: { ...WORKOUT, wid: 'w2' } });
  assert.equal(gone.status, 409);
  assert.equal(gone.body.code, 'strava-off');
  assert.equal((await s.call('GET', '/api/strava', { token })).body.on, false);
});

test('post: a sport type Strava does not know goes as a Workout; a refused activity is not retried', async () => {
  const s = server();
  const { token } = await signup(s, 'Ana');
  await connect(s, token);
  s.strava.unknownSports.add('Capoeira');
  const r = await s.call('POST', '/api/strava/post', { token, body: { ...WORKOUT, sport_type: 'Capoeira' } });
  assert.equal(r.status, 200);
  assert.equal(s.strava.calls.at(-1).body.sport_type, 'Workout');

  s.strava.refuse = 'start_date_local';
  const refused = await s.call('POST', '/api/strava/post', { token, body: { ...WORKOUT, wid: 'w9' } });
  assert.equal(refused.status, 422);
  assert.equal(refused.body.code, 'strava-refused');
  s.strava.refuse = null;
  assert.equal((await s.call('POST', '/api/strava/post', { token, body: { ...WORKOUT, wid: 'w9' } })).status, 422, 'remembered as refused');
});

test('post: what the app sends is checked', async () => {
  assert.throws(() => cleanActivity({ ...WORKOUT, wid: '' }), /which workout/);
  assert.throws(() => cleanActivity({ ...WORKOUT, start_date_local: '2026-11-25 18:00' }), /not complete/);
  assert.throws(() => cleanActivity({ ...WORKOUT, elapsed_time: 0 }), /not complete/);
  assert.throws(() => cleanActivity({ ...WORKOUT, sport_type: 'Weight Training' }), /not complete/);
  const c = cleanActivity({ ...WORKOUT, name: 'x'.repeat(500), distance: 5012.34, trainer: true, extra: 'dropped' });
  assert.equal(c.name.length, 200);
  assert.equal(c.distance, 5012.3);
  assert.equal(c.trainer, 1);
  assert.ok(!('extra' in c));
  const many = Object.fromEntries(Array.from({ length: POSTED_KEEP + 5 }, (_, i) => ['w' + i, String(i)]));
  const kept = trimPosted(many);
  assert.equal(Object.keys(kept).length, POSTED_KEEP);
  assert.ok(!('w0' in kept) && 'w' + (POSTED_KEEP + 4) in kept, 'the oldest go first');
});

test('disconnect ends the grant on Strava and forgets the tokens; so does deleting the account', async () => {
  const s = server();
  const ana = await signup(s, 'Ana');
  await connect(s, ana.token);
  assert.equal((await s.call('POST', '/api/strava/delete', { token: ana.token, body: {} })).status, 200);
  assert.ok(s.strava.calls.some(c => c.url.endsWith('/oauth/deauthorize') && c.body.access_token === s.strava.access));
  assert.equal((await s.call('GET', '/api/strava', { token: ana.token })).body.on, false);
  assert.ok(!s.store.docs.has('strava:' + ana.user.id));

  const ben = await signup(s, 'Ben');
  await connect(s, ben.token);
  assert.ok(s.store.docs.has('strava:' + ben.user.id));
  assert.equal((await s.call('POST', '/api/account/delete', { token: ben.token, body: { password: PW } })).status, 200);
  assert.ok(!s.store.docs.has('strava:' + ben.user.id));
});
