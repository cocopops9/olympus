// Olympus: which gym a workout was done in, an optional label (w.gym). The same machine can be
// set up very differently in two gyms (a leg press at 145 kg in one is 100 kg in the other), so
// Stats can draw an exercise's progress for one gym at a time (views/Stats.jsx). The names are
// the person's own; the list offered is the ones already used, most used first.
//
// The gym of the latest workout that has one is the default for the next: most people train in
// the same place most of the time, so a finished workout arrives with it already picked. Renaming
// or deleting a gym changes every workout that carries it, each one stamped so the change syncs.
import { stampWorkout } from './sync-merge.js'
import { sameWorkout } from './workout-date.js'

export const GYM_MAX = 40
export const cleanGym = v => String(v || '').trim().replace(/\s+/g, ' ').slice(0, GYM_MAX)

/** The gyms already used, most workouts first: ['Home', 'McFit Centro', ...]. */
export function gymsOf(S) {
  const n = new Map()
  for (const w of S?.workouts || []) { const g = cleanGym(w?.gym); if (g) n.set(g, (n.get(g) || 0) + 1) }
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([g]) => g)
}

/** How many saved workouts carry gym `name`. */
export function gymUseCount(S, name) {
  const g = cleanGym(name)
  if (!g) return 0
  return (S?.workouts || []).reduce((n, w) => n + (cleanGym(w?.gym) === g ? 1 : 0), 0)
}

// When a workout happened, for "the latest": its end, else its start, else its day.
const whenOf = w => Number(w?.end) || Number(w?.start) || Date.parse(w?.d || '') || 0

/**
 * The gym of the most recent workout that has one, or '' when none has. `except` leaves one
 * workout out (the one just finished, whose own gym is what is being decided).
 */
export function lastGym(S, except = null) {
  let best = null
  for (const w of S?.workouts || []) {
    if (!cleanGym(w?.gym) || (except && sameWorkout(w, except))) continue
    if (!best || whenOf(w) >= whenOf(best)) best = w
  }
  return best ? cleanGym(best.gym) : ''
}

/** Sets (or, with an empty name, clears) the gym of saved workout `ref`, inside a store update. */
export function setWorkoutGym(s, ref, gym) {
  const rec = (s.workouts || []).find(x => sameWorkout(x, ref))
  if (!rec) return
  const g = cleanGym(gym)
  if (g === cleanGym(rec.gym)) return
  if (g) rec.gym = g; else delete rec.gym
  stampWorkout(rec)
}

/**
 * Renames gym `from` to `to` on every workout, inside a store update. Renaming onto a gym that
 * already exists merges the two. Returns how many workouts changed.
 */
export function renameGym(s, from, to, now = Date.now()) {
  const a = cleanGym(from), b = cleanGym(to)
  if (!a || !b || a === b) return 0
  let n = 0
  for (const w of s.workouts || []) {
    if (cleanGym(w?.gym) !== a) continue
    w.gym = b
    stampWorkout(w, now)
    n++
  }
  return n
}

/**
 * Takes gym `name` off every workout, inside a store update: the workouts stay, only the label
 * goes. Returns how many workouts changed.
 */
export function deleteGym(s, name, now = Date.now()) {
  const g = cleanGym(name)
  if (!g) return 0
  let n = 0
  for (const w of s.workouts || []) {
    if (cleanGym(w?.gym) !== g) continue
    delete w.gym
    stampWorkout(w, now)
    n++
  }
  return n
}

/** The gyms exercise `id` was trained in, most used first. */
export function gymsForExercise(S, id) {
  const n = new Map()
  for (const w of S?.workouts || []) {
    const g = cleanGym(w?.gym)
    if (g && (w.entries || []).some(e => e.id === id)) n.set(g, (n.get(g) || 0) + 1)
  }
  return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([g]) => g)
}
