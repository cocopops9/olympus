/* The personal medal model (medal-model.js): the lookup the medal tiers read, and its route on
   both servers. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { medalGains, handleMedalTargets, MODEL_WEEKS, MODEL_LIFTS } from '../medal-model.js';
import { MEDAL_MODEL } from '../medal-model-data.js';
import { createApp, memoryStore, memoryPhotos } from '../../supabase/functions/olympus/core.js';

const P = { sex: 'male', lift: 'bench', age: 35, bwRatio: 1, z0: 0 };

test('the horizons and lifts are the ones the app reads', () => {
  assert.deepEqual(MODEL_WEEKS, [6, 16, 40, 80, 156]);
  assert.deepEqual(MODEL_LIFTS, ['squat', 'bench', 'deadlift']);
});

test('a grid point reads back exactly, and gains never fall with time', () => {
  const { age, bwRatio, z0 } = MEDAL_MODEL.axes;
  const g = medalGains({ sex: 'female', lift: 'squat', age: age[3], bwRatio: bwRatio[2], z0: z0[4] });
  assert.deepEqual(g, MEDAL_MODEL.gain[1][0][3][2][4].map(v => Math.round(v * 1000) / 1000));
  for (const s of [0, 1]) for (const l of [0, 1, 2]) for (const a of MEDAL_MODEL.gain[s][l]) for (const b of a) for (const h of b)
    for (let i = 1; i < h.length; i++) assert.ok(h[i] >= h[i - 1] - 1e-9);
});

test('between grid points it interpolates, outside the grid it holds the edge', () => {
  const lo = medalGains({ ...P, z0: 0 }), hi = medalGains({ ...P, z0: 0.5 }), mid = medalGains({ ...P, z0: 0.25 });
  for (let i = 0; i < 5; i++) assert.ok(Math.abs(mid[i] - (lo[i] + hi[i]) / 2) <= 0.0011);
  assert.deepEqual(medalGains({ ...P, age: 99 }), medalGains({ ...P, age: 70 }));
  assert.deepEqual(medalGains({ ...P, z0: -9 }), medalGains({ ...P, z0: -2 }));
});

test('a lifter near the top has far less left to gain than a beginner', () => {
  const novice = medalGains({ ...P, z0: -1 }), elite = medalGains({ ...P, z0: 2.5 });
  assert.ok(elite[4] < novice[4] / 4);
});

test('profiles it cannot read are left out', () => {
  assert.equal(medalGains({ ...P, sex: 'x' }), null);
  assert.equal(medalGains({ ...P, lift: 'curl' }), null);
  assert.equal(medalGains({ ...P, z0: NaN }), null);
  const r = handleMedalTargets({ items: [{ key: 'bench', ...P }, { key: 'curl', ...P, lift: 'curl' }, { ...P }] });
  assert.deepEqual(Object.keys(r.gains), ['bench']);
  assert.deepEqual(handleMedalTargets(null), { weeks: MODEL_WEEKS, gains: {} });
  const many = handleMedalTargets({ items: Array.from({ length: 60 }, (_, i) => ({ key: 'k' + i, ...P })) });
  assert.equal(Object.keys(many.gains).length, 40);
});

test('Supabase: the route needs a signed-in profile', async () => {
  const app = createApp({ store: memoryStore(), photos: memoryPhotos() });
  const call = async (method, p, body, token) => {
    const res = await app.handle(new Request('https://x.test/functions/v1/olympus' + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body && JSON.stringify(body) }));
    return { status: res.status, body: await res.json() };
  };
  const { token } = (await call('POST', '/api/app/signup', { name: 'ada_lifts', email: 'ada@example.com', password: 'correct horse battery staple' })).body;
  assert.equal((await call('POST', '/api/medals/targets', { items: [] })).status, 401);
  const r = await call('POST', '/api/medals/targets', { items: [{ key: 'bench', ...P }] }, token);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.gains.bench, medalGains(P));
});
