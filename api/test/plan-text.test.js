/* A workout or plan written as text, turned into routines by Hercules or Athena (hercules.js
   handlePlanText): the model's JSON checked and bounded, the message spent and given back, and
   both servers' routes. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { herculesConfig, parsePlanText, handlePlanText, PLAN_TEXT } from '../hercules.js';
import { createApp, memoryStore, memoryPhotos } from '../../supabase/functions/olympus/core.js';

const fakeFetch = (answers, seen = []) => async (url, init) => {
  const body = JSON.parse(init.body);
  seen.push({ url, model: body.model, messages: body.messages, temperature: body.temperature, max_tokens: body.max_tokens, response_format: body.response_format });
  const a = answers.shift() || { status: 200, reply: '{}' };
  return { ok: a.status === 200, status: a.status, statusText: 'x', json: async () => (a.status === 200 ? { choices: [{ message: { content: a.reply } }] } : { error: { message: 'nope' } }) };
};

const PUSH = JSON.stringify({
  kind: 'workout', name: 'Spinta',
  routines: [{ name: 'Spinta', days: [], exercises: [
    { name: 'barbell bench press', sets: 4, reps: 8, repsMin: 6, weight: 80, seconds: 0, minutes: 0, superset: '', note: 'RPE 8' },
    { name: 'dumbbell lateral raise', sets: 3, reps: 15, repsMin: 12, weight: 10, superset: 'A', note: '' },
    { name: 'cable triceps pushdown (v-bar)', sets: 3, reps: 12, weight: 25, superset: 'A' },
    { name: 'plank', sets: 3, seconds: 45, reps: 10 },
  ] }],
  comment: '',
});

test('the model\'s answer is checked and bounded', () => {
  const p = parsePlanText('```json\n' + PUSH + '\n```');
  assert.equal(p.kind, 'workout');
  assert.equal(p.name, 'Spinta');
  const [bench, raise, , plank] = p.routines[0].exercises;
  assert.deepEqual(bench, { name: 'barbell bench press', sets: 4, reps: 8, repsMin: 6, weight: 80, seconds: 0, minutes: 0, superset: '', note: 'RPE 8' });
  assert.equal(raise.superset, 'A');
  // a hold has seconds and no reps
  assert.equal(plank.seconds, 45);
  assert.equal(plank.reps, 0);
  // out of range, missing or nonsense values
  const q = parsePlanText(JSON.stringify({ kind: 'x', routines: [
    { name: 'A', days: [1, 1, 9, -1, '3'], exercises: [{ name: 'squat', sets: 99, reps: 5, repsMin: 8, weight: 100.26 }, { name: '' }, { name: 'run', minutes: 25, reps: 10, sets: 0 }] },
    { name: 'B', exercises: [] },
    { exercises: [{ name: 'row' }] },
  ] }));
  assert.equal(q.kind, 'plan');
  assert.equal(q.routines.length, 2);
  assert.deepEqual(q.routines[0].days, [1, 3]);
  const [sq, run] = q.routines[0].exercises;
  assert.equal(sq.sets, 20);
  assert.equal(sq.repsMin, 0);       // a "range" whose bottom is above its top is no range
  assert.equal(sq.weight, 100.5);
  assert.equal(run.minutes, 25);
  assert.equal(run.reps, 0);
  assert.equal(run.sets, 1);
  assert.equal(q.routines[1].name, '3');
  assert.equal(q.routines[1].exercises[0].reps, 10);
  assert.equal(q.routines[1].exercises[0].sets, 3);
  // too many routines or exercises are cut
  const many = parsePlanText(JSON.stringify({ routines: Array.from({ length: 30 }, (_, i) => ({ name: 'R' + i, exercises: Array.from({ length: 30 }, () => ({ name: 'curl', sets: 3, reps: 10 })) })) }));
  assert.equal(many.sessions.length, PLAN_TEXT.sessions);
  assert.equal(many.routines[0].exercises.length, PLAN_TEXT.items);
  // not a plan
  assert.equal(parsePlanText('{"error": "not a workout"}'), null);
  assert.equal(parsePlanText('Sure! Here is your plan.'), null);
  assert.equal(parsePlanText('{"routines": []}'), null);
});

test('one message of the coach, given back when nothing usable came out', async () => {
  let doc = null;
  const quota = async fn => { doc = fn(doc); };
  const user = { id: 'u1', name: 'ada' };
  const config = { ...herculesConfig({ HERCULES_API_KEY: 'k', HERCULES_PER_DAY: '3' }), coach: 'hercules' };
  const now = Date.parse('2026-11-10T10:00:00Z');
  const seen = [];
  const r = await handlePlanText({ user, body: { text: 'Panca 4x6-8 80kg RPE 8...', lang: 'it', unit: 'kg', custom: ['My band row'] }, config, quota, now, fetchImpl: fakeFetch([{ status: 200, reply: PUSH }], seen) });
  assert.equal(r.left, 2);
  assert.equal(r.plan.routines[0].exercises.length, 4);
  assert.equal(seen[0].temperature, 0.2);
  assert.equal(seen[0].max_tokens, PLAN_TEXT.replyTokens);
  assert.deepEqual(seen[0].response_format, { type: 'json_object' });
  assert.match(seen[0].messages[0].content, /in kg/);
  assert.match(seen[0].messages[0].content, /Italian/);
  assert.match(seen[0].messages[0].content, /My band row/);
  assert.match(seen[0].messages[1].content, /Panca 4x6-8/);
  // prose instead of the JSON, from both models: the message comes back
  await assert.rejects(handlePlanText({ user, body: { text: 'hello there' }, config, quota, now, fetchImpl: fakeFetch([{ status: 200, reply: 'Hi!' }, { status: 200, reply: '{"error":"not a workout"}' }]) }), e => e.code === 'plan-text-unclear' && e.status === 422);
  assert.equal(doc.used.u1, 1);
  // the main model out of quota: the fallback answers
  const seen2 = [];
  const f = await handlePlanText({ user, body: { text: 'squat 5x5', unit: 'lb' }, config, quota, now, fetchImpl: fakeFetch([{ status: 429 }, { status: 200, reply: PUSH }], seen2) });
  assert.equal(seen2[1].model, config.fallback);
  assert.match(seen2[0].messages[0].content, /in lb/);
  assert.equal(f.left, 1);
  // both fail: given back
  await assert.rejects(handlePlanText({ user, body: { text: 'squat 5x5' }, config, quota, now, fetchImpl: fakeFetch([{ status: 500 }, { status: 500 }]) }), e => e.code === 'hercules-failed');
  assert.equal(doc.used.u1, 2);
  // nothing to read costs nothing
  await assert.rejects(handlePlanText({ user, body: { text: ' ' }, config, quota, now, fetchImpl: fakeFetch([]) }), e => e.code === 'plan-text-empty');
  assert.equal(doc.used.u1, 2);
});

test('both servers\' routes: Hercules and Athena each read with their own model and count', async () => {
  const seen = [];
  const app = createApp({ store: memoryStore(), photos: memoryPhotos(), env: { HERCULES_API_KEY: 'k' }, fetchImpl: fakeFetch([{ status: 200, reply: PUSH }, { status: 200, reply: PUSH }, { status: 200, reply: PUSH }, { status: 200, reply: PUSH }], seen) });
  const call = async (p, body, token) => {
    const res = await app.handle(new Request('https://x.supabase.co/functions/v1/olympus' + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) }));
    return { status: res.status, body: await res.json() };
  };
  const { token } = (await call('/api/app/signup', { name: 'ada_lifts', email: 'ada@example.com', password: 'correct horse battery staple' })).body;
  assert.equal((await call('/api/hercules/plan', { text: 'bench 3x5' })).status, 401);
  const h = await call('/api/hercules/plan', { text: 'bench 3x5' }, token);
  assert.equal(h.status, 200);
  assert.equal(h.body.plan.routines[0].exercises[0].name, 'barbell bench press');
  const a = await call('/api/athena/plan', { text: 'bench 3x5' }, token);
  assert.equal(a.status, 200);
  assert.equal(seen[0].model, herculesConfig({}, 'hercules').model);
  assert.equal(seen[2].model, herculesConfig({}, 'athena').model);   // each asked twice: the line was not named
  assert.equal(h.body.left, a.body.left);   // each coach's own count
});

/* ---- a dated plan, and the lines a model leaves out ---- */
import { exerciseLines, missedLines } from '../hercules.js';

const WEEK_TEXT = [
  'Tuesday Nov 10: A, Push + lats',
  '* A1 Lever incline chest press: 3 × 6 to 10 at 1 to 2 RIR, rest 90 s, 100 kg. Do 1 to 2 ramp sets first.',
  '* A2 Lever front pulldown: 3 × 8 to 12 at 1 to 2 RIR, rest 90 s, 79 kg.',
  'Thursday Nov 12: football (1 h)',
  'Saturday Nov 14: rest',
].join('\n');

const WEEK = sessions => JSON.stringify({ kind: 'plan', name: 'Nov 10 to 14', comment: '', sessions });
const A_FULL = { name: 'A Push + lats', date: '2026-11-10', days: [], items: [
  { line: 2, name: 'lever incline chest press', sets: 3, reps: 10, repsMin: 6, weight: 100, restSec: 90, warmupSets: 2, group: 'A', note: '1 to 2 RIR' },
  { line: 3, name: 'lever front pulldown', sets: 3, reps: 12, repsMin: 8, weight: 79, restSec: 90, group: 'a', note: '1 to 2 RIR' },
] };
const FOOTBALL = { name: 'Football', date: '2026-11-12', items: [{ line: 4, name: 'football', activity: true, minutes: 60 }] };
const REST = { name: 'Rest', date: '2026-11-14', rest: true, items: [] };

test('a dated plan: sessions with their dates, rest, ramp sets, groups, activities and rest days', () => {
  const p = parsePlanText(WEEK([A_FULL, FOOTBALL, REST, { name: 'bad date', date: '2026-02-30', items: [] }]));
  assert.equal(p.sessions.length, 3);
  const [a, f, r] = p.sessions;
  assert.equal(a.date, '2026-11-10');
  assert.deepEqual(a.days, [2]);   // the weekday of its date
  assert.deepEqual(a.items.map(e => [e.line, e.restSec, e.warmupSets, e.group]), [[2, 90, 2, 'A'], [3, 90, 0, 'A']]);
  assert.equal(f.items[0].activity, true);
  assert.equal(f.items[0].minutes, 60);
  assert.equal(f.items[0].sets, 1);
  assert.equal(r.rest, true);
  // the first version's shape, for an app that predates sessions
  assert.equal(p.routines.length, 2);
  assert.equal(p.routines[0].exercises[1].superset, 'A');
  // only rest days is no plan
  assert.equal(parsePlanText(WEEK([REST])), null);
});

test('every exercise line has to be read: the model is asked again for the ones it left out', async () => {
  assert.deepEqual(exerciseLines(WEEK_TEXT), [2, 3]);
  const lazy = WEEK([{ ...A_FULL, items: A_FULL.items.slice(0, 1) }, FOOTBALL, REST]);
  assert.deepEqual(missedLines(WEEK_TEXT, parsePlanText(lazy)), [3]);
  let doc = null;
  const quota = async fn => { doc = fn(doc); };
  const user = { id: 'u1' };
  const config = { ...herculesConfig({ HERCULES_API_KEY: 'k' }), coach: 'hercules' };
  const seen = [];
  const r = await handlePlanText({ user, body: { text: WEEK_TEXT, today: '2026-11-10' }, config, quota, fetchImpl: fakeFetch([{ status: 200, reply: lazy }, { status: 200, reply: WEEK([A_FULL, FOOTBALL, REST]) }], seen) });
  assert.equal(seen.length, 2);
  assert.match(seen[0].messages[1].content, /^The text:\nL1: Tuesday Nov 10/);
  assert.match(seen[0].messages[0].content, /today is 2026-11-10, a Tuesday/);
  assert.match(seen[1].messages.at(-1).content, /L3: \* A2 Lever front pulldown/);
  assert.equal(r.plan.sessions[0].items.length, 2);
  assert.deepEqual(r.missed, []);
  // still lazy the second time: the first answer stays, and the line goes back to the app
  const r2 = await handlePlanText({ user, body: { text: WEEK_TEXT }, config, quota, fetchImpl: fakeFetch([{ status: 200, reply: lazy }, { status: 200, reply: lazy }]) });
  assert.deepEqual(r2.missed.map(m => m.line), [3]);
  assert.match(r2.missed[0].text, /Lever front pulldown/);
});

test('an interval run comes back as its segments, and a set to failure as a flag', () => {
  const plan = parsePlanText(JSON.stringify({ kind: 'workout', name: 'HIIT', sessions: [{ name: 'HIIT', items: [
    { line: 3, name: 'run on treadmill', activity: true, minutes: 21, sets: 1, intervals: [
      { minutes: 1, speed: 12, restSec: 0 }, { minutes: 0.5, speed: 17.5, restSec: 0 }, { minutes: 1, speed: 12, restSec: 420 }, { minutes: 0, speed: 9 }, { minutes: 0.3, speed: 99, restSec: 5000 },
    ] },
    { line: 4, name: 'lever lateral raise', sets: 1, reps: 20, repsMin: 12, toFailure: true },
  ] }] }));
  const [run, raise] = plan.sessions[0].items;
  assert.deepEqual(run.intervals, [
    { minutes: 1, speed: 12, restSec: 0 }, { minutes: 0.5, speed: 17.5, restSec: 0 }, { minutes: 1, speed: 12, restSec: 420 }, { minutes: 0.25, speed: 40, restSec: 1800 },
  ]);
  assert.equal(run.sets, 4);
  assert.equal(run.minutes, 0);
  assert.equal(run.activity, false);
  assert.equal(raise.toFailure, true);
  assert.deepEqual(raise.intervals, []);
});
