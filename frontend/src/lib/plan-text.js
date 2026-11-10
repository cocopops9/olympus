// Olympus: a workout or a whole plan written as text, turned into routines by Hercules or Athena.
//
// The person writes or pastes what they train ("Push: bench 4x6-8 80 kg, incline dumbbell press
// 3x10...", or a week of it), in any language. The coach reads it on the server (api/hercules.js
// handlePlanText, one of that coach's messages for the day) and answers with routines whose
// exercises carry English, catalogue-style names. Here those names are matched to the catalogue
// (and to the person's own exercises), and the result becomes a draft the sheet shows
// (components/PlanText.jsx): every exercise with what it was matched to, the ones it could not
// match marked, the weekdays of each routine. Nothing is saved until the person says so, then
// either as routines (with their weekdays on the weekly plan) or as a workout started right away.
import { api } from './api.js'
import { getLang } from './i18n.js'
import { CATALOGUE, searchExercises, similarExercises, isCardio } from './exercises.js'
import { defaultConfig } from './history.js'
import { uid } from './format.js'
import { DEFAULT_GLYPH } from './glyphs.js'

export const PLAN_TEXT_MAX = 6000
const ASK_MS = 95000   // the model, and its fallback when the first is busy

/** Asks `coach` ('hercules' or 'athena') to read `text`; resolves with { plan, left, perDay, model }. */
export function askPlanText(text, coach, S) {
  const custom = (S?.customEx || []).map(e => e.n).filter(Boolean).slice(0, 60)
  return api('/api/' + (coach === 'athena' ? 'athena' : 'hercules') + '/plan', {
    method: 'POST',
    timeout: ASK_MS,
    body: JSON.stringify({ text: String(text || '').slice(0, PLAN_TEXT_MAX), lang: getLang(), unit: S?.unit === 'lb' ? 'lb' : 'kg', custom }),
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

/** The routine configuration of one exercise the coach read, for the matched exercise `ex`. */
export function configOf(e, ex) {
  const id = ex.id
  if (isCardio(ex)) {
    const base = defaultConfig(id, 'cardio')
    return { ...base, sets: e.minutes ? 1 : Math.max(1, e.sets || 1), min: e.minutes || (e.seconds ? Math.max(1, Math.round(e.seconds / 60)) : base.min) }
  }
  if (e.seconds || e.minutes) {
    return { ...defaultConfig(id, 'time'), sets: e.sets || 1, sec: e.seconds || e.minutes * 60, weight: e.weight || 0 }
  }
  const base = defaultConfig(id, 'reps')
  return { ...base, sets: e.sets || 3, reps: e.reps || base.reps, ...(e.repsMin > 0 && e.repsMin < e.reps ? { repsMin: e.repsMin } : {}), weight: e.weight || 0 }
}

/**
 * The draft the sheet shows, from the server's `plan`: { kind, name, comment, routines: [{ key,
 * name, days, items: [{ key, said, ex, sure, cfg, sg, note }] }] }. `ex` is null for a name
 * nothing in the catalogue matched; such an item is left out when saving unless an exercise is
 * picked for it.
 */
export function draftOf(plan, custom = []) {
  let k = 0
  const routines = (plan?.routines || []).map(r => {
    // A superset letter becomes a group only when it joins neighbours: a lone "A" is a plain set.
    const items = r.exercises.map(e => {
      const m = matchExercise(e.name, custom)
      return { key: 'i' + k++, said: e.name, ex: m?.ex || null, sure: !!m?.sure, raw: e, cfg: m ? configOf(e, m.ex) : null, ss: e.superset || '', note: e.note || '' }
    })
    const groups = {}
    items.forEach((it, i) => {
      const linked = it.ss && ((items[i - 1]?.ss === it.ss) || (items[i + 1]?.ss === it.ss))
      it.sg = linked ? (groups[it.ss] ||= 'sg' + uid()) : ''
    })
    return { key: 'r' + k++, name: r.name, days: [...(r.days || [])], items }
  })
  return { kind: plan?.kind === 'plan' || routines.length > 1 ? 'plan' : 'workout', name: plan?.name || routines[0]?.name || '', comment: plan?.comment || '', routines }
}

/** `item` with another exercise picked for it, its sets and reps as the coach read them. */
export function pickFor(item, ex) {
  return { ...item, ex, sure: true, cfg: configOf(item.raw || {}, ex) }
}

/** How many items of the draft have no exercise yet, and how many are guesses to check. */
export function draftIssues(draft) {
  let missing = 0, guesses = 0
  for (const r of draft.routines) for (const it of r.items) { if (!it.ex) missing++; else if (!it.sure) guesses++ }
  return { missing, guesses }
}

/** A routine of the store from a routine of the draft (the items with an exercise only). */
export function routineOf(r) {
  const ex = r.items.filter(it => it.ex).map(it => ({
    id: it.ex.id, ...it.cfg,
    ...(it.sg ? { sg: it.sg } : {}),
    ...(it.note ? { note: it.note } : {}),
  }))
  // A group left with one member (the other had no exercise) is no superset.
  const count = {}
  for (const e of ex) if (e.sg) count[e.sg] = (count[e.sg] || 0) + 1
  for (const e of ex) if (e.sg && count[e.sg] < 2) delete e.sg
  return { id: uid(), name: String(r.name || '').slice(0, 40), emoji: DEFAULT_GLYPH, ex }
}

/** The weekdays the draft would put a routine on that already have one of `s`'s routines. */
export function takenDays(s, draft) {
  const days = new Set(draft.routines.flatMap(r => (r.items.some(it => it.ex) ? r.days : [])))
  return [...days].filter(d => [].concat(s.week?.[d] || []).some(id => (s.routines || []).some(r => r.id === id))).sort()
}

/**
 * Saves the draft into the training document `s` (inside a store update): its routines added
 * after the person's own, and, with `schedule`, each put on its weekdays (those days of the
 * weekly plan are replaced; two routines of the draft on one day share it). Returns the ids of
 * the new routines, in order.
 */
export function saveDraft(s, draft, { schedule = true } = {}) {
  const made = draft.routines.map(r => ({ r, routine: routineOf(r) })).filter(x => x.routine.ex.length)
  const ids = []
  const onDay = {}
  for (const { r, routine } of made) {
    s.routines.push(routine)
    ids.push(routine.id)
    if (schedule) for (const d of r.days) (onDay[d] ||= []).push(routine.id)
  }
  if (schedule) {
    s.week ||= {}
    for (const [d, list] of Object.entries(onDay)) s.week[d] = list
  }
  return ids
}

/** Whether the draft has anything to save. */
export const draftUsable = draft => draft.routines.some(r => r.items.some(it => it.ex))
