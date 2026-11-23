/* The connector's write tools: what an athlete does in the app by hand, done by Claude on their
   own profile. Logging and correcting workouts and weigh-ins, building and changing routines,
   planning the week. Remote connector only (remote.js, given a `change`): the stdio server reads
   the data folder the API owns and never writes it.

   Each tool's `apply(S, args)` changes a draft of the training document in place and returns
   what Claude is told. It is pure and synchronous: the caller (supabase/functions/olympus/
   connector.js, through commitChange below) reads the stored document under its lock, runs the
   tool on a copy, stamps the change exactly as the app stamps its own (sync-merge.js stampChange),
   and saves it with a new revision. A phone open at the time sees the revision move on its next
   check (at most half a minute, or on coming back to the app), merges, and keeps both its own
   changes and these: every change carries the stamps the app's merge goes by.

   Removals need `confirm: true`: Claude is told to ask the athlete first, and the tool is marked
   destructive, so Claude's own permission prompt shows it as such. */
import { z } from 'zod'
import { exOr, EXIDX, CATALOGUE, searchExercises } from '../../frontend/src/lib/exercises.js'
import { defaultConfig, modeOf, bestWeightForEntry } from '../../frontend/src/lib/history.js'
import { deleteRoutine } from '../../frontend/src/lib/routines.js'
import { stampChange } from '../../frontend/src/lib/sync-merge.js'

const DEFAULT_GLYPH = 'figureStrength'          // lib/glyphs.js DEFAULT_GLYPH (that module loads React)
const NAME_MAX = 60
const NOTE_MAX = 500                            // lib/history.js NOTE_MAX
const MAX_EXERCISES = 30
const MAX_SETS = 30

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7)   // lib/format.js uid
const fail = (code, message) => { const e = new Error(message); e.code = code; throw e }
const isMap = v => !!v && typeof v === 'object' && !Array.isArray(v)
const clone = v => JSON.parse(JSON.stringify(v))

const isoDate = () => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD').refine(
  v => { const d = new Date(v + 'T12:00:00Z'); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v },
  { message: 'not a date the calendar has (YYYY-MM-DD)' }
)
const hhmm = () => z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'must be HH:MM, 24-hour')
const confirm = () => z.literal(true, { errorMap: () => ({ message: 'removing cannot be undone from here: ask the athlete, then pass confirm: true' }) })
const todayIn = tz => {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()) }
  catch { return new Date().toISOString().slice(0, 10) }
}
const tzOf = S => (typeof S?.reminder?.tz === 'string' && S.reminder.tz) || 'UTC'

// The instant a wall-clock time on a date has in a time zone: the UTC reading, corrected by the
// zone's offset at that moment (twice, so a time next to a DST change lands on the right side).
export function epochAt(date, time, tz) {
  const [y, mo, d] = date.split('-').map(Number)
  const [h, mi] = time.split(':').map(Number)
  const wall = Date.UTC(y, mo - 1, d, h, mi)
  const offset = at => {
    try {
      const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' })
        .formatToParts(new Date(at)).filter(x => x.type !== 'literal').map(x => [x.type, Number(x.value)]))
      return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - at
    } catch { return 0 }
  }
  let t = wall - offset(wall)
  t = wall - offset(t)
  return t
}

// 'HH:MM' of an instant on the wall clock of a time zone.
export function localTime(at, tz) {
  try { return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(at)) }
  catch { return new Date(at).toISOString().slice(11, 16) }
}

/* ---------- exercises ---------- */

const customs = S => (Array.isArray(S.customEx) ? S.customEx : [])
const nameOf = (id, S) => (customs(S).find(e => e.id === id) || exOr(id))?.n || id
const known = (id, S) => !!(EXIDX[id] || customs(S).some(e => e.id === id))

// An exercise from what Claude wrote: an id, or a name that is exactly one exercise's. Anything
// looser is not guessed at: the closest matches come back so Claude can pick (or ask).
export function resolveExercise(ref, S) {
  const q = String(ref || '').trim()
  if (!q) fail('EINVAL', 'an exercise is required')
  if (known(q, S)) return q
  const all = [...customs(S), ...CATALOGUE]
  const low = q.toLowerCase()
  const exact = all.filter(e => String(e.n || '').toLowerCase() === low)
  if (exact.length === 1) return exact[0].id
  const close = (exact.length ? exact : searchExercises(all, q)).slice(0, 5).map(e => `${e.id} (${e.n})`)
  fail('ENOENT', `no single exercise matches ${JSON.stringify(q)}.` + (close.length ? ` Closest: ${close.join('; ')}. Pass one of these ids.` : ' Use search_exercises to find its id.'))
}

/* ---------- workouts ---------- */

const setInput = z.object({
  weight: z.number().min(0).max(2000).optional().describe('load in the profile\'s unit (kg or lb, see `unit` in the answer); for a bodyweight exercise the added load, usually 0'),
  reps: z.number().int().min(0).max(1000).optional(),
  seconds: z.number().int().min(0).max(86400).optional().describe('for a timed hold (plank)'),
  minutes: z.number().min(0).max(1440).optional().describe('for cardio and sports'),
  km: z.number().min(0).max(1000).optional().describe('distance, for cardio'),
  rir: z.number().int().min(0).max(10).optional().describe('reps in reserve, when the athlete said'),
  warmup: z.boolean().optional()
})
const exerciseInput = z.object({
  exercise: z.string().min(1).describe('an exercise id (from search_exercises, get_routine or get_workout) or its exact name'),
  sets: z.array(setInput).min(1).max(MAX_SETS),
  note: z.string().max(NOTE_MAX).optional()
})

// One logged row, the shape the app saves when a set is ticked (finish-workout.js finishedRow).
function row(id, s) {
  const mode = modeOf({ id })
  const out = { done: true }
  if (mode === 'cardio') {
    out.min = s.minutes ?? (s.seconds != null ? s.seconds / 60 : 0)
    if (s.km != null) out.km = s.km
  } else if (mode === 'time') {
    out.sec = s.seconds ?? 0
    out.w = s.weight ?? 0
  } else {
    if (s.reps == null) fail('EINVAL', `${nameOf(id, {})}: every set needs reps`)
    out.w = s.weight ?? 0
    out.r = s.reps
  }
  if (s.rir != null && mode === 'reps') out.rir = s.rir
  if (s.warmup) out.warmup = true
  return out
}

function entriesOf(exercises, S) {
  return exercises.slice(0, MAX_EXERCISES).map(e => {
    const id = resolveExercise(e.exercise, S)
    const entry = { id, sets: e.sets.map(s => row(id, s)) }
    entry.topW = bestWeightForEntry(entry) || null
    entry.target = null
    const note = (e.note || '').trim()
    if (note) entry.note = note
    return entry
  })
}

const latestWeight = (S, date) => {
  const xs = (S.bodyweight || []).filter(b => b && b.d <= date && Number(b.w) > 0).sort((a, b) => (a.d < b.d ? -1 : 1))
  return xs.length ? Number(xs[xs.length - 1].w) : null
}
const routinesNamed = (ids, S) => ids.map(id => (S.routines || []).find(r => r.id === id) || fail('ENOENT', `no routine with id ${JSON.stringify(id)}`))

function workoutView(w, S) {
  return {
    id: w.id, date: w.d, name: w.name || null, unit: S.unit || 'kg',
    start: new Date(w.start).toISOString(), end: new Date(w.end).toISOString(),
    exercises: (w.entries || []).map(e => ({ id: e.id, name: nameOf(e.id, S), sets: e.sets }))
  }
}

export const logWorkout = {
  name: 'log_workout',
  description: 'Log a finished workout in the athlete\'s history, as if they had done it in the app: it shows in History and Stats and counts for records, 1RM estimates, muscle balance and the next session\'s starting weights (the app reads the history). Use it for a session they did and describe, never for one they plan. Weights are in the profile\'s unit. Name the exercises by id (search_exercises) or exact name. Times are the athlete\'s local time; the profile\'s time zone is used when it has one, else UTC. Returns the saved workout.',
  schema: {
    date: isoDate().optional().describe('the day it was done; default today'),
    start_time: hhmm().optional().describe('local start time; default 18:00'),
    duration_min: z.number().int().min(1).max(600).optional().describe('default 60'),
    name: z.string().max(NAME_MAX).optional(),
    routine_id: z.string().optional().describe('the routine it followed, if any (list_routines)'),
    note: z.string().max(NOTE_MAX).optional(),
    exercises: z.array(exerciseInput).min(1).max(MAX_EXERCISES)
  },
  apply(S, a) {
    const date = a.date || todayIn(tzOf(S))
    const routine = a.routine_id ? routinesNamed([a.routine_id], S)[0] : null
    const start = epochAt(date, a.start_time || '18:00', tzOf(S))
    const entries = entriesOf(a.exercises, S)
    const w = {
      id: uid(), d: date, start, end: start + (a.duration_min || 60) * 60000,
      routineIds: routine ? [routine.id] : [], routineId: routine ? routine.id : null,
      name: (a.name || '').trim() || routine?.name || 'Workout',
      bw: latestWeight(S, date), entries, prs: []
    }
    const note = (a.note || '').trim()
    if (note) w.note = note
    S.workouts = [...(S.workouts || []), w].sort((x, y) => (x.d === y.d ? (x.start || 0) - (y.start || 0) : x.d < y.d ? -1 : 1))
    return { saved: workoutView(w, S) }
  }
}

const findWorkout = (S, id) => (S.workouts || []).find(w => w && String(w.id) === id) || fail('ENOENT', `no workout with id ${JSON.stringify(id)} (list_workouts gives the ids)`)

export const editWorkout = {
  name: 'edit_workout',
  description: 'Correct a logged workout: its date, start time, length, name or note, or its exercises and sets (`exercises` replaces them all: send every exercise the workout should keep, with all its sets, as get_workout shows them). Only what you pass changes.',
  schema: {
    workout_id: z.string().min(1),
    date: isoDate().optional(),
    start_time: hhmm().optional(),
    duration_min: z.number().int().min(1).max(600).optional(),
    name: z.string().max(NAME_MAX).optional(),
    note: z.string().max(NOTE_MAX).optional().describe('empty to remove it'),
    exercises: z.array(exerciseInput).min(1).max(MAX_EXERCISES).optional()
  },
  apply(S, a) {
    const w = findWorkout(S, a.workout_id)
    const length = (a.duration_min != null ? a.duration_min * 60000 : (w.end || w.start) - w.start) || 3600000
    if (a.date) w.d = a.date
    if (a.date || a.start_time) {
      w.start = epochAt(w.d, a.start_time || localTime(w.start, tzOf(S)), tzOf(S))
    }
    w.end = w.start + length
    if (a.name != null && a.name.trim()) w.name = a.name.trim()
    if (a.note != null) { const n = a.note.trim(); if (n) w.note = n; else delete w.note }
    if (a.exercises) w.entries = entriesOf(a.exercises, S)
    w._ts = -1          // edited: stampChange stamps it, field by field, as the app's own edit
    S.workouts.sort((x, y) => (x.d === y.d ? (x.start || 0) - (y.start || 0) : x.d < y.d ? -1 : 1))
    return { saved: workoutView(w, S) }
  }
}

export const deleteWorkout = {
  name: 'delete_workout',
  destructive: true,
  description: 'Remove a logged workout from the history, on every device. Ask the athlete first and pass confirm: true only once they said yes.',
  schema: { workout_id: z.string().min(1), confirm: confirm() },
  apply(S, a) {
    const w = findWorkout(S, a.workout_id)
    S.workouts = S.workouts.filter(x => x !== w)
    return { removed: { id: w.id, date: w.d, name: w.name || null } }
  }
}

/* ---------- body weight ---------- */

export const logBodyweight = {
  name: 'log_bodyweight',
  description: 'Log the athlete\'s body weight for a day, in the profile\'s unit (kg or lb, see `unit`). A day holds one weigh-in: logging a day again replaces it.',
  schema: { weight: z.number().min(20).max(700), date: isoDate().optional().describe('default today') },
  apply(S, a) {
    const d = a.date || todayIn(tzOf(S))
    S.bodyweight = Array.isArray(S.bodyweight) ? S.bodyweight : []
    const have = S.bodyweight.find(b => b?.d === d)
    if (have) { have.w = a.weight; have.t = Date.now() } else S.bodyweight.push({ d, w: a.weight, t: Date.now() })
    S.bodyweight.sort((x, y) => (x.d < y.d ? -1 : 1))
    return { saved: { date: d, weight: a.weight, unit: S.unit || 'kg' }, replaced: !!have }
  }
}

export const deleteBodyweight = {
  name: 'delete_bodyweight',
  destructive: true,
  description: 'Remove the weigh-in of a day. Ask the athlete first and pass confirm: true only once they said yes.',
  schema: { date: isoDate(), confirm: confirm() },
  apply(S, a) {
    const have = (S.bodyweight || []).find(b => b?.d === a.date) || fail('ENOENT', `no weigh-in on ${a.date}`)
    S.bodyweight = S.bodyweight.filter(b => b !== have)
    return { removed: { date: have.d, weight: have.w, unit: S.unit || 'kg' } }
  }
}

/* ---------- routines ---------- */

const planInput = z.object({
  exercise: z.string().min(1).describe('an exercise id (search_exercises) or its exact name'),
  sets: z.number().int().min(1).max(20).optional(),
  reps: z.number().int().min(1).max(100).optional().describe('target reps, or the top of a range with reps_min'),
  reps_min: z.number().int().min(1).max(100).optional().describe('bottom of a rep range (double progression), below reps'),
  weight: z.number().min(0).max(2000).optional().describe('starting load in the profile\'s unit'),
  seconds: z.number().int().min(1).max(3600).optional().describe('for a timed hold'),
  minutes: z.number().min(1).max(600).optional().describe('for cardio and sports'),
  rest_sec: z.number().int().min(0).max(900).optional().describe('rest after each set; absent: the app\'s rest timer')
})

// A routine's exercise, the way the routine editor builds one (history.js defaultConfig), with
// what Claude asked for on top.
function planOf(e, S) {
  const id = resolveExercise(e.exercise, S)
  const cfg = { id, ...defaultConfig(id) }
  const mode = modeOf(cfg)
  if (e.sets != null) cfg.sets = e.sets
  if (mode === 'reps') {
    if (e.reps != null) cfg.reps = e.reps
    if (e.reps_min != null && e.reps_min < cfg.reps) cfg.repsMin = e.reps_min
    if (e.weight != null) cfg.weight = e.weight
  } else if (mode === 'time') {
    if (e.seconds != null) cfg.sec = e.seconds
    if (e.weight != null) cfg.weight = e.weight
  } else if (e.minutes != null) cfg.min = e.minutes
  if (e.rest_sec > 0) cfg.restSec = e.rest_sec
  return cfg
}
const routineView = (r, S) => ({ id: r.id, name: r.name, unit: S.unit || 'kg', exercises: (r.ex || []).map(c => ({ id: c.id, name: nameOf(c.id, S), sets: c.sets, reps: c.reps, reps_min: c.repsMin, weight: c.weight, seconds: c.sec, minutes: c.min, rest_sec: c.restSec })) })
const findRoutine = (S, id) => (S.routines || []).find(r => r.id === id) || fail('ENOENT', `no routine with id ${JSON.stringify(id)} (list_routines gives the ids)`)

export const createRoutine = {
  name: 'create_routine',
  description: 'Create a routine (a planned session the athlete starts from the app), with its exercises in order. Each exercise starts from the app\'s defaults for it (3 × 10 for a lift, 45 s for a hold, 20 min for cardio) with what you pass on top. To put it on a weekday, call set_week_plan after.',
  schema: { name: z.string().min(1).max(NAME_MAX), exercises: z.array(planInput).min(1).max(MAX_EXERCISES) },
  apply(S, a) {
    const r = { id: uid(), name: a.name.trim(), emoji: DEFAULT_GLYPH, ex: a.exercises.map(e => planOf(e, S)) }
    S.routines = [...(S.routines || []), r]
    return { saved: routineView(r, S) }
  }
}

export const editRoutine = {
  name: 'edit_routine',
  description: 'Change a routine: its name, or its exercises (`exercises` replaces the whole list, in order: send every exercise it should keep). An exercise kept by id keeps its own settings (progression, pyramid, notes) unless you pass new values for them.',
  schema: { routine_id: z.string().min(1), name: z.string().min(1).max(NAME_MAX).optional(), exercises: z.array(planInput).min(1).max(MAX_EXERCISES).optional() },
  apply(S, a) {
    const r = findRoutine(S, a.routine_id)
    if (a.name) r.name = a.name.trim()
    if (a.exercises) {
      const old = [...(r.ex || [])]
      r.ex = a.exercises.map(e => {
        const fresh = planOf(e, S)
        const i = old.findIndex(c => c.id === fresh.id)
        if (i < 0) return fresh
        const kept = old.splice(i, 1)[0]
        const out = { ...kept }
        for (const [k, v] of [['sets', e.sets], ['reps', e.reps], ['repsMin', e.reps_min], ['weight', e.weight], ['sec', e.seconds], ['min', e.minutes], ['restSec', e.rest_sec]]) if (v != null) out[k] = v
        return out
      })
    }
    return { saved: routineView(r, S) }
  }
}

export const removeRoutine = {
  name: 'delete_routine',
  destructive: true,
  description: 'Delete a routine, and take it off every weekday and planned date that names it. Logged workouts done from it stay. Ask the athlete first and pass confirm: true only once they said yes.',
  schema: { routine_id: z.string().min(1), confirm: confirm() },
  apply(S, a) {
    const r = findRoutine(S, a.routine_id)
    S.week = isMap(S.week) ? S.week : {}
    S.dayPlan = isMap(S.dayPlan) ? S.dayPlan : {}
    deleteRoutine(S, r.id)
    return { removed: { id: r.id, name: r.name } }
  }
}

/* ---------- the plan ---------- */

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export const setWeekPlan = {
  name: 'set_week_plan',
  description: 'Set which routines a weekday holds in the athlete\'s weekly plan (weekday: 0 Sunday … 6 Saturday). Several routines make a combined day; an empty list makes it a rest day.',
  schema: { weekday: z.number().int().min(0).max(6), routine_ids: z.array(z.string().min(1)).max(4) },
  apply(S, a) {
    routinesNamed(a.routine_ids, S)
    S.week = isMap(S.week) ? S.week : {}
    const ids = [...new Set(a.routine_ids)]
    if (ids.length) S.week[a.weekday] = ids; else delete S.week[a.weekday]
    return { weekday: a.weekday, weekday_name: DAY_NAMES[a.weekday], routine_ids: ids }
  }
}

export const planDay = {
  name: 'plan_day',
  description: 'Change one date only, leaving the weekly plan as it is: train a given routine that day, make it a rest day, or (clear: true) go back to what the weekly plan says.',
  schema: {
    date: isoDate(),
    routine_id: z.string().min(1).optional(),
    rest: z.boolean().optional(),
    clear: z.boolean().optional()
  },
  apply(S, a) {
    const picks = [a.routine_id != null, a.rest === true, a.clear === true].filter(Boolean).length
    if (picks !== 1) fail('EINVAL', 'pass exactly one of routine_id, rest: true or clear: true')
    S.dayPlan = isMap(S.dayPlan) ? S.dayPlan : {}
    if (a.clear) delete S.dayPlan[a.date]
    else if (a.rest) S.dayPlan[a.date] = 'rest'
    else S.dayPlan[a.date] = routinesNamed([a.routine_id], S)[0].id
    return { date: a.date, plan: S.dayPlan[a.date] ?? 'weekly plan' }
  }
}

export const WRITE_TOOLS = [logWorkout, editWorkout, deleteWorkout, logBodyweight, deleteBodyweight, createRoutine, editRoutine, removeRoutine, setWeekPlan, planDay]

/* ---------- committing ---------- */

/**
 * Runs `tool` on a copy of the stored training document `cur` and stamps the change the way the
 * app stamps its own (stampChange). Returns { next, result }: the document to save (the server's
 * bookkeeping and revision are the caller's) and the tool's answer. Throws the tool's error, and
 * nothing is saved then.
 */
export function commitChange(cur, tool, args, wall = Date.now()) {
  if (!isMap(cur)) fail('ENOSTATE', 'this profile has never synced: open Olympus signed in once, then try again')
  const { _unstamped, _prior, _wids, _wid, _rev, active, ...prev } = clone(cur)
  const next = clone(prev)
  const result = tool.apply(next, args)
  next._ts = stampChange(prev, next, wall)
  return { next, result }
}
