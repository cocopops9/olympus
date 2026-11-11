// Olympus: a workout or a whole plan written as text, turned into routines by Hercules or Athena.
//
// The person writes or pastes what they train ("Push: bench 4x6-8 80 kg, incline dumbbell press
// 3x10...", or a dated week with rest days and a football match), in any language. The coach
// reads it on the server (api/hercules.js handlePlanText, one of that coach's messages for the
// day) and answers with sessions: their dates or weekdays, and their exercises with English,
// catalogue-style names, sets, reps, weight, rest, ramp sets, superset letters and notes. Here
// those names are matched to the catalogue (and to the person's own exercises), and the result
// becomes a draft the sheet shows (components/PlanText.jsx): every exercise with what it was
// matched to, the ones it could not match and the lines the coach left out marked. Nothing is
// saved until the person says so.
//
// A plan is saved as ONE thing: its routines, and, when the text dates its sessions, a coach
// week (`S.queue`, lib/queue.js) named after the plan, each session pinned to its date
// (`S.dayPlan`) and its rest days marked. The calendar, Home and Plan then show the plan as the
// week being trained, and the person's weekly template comes back once it is done. A plan that
// only names weekdays goes on the weekly plan, as before.
import { api } from './api.js'
import { getLang } from './i18n.js'
import { CATALOGUE, searchExercises, similarExercises, isCardio } from './exercises.js'
import { defaultConfig, NOTE_MAX, MAX_PLANNED_WARMUPS } from './history.js'
import { uid, todayISO } from './format.js'
import { DEFAULT_GLYPH } from './glyphs.js'
import { queueOf } from './queue.js'
import { normalizeIntervals, intervalMinutes } from './intervals.js'

export const PLAN_TEXT_MAX = 8000
const ASK_MS = 150000   // the model, a second look for the lines it left out, and the fallback

/** Asks `coach` ('hercules' or 'athena') to read `text`; resolves with { plan, missed, left, perDay, model }. */
export function askPlanText(text, coach, S) {
  const custom = (S?.customEx || []).map(e => e.n).filter(Boolean).slice(0, 60)
  return api('/api/' + (coach === 'athena' ? 'athena' : 'hercules') + '/plan', {
    method: 'POST',
    timeout: ASK_MS,
    body: JSON.stringify({ text: String(text || '').slice(0, PLAN_TEXT_MAX), lang: getLang(), unit: S?.unit === 'lb' ? 'lb' : 'kg', today: todayISO(), custom }),
  })
}

const plain = s => String(s || '').toLowerCase().replace(/[-‐-―_]/g, ' ').replace(/\s+/g, ' ').trim()

/**
 * The exercise a name the coach wrote stands for: { ex, sure } or null. The person's own exercise
 * or a catalogue one of that exact name is sure; otherwise the best match of the app's own search
 * (which prefers the common equipment and the classic lifts), still sure when every word of the
 * name is in it; failing that, the closest similar exercise, marked as a guess to check.
 */
export function matchExercise(name, custom = []) {
  const q = plain(name)
  if (!q) return null
  const all = [...custom, ...CATALOGUE]
  const exact = all.find(e => plain(e.n) === q)
  if (exact) return { ex: exact, sure: true }
  const found = searchExercises(all, q)
  if (found.length) {
    const words = q.split(' ')
    const n = plain(found[0].n)
    return { ex: found[0], sure: words.every(w => n.includes(w)) }
  }
  const near = similarExercises(all, q, [], 1)
  return near.length ? { ex: near[0], sure: false } : null
}

/**
 * The routine configuration of one item the coach read, for the matched exercise `ex`: sets,
 * reps (a range as repsMin), weight, a hold's seconds or an activity's minutes, and the item's
 * own rest and ramp sets.
 */
export function configOf(e, ex) {
  const id = ex.id
  const own = e.restSec > 0 ? { restSec: Math.round(e.restSec) } : {}
  if (isCardio(ex)) {
    const base = id ? defaultConfig(id, 'cardio') : { sets: 1, min: 20, speed: 0 }
    // An interval run: its segments, their speeds and the rests between them (lib/intervals.js).
    const intervals = normalizeIntervals((e.intervals || []).map(iv => ({ min: iv.minutes ?? iv.min, speed: iv.speed, rest: iv.restSec ?? iv.rest })))
    if (intervals.length) return { ...base, sets: intervals.length, min: Math.max(1, Math.round(intervalMinutes(intervals))), speed: intervals[0].speed, intervals, ...own }
    return { ...base, sets: e.minutes ? 1 : Math.max(1, e.sets || 1), min: e.minutes || (e.seconds ? Math.max(1, Math.round(e.seconds / 60)) : base.min), ...own }
  }
  const warm = Math.min(MAX_PLANNED_WARMUPS, Math.max(0, Math.round(e.warmupSets) || 0))
  if (warm) own.warmupSets = warm
  if (e.seconds || e.minutes) {
    return { ...defaultConfig(id, 'time'), sets: e.sets || 1, sec: e.seconds || e.minutes * 60, weight: e.weight || 0, ...own }
  }
  const base = defaultConfig(id, 'reps')
  // "The last set taken to failure" is the app's own flag for it (history.js applyFailurePlan).
  if (e.toFailure === true) own.lastToFailure = true
  return { ...base, sets: e.sets || 3, reps: e.reps || base.reps, ...(e.repsMin > 0 && e.repsMin < e.reps ? { repsMin: e.repsMin } : {}), weight: e.weight || 0, ...own }
}

// A sport or a class the catalogue does not have ("boxing class", "HIIT") becomes an exercise of
// the person's own, a cardio one, made when the plan is saved: what it stands for is plain, and
// leaving it out would lose a session of the plan.
const ownActivity = name => ({
  id: '', n: String(name || '').trim().slice(0, 60), bp: 'cardio', desc: '', tg: '', sm: [],
  muscleGroups: [], primaries: [], secondaries: [], eq: 'body weight', custom: true,
})

function itemOf(e, custom, key) {
  const m = matchExercise(e.name, custom)
  // An activity's rough match ("boxing class" read as a boxing punch drill) is no match at all.
  if (e.activity && (!m || !m.sure)) {
    const ex = ownActivity(e.name)
    return { key, said: e.name, line: e.line || 0, ex, sure: true, make: true, raw: e, cfg: configOf(e, ex), ss: '', note: e.note || '' }
  }
  return { key, said: e.name, line: e.line || 0, ex: m?.ex || null, sure: !!m?.sure, raw: e, cfg: m ? configOf(e, m.ex) : null, ss: String(e.group ?? e.superset ?? '').toUpperCase(), note: e.note || '' }
}

/**
 * The draft the sheet shows, from the server's `plan` (and the lines it reports `missed`):
 * { kind, name, comment, dated, sessions: [{ key, name, date, days, rest, note, items: [{ key,
 * said, line, ex, sure, make, left, cfg, sg, note }] }] }. `ex` is null for a name nothing in the
 * catalogue matched, and for a line the coach left out (`left`, its `said` the line itself);
 * such an item is left out when saving unless an exercise is picked for it. A plan in the
 * server's first shape ({ routines: [{ name, days, exercises }] }) reads too.
 */
export function draftOf(plan, custom = [], missed = []) {
  let k = 0
  const given = Array.isArray(plan?.sessions) ? plan.sessions : (plan?.routines || []).map(r => ({ name: r.name, days: r.days, items: r.exercises || [] }))
  const sessions = given.map(r => ({
    key: 'r' + k++, name: r.name || '', date: r.date || '', days: [...(r.days || [])], rest: !!r.rest, note: r.note || '',
    items: (r.items || []).map(e => itemOf(e, custom, 'i' + k++)),
  }))
  // A line the coach left out goes to the session it sits in: the last one with an item before it.
  for (const m of missed || []) {
    const trainingDays = sessions.filter(s => !s.rest)
    if (!trainingDays.length) break
    const home = [...trainingDays].reverse().find(s => s.items.some(it => it.line && it.line < m.line)) || trainingDays[0]
    const at = home.items.findIndex(it => it.line > m.line)
    const item = { key: 'i' + k++, said: String(m.text || '').replace(/^[\s*•·-]+/, '').trim(), line: m.line, ex: null, sure: false, left: true, raw: {}, cfg: null, ss: '', note: '' }
    home.items.splice(at < 0 ? home.items.length : at, 0, item)
  }
  // A superset letter becomes a group when two or more items of the session carry it.
  for (const s of sessions) {
    const count = {}
    for (const it of s.items) if (it.ss) count[it.ss] = (count[it.ss] || 0) + 1
    const groups = {}
    for (const it of s.items) it.sg = it.ss && count[it.ss] > 1 ? (groups[it.ss] ||= 'sg' + uid()) : ''
  }
  const trainingDays = sessions.filter(s => !s.rest)
  return {
    kind: plan?.kind === 'plan' || trainingDays.length > 1 ? 'plan' : 'workout',
    name: plan?.name || trainingDays[0]?.name || '',
    comment: plan?.comment || '',
    dated: sessions.some(s => s.date),
    sessions,
  }
}

/** `item` with another exercise picked for it, its sets and reps as the coach read them. */
export function pickFor(item, ex) {
  return { ...item, ex, sure: true, make: false, left: false, cfg: configOf(item.raw || {}, ex) }
}

/** How many items have no exercise yet, how many are guesses, how many lines the coach left out. */
export function draftIssues(draft) {
  let missing = 0, guesses = 0, left = 0
  for (const r of draft.sessions) for (const it of r.items) {
    if (it.left) left++
    else if (!it.ex) missing++
    else if (!it.sure) guesses++
  }
  return { missing, guesses, left }
}

/** A routine of the store from a session of the draft (the items with an exercise only). */
export function routineOf(r, idOf = it => it.ex.id) {
  const ex = r.items.filter(it => it.ex && !it.left).map(it => ({
    id: idOf(it), ...it.cfg,
    ...(it.sg ? { sg: it.sg } : {}),
    ...(it.note ? { note: String(it.note).slice(0, NOTE_MAX) } : {}),
  }))
  // A group left with one member (the other had no exercise) is no superset.
  const count = {}
  for (const e of ex) if (e.sg) count[e.sg] = (count[e.sg] || 0) + 1
  for (const e of ex) if (e.sg && count[e.sg] < 2) delete e.sg
  return { id: uid(), name: String(r.name || '').slice(0, 40), emoji: DEFAULT_GLYPH, ex }
}

const training = draft => draft.sessions.filter(r => !r.rest && r.items.some(it => it.ex && !it.left))
const sameName = (a, b) => !!plain(a) && plain(a) === plain(b)

/** The person's routines that a save with `replace` would update, by name: [{ id, name }]. */
export function sameNamed(s, draft) {
  const out = []
  for (const r of training(draft)) {
    const old = (s.routines || []).find(x => sameName(x.name, r.name) && !out.some(o => o.id === x.id))
    if (old) out.push({ id: old.id, name: old.name })
  }
  return out
}

/** How a plan would be scheduled: 'dates' (a coach week on its dates), 'weekdays', or 'none'. */
export const scheduleKind = draft => (draft.dated ? 'dates' : training(draft).some(r => r.days.length) ? 'weekdays' : 'none')

/** The weekdays a weekday plan would put a routine on that already have one of `s`'s routines. */
export function takenDays(s, draft) {
  if (scheduleKind(draft) !== 'weekdays') return []
  const days = new Set(training(draft).flatMap(r => r.days))
  return [...days].filter(d => [].concat(s.week?.[d] || []).some(id => (s.routines || []).some(r => r.id === id))).sort()
}

/** The week now running that saving `draft` on its dates would take the place of, or null. */
export const replacedWeek = (s, draft) => (scheduleKind(draft) === 'dates' ? queueOf(s) : null)

/**
 * Saves the draft into the training document `s` (inside a store update). Returns { ids, made,
 * updated }: the routines of the plan in its order, how many exercises of the person's own it
 * made, and how many routines were updated rather than added.
 *
 * - The sports and classes the catalogue lacks become exercises of the person's own (one made
 *   earlier of the same name is used again).
 * - With `replace`, a routine of the plan whose name one of the person's routines already has
 *   updates that routine (its id and weekdays stay, its exercises become the plan's): a plan
 *   read again after a fix does not leave its first version behind. Otherwise, new routines.
 * - With `schedule`: a dated plan becomes the coach week, named after the plan, from its first
 *   date, every session pinned to its date and every rest day marked (dates already past are
 *   not pinned); a weekday plan goes on those weekdays of the weekly plan (those days replaced).
 */
export function savePlan(s, draft, { schedule = true, replace = true, today = todayISO(), now = Date.now() } = {}) {
  s.routines ||= []
  s.customEx ||= []
  let made = 0, updated = 0
  const idOf = it => {
    if (!it.make) return it.ex.id
    const mine = s.customEx.find(c => sameName(c.n, it.ex.n))
    if (mine) return mine.id
    const c = { ...it.ex, id: 'c' + uid() }
    s.customEx.push(c)
    made++
    return c.id
  }
  const used = new Set()
  const placed = []   // { session, id }
  for (const r of training(draft)) {
    const routine = routineOf(r, idOf)
    const old = replace ? s.routines.find(x => !used.has(x.id) && sameName(x.name, r.name)) : null
    if (old) {
      old.ex = routine.ex
      old.name = routine.name || old.name
      used.add(old.id)
      placed.push({ session: r, id: old.id })
      updated++
    } else {
      s.routines.push(routine)
      used.add(routine.id)
      placed.push({ session: r, id: routine.id })
    }
  }
  const ids = placed.map(p => p.id)
  const kind = scheduleKind(draft)
  if (schedule && kind === 'dates') {
    const dates = draft.sessions.map(r => r.date).filter(Boolean).sort()
    s.queue = { ids: [...new Set(ids)], since: now, startsOn: dates[0] || today, label: String(draft.name || '').slice(0, 40) }
    s.dayPlan ||= {}
    for (const { session, id } of placed) if (session.date && session.date >= today) s.dayPlan[session.date] = id
    for (const r of draft.sessions) if (r.rest && r.date && r.date >= today && s.dayPlan[r.date] == null) s.dayPlan[r.date] = 'rest'
  } else if (schedule && kind === 'weekdays') {
    s.week ||= {}
    const onDay = {}
    for (const { session, id } of placed) for (const d of session.days) (onDay[d] ||= []).push(id)
    for (const [d, list] of Object.entries(onDay)) s.week[d] = [...new Set(list)]
  }
  return { ids, made, updated }
}

/** What a save changes, to put back with Undo. */
export const planSnapshot = s => structuredClone({
  routines: s.routines || [], customEx: s.customEx || [], week: s.week || {}, dayPlan: s.dayPlan || {}, queue: s.queue ?? null,
})

/** Whether the draft has anything to save. */
export const draftUsable = draft => training(draft).length > 0
