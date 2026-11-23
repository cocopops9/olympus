// The connector's write tools (mcp/src/write-tools.js) through the real connector
// (supabase/functions/olympus/connector.js) and the app's own data routes (core.js), on the
// in-memory store.
//
// What would show it wrong, decided before writing it:
//   - a change Claude makes is not what the app reads back (GET /api/data), or reaches another
//     profile;
//   - a phone that changed something at the same time loses Claude's change, or Claude's change
//     wipes the phone's, once the app merges the two (sync-merge.js mergeStates, what the app runs
//     after the revision moved);
//   - a removal comes back when an older copy of the phone is merged in;
//   - a delete goes through without confirm: true, or a failed call saves anything;
//   - the stdio server (read-only) or a read-only caller is offered the write tools.
import { describe, test, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { buildDemoState } from '../../frontend/src/lib/demoSeed.js'
import { mergeStates } from '../../frontend/src/lib/sync-merge.js'
import { TOOLS } from '../src/tools.js'
import { WRITE_TOOLS, epochAt, resolveExercise } from '../src/write-tools.js'
import { answerMessage, toolDefinitions } from '../src/remote.js'
import { createApp, memoryStore, memoryPhotos } from '../../supabase/functions/olympus/core.js'
import { createConnector } from '../../supabase/functions/olympus/connector.js'

const TODAY = '2026-07-27'
const APP = 'https://proj.supabase.co/functions/v1/olympus'
const CONNECTOR = 'https://proj.functions.supabase.co/olympus-mcp'
const PW = 'correct horse battery staple'
const BENCH = '0025'          // barbell bench press

beforeAll(() => { vi.useFakeTimers({ now: new Date(TODAY + 'T12:00:00Z'), toFake: ['Date'] }) })
afterAll(() => { vi.useRealTimers() })

function world() {
  const clock = { t: Date.parse(TODAY + 'T12:00:00Z') }
  const store = memoryStore()
  const app = createApp({ store, photos: memoryPhotos(), now: () => clock.t, env: { SUPABASE_URL: 'https://proj.supabase.co' } })
  const connector = createConnector({ store, now: () => clock.t })
  const call = async (method, p, { body, token } = {}) => {
    const res = await app.handle(new Request(APP + p, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body)
    }))
    return { status: res.status, body: await res.json() }
  }
  const signup = async name => (await call('POST', '/api/app/signup', { body: { name, password: PW, email: name.toLowerCase() + '@example.com' } })).body
  let seq = 0
  const tool = async (url, name, args = {}) => {
    const res = await connector.handle(new Request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++seq, method: 'tools/call', params: { name, arguments: args } })
    }))
    const r = (await res.json()).result
    return { isError: !!r.isError, text: r.content[0].text, json: r.isError ? null : JSON.parse(r.content[0].text) }
  }
  const data = async token => (await call('GET', '/api/data', { token })).body
  return { clock, store, call, signup, tool, data }
}

describe('who is offered the write tools', () => {
  test('the stdio list and a caller that cannot save get the read tools only', async () => {
    const names = toolDefinitions().map(t => t.name)
    expect(names).toEqual(TOOLS.map(t => t.name))
    const listed = await answerMessage({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, { load: null })
    expect(listed.result.tools.map(t => t.name)).toEqual(names)
    const call = await answerMessage({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'log_bodyweight', arguments: { weight: 80 } } }, { load: null })
    expect(call.error.code).toBe(-32602)
  })

  test('with a save, every write tool is listed as a write, and the removals as destructive', () => {
    const defs = toolDefinitions(true)
    for (const t of WRITE_TOOLS) {
      const d = defs.find(x => x.name === t.name)
      expect(d.annotations.readOnlyHint).toBe(false)
      expect(d.annotations.destructiveHint).toBe(t.name.startsWith('delete_'))
    }
  })
})

describe('writing through the connector', () => {
  let w, ana, ben, url
  beforeEach(async () => {
    w = world()
    ana = await w.signup('Ana')
    ben = await w.signup('Ben')
    const a = buildDemoState(); a.unit = 'kg'
    const b = buildDemoState(); b.unit = 'kg'; b.workouts = []; b.bodyweight = [{ d: TODAY, w: 91.5, t: 1 }]
    expect((await w.call('PUT', '/api/data', { token: ana.token, body: { state: a } })).status).toBe(200)
    expect((await w.call('PUT', '/api/data', { token: ben.token, body: { state: b } })).status).toBe(200)
    url = (await w.call('POST', '/api/connector', { token: ana.token, body: {} })).body.url
  })

  test('a logged workout is in the app\'s copy, on this profile only, with a new revision', async () => {
    const before = await w.data(ana.token)
    const r = await w.tool(url, 'log_workout', {
      date: '2026-07-25', start_time: '07:30', duration_min: 50, name: 'Chest',
      exercises: [{ exercise: BENCH, sets: [{ weight: 60, reps: 8, warmup: true }, { weight: 80, reps: 5 }, { weight: 80, reps: 5, rir: 1 }] }]
    })
    expect(r.isError).toBe(false)
    const after = await w.data(ana.token)
    expect(after.rev).toBe(before.rev + 1)
    const saved = after.state.workouts.find(x => x.id === r.json.saved.id)
    expect(saved).toMatchObject({ d: '2026-07-25', name: 'Chest', end: saved.start + 50 * 60000 })
    expect(saved.entries[0]).toMatchObject({ id: BENCH, topW: 80 })
    expect(saved.entries[0].sets).toEqual([{ done: true, w: 60, r: 8, warmup: true }, { done: true, w: 80, r: 5 }, { done: true, w: 80, r: 5, rir: 1 }])
    expect(after.state.workouts.length).toBe(before.state.workouts.length + 1)
    // and the read tools see it, the way Stats does
    const listed = await w.tool(url, 'get_workout', { date: '2026-07-25' })
    expect(JSON.stringify(listed.json)).toContain('Chest')
    expect((await w.data(ben.token)).state.workouts).toEqual([])
  })

  test('a phone that changed something meanwhile keeps its change and Claude\'s once it merges', async () => {
    const phone = await w.data(ana.token)                    // what the phone last read
    const r = await w.tool(url, 'log_workout', { date: '2026-07-26', exercises: [{ exercise: BENCH, sets: [{ weight: 82.5, reps: 5 }] }] })
    const bw = await w.tool(url, 'log_bodyweight', { weight: 77.7, date: '2026-07-26' })
    expect(bw.isError).toBe(false)
    // the phone, offline, logs its own weigh-in and renames a routine (the app stamps both)
    const mine = structuredClone(phone.state)
    w.clock.t += 1000
    mine.bodyweight.push({ d: TODAY, w: 78.1, t: w.clock.t })
    mine.routines[0].name = 'Push A'; mine.routines[0]._ts = w.clock.t
    mine._ts = w.clock.t
    const put = await w.call('PUT', '/api/data', { token: ana.token, body: { state: mine, baseRev: phone.rev, stamped: true } })
    expect(put.status).toBe(409)                              // the revision moved: the app merges
    const merged = mergeStates(mine, put.body.state)
    expect(merged.workouts.some(x => x.id === r.json.saved.id)).toBe(true)
    expect(merged.bodyweight.find(b => b.d === '2026-07-26').w).toBe(77.7)
    expect(merged.bodyweight.find(b => b.d === TODAY).w).toBe(78.1)
    expect(merged.routines[0].name).toBe('Push A')
  })

  test('an edit by Claude and a note added on the phone to the same workout are both kept', async () => {
    const id = (await w.tool(url, 'log_workout', { date: '2026-07-26', exercises: [{ exercise: BENCH, sets: [{ weight: 80, reps: 5 }] }] })).json.saved.id
    const phone = await w.data(ana.token)
    w.clock.t += 1000
    const ed = await w.tool(url, 'edit_workout', { workout_id: id, exercises: [{ exercise: BENCH, sets: [{ weight: 85, reps: 5 }] }] })
    expect(ed.json.saved.exercises[0].sets[0].w).toBe(85)
    const mine = structuredClone(phone.state)
    w.clock.t += 1000
    const pw = mine.workouts.find(x => x.id === id)
    pw.note = 'felt strong'; pw._ts = w.clock.t; pw._f = { note: w.clock.t }
    const server = await w.data(ana.token)
    const merged = mergeStates(mine, server.state).workouts.find(x => x.id === id)
    expect(merged.note).toBe('felt strong')
    expect(merged.entries[0].sets[0].w).toBe(85)
  })

  test('removals need confirm: true, and stay removed when an older copy of the phone merges in', async () => {
    const phone = await w.data(ana.token)
    const victim = phone.state.workouts[phone.state.workouts.length - 1]
    const no = await w.tool(url, 'delete_workout', { workout_id: String(victim.id) })
    expect(no.isError).toBe(true)
    expect(no.text).toMatch(/confirm/)
    expect((await w.data(ana.token)).rev).toBe(phone.rev)                 // nothing saved
    const yes = await w.tool(url, 'delete_workout', { workout_id: String(victim.id), confirm: true })
    expect(yes.isError).toBe(false)
    const day = phone.state.bodyweight[phone.state.bodyweight.length - 1].d
    expect((await w.tool(url, 'delete_bodyweight', { date: day, confirm: true })).isError).toBe(false)
    const server = await w.data(ana.token)
    expect(server.state.workouts.some(x => x.id === victim.id)).toBe(false)
    const merged = mergeStates(structuredClone(phone.state), server.state)
    expect(merged.workouts.some(x => x.id === victim.id)).toBe(false)
    expect(merged.bodyweight.some(b => b.d === day)).toBe(false)
  })

  test('routines: made, planned on a weekday, changed keeping their own settings, deleted off the plan', async () => {
    const made = await w.tool(url, 'create_routine', { name: 'Upper', exercises: [{ exercise: BENCH, sets: 4, reps: 6, weight: 70, rest_sec: 150 }, { exercise: 'barbell bent over row' }] })
    expect(made.isError).toBe(false)
    const rid = made.json.saved.id
    expect(made.json.saved.exercises[0]).toMatchObject({ id: BENCH, sets: 4, reps: 6, weight: 70, rest_sec: 150 })
    expect(made.json.saved.exercises[1]).toMatchObject({ sets: 3, reps: 10 })
    expect((await w.tool(url, 'set_week_plan', { weekday: 2, routine_ids: [rid] })).isError).toBe(false)
    const plan = (await w.tool(url, 'get_week_plan')).json
    expect(plan.weekdays[2].routine_ids).toEqual([rid])
    // a setting the app has and the tools do not (a pyramid) survives an edit of the list
    const doc = w.store.docs.get('state:' + ana.user.id)
    doc.routines.find(r => r.id === rid).ex[0].pyramid = [8, 6, 4, 4]
    const ed = await w.tool(url, 'edit_routine', { routine_id: rid, name: 'Upper A', exercises: [{ exercise: BENCH, weight: 72.5 }] })
    expect(ed.isError).toBe(false)
    const r = (await w.data(ana.token)).state.routines.find(x => x.id === rid)
    expect(r.name).toBe('Upper A')
    expect(r.ex).toHaveLength(1)
    expect(r.ex[0]).toMatchObject({ id: BENCH, sets: 4, weight: 72.5, pyramid: [8, 6, 4, 4] })
    expect((await w.tool(url, 'plan_day', { date: '2026-07-29', routine_id: rid })).isError).toBe(false)
    expect((await w.tool(url, 'delete_routine', { routine_id: rid, confirm: true })).isError).toBe(false)
    const after = (await w.data(ana.token)).state
    expect(after.routines.some(x => x.id === rid)).toBe(false)
    expect(after.week['2']).toBeUndefined()
    expect(after.dayPlan['2026-07-29']).toBeUndefined()
  })

  test('an exercise that is not exactly one is not guessed, and nothing is saved', async () => {
    const before = (await w.data(ana.token)).rev
    const r = await w.tool(url, 'log_workout', { exercises: [{ exercise: 'bench press', sets: [{ weight: 80, reps: 5 }] }] })
    expect(r.isError).toBe(true)
    expect(r.text).toMatch(/0025 \(barbell bench press\)/)
    expect((await w.data(ana.token)).rev).toBe(before)
    const found = await w.tool(url, 'search_exercises', { query: 'bench press', limit: 3 })
    expect(found.json.results[0].id).toBeTruthy()
  })

  test('a profile that never synced is told to open the app first', async () => {
    const cy = await w.signup('Cyra')
    const u = (await w.call('POST', '/api/connector', { token: cy.token, body: {} })).body.url
    const r = await w.tool(u, 'log_bodyweight', { weight: 70 })
    expect(r.isError).toBe(true)
    expect(r.text).toMatch(/^ENOSTATE/)
  })
})

describe('helpers', () => {
  test('a local time becomes the right instant in the profile\'s time zone, across DST', () => {
    expect(new Date(epochAt('2026-11-23', '18:00', 'Europe/Rome')).toISOString()).toBe('2026-11-23T17:00:00.000Z')
    expect(new Date(epochAt('2026-07-23', '18:00', 'Europe/Rome')).toISOString()).toBe('2026-07-23T16:00:00.000Z')
    expect(new Date(epochAt('2026-07-23', '18:00', 'UTC')).toISOString()).toBe('2026-07-23T18:00:00.000Z')
  })
  test('an exercise by id, by exact name, or an error naming the closest', () => {
    expect(resolveExercise(BENCH, {})).toBe(BENCH)
    expect(resolveExercise('Barbell Bench Press', {})).toBe(BENCH)
    expect(resolveExercise('my sled', { customEx: [{ id: 'c1', n: 'My Sled' }] })).toBe('c1')
    expect(() => resolveExercise('zzzz qqqq', {})).toThrow(/search_exercises/)
  })
})
