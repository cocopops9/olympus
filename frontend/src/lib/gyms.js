// Olympus: which gym a workout was done in, an optional label (w.gym). The same machine can be
// set up very differently in two gyms (a leg press at 145 kg in one is 100 kg in the other), so
// Stats can draw an exercise's progress for one gym at a time (views/Stats.jsx). The names are
// the person's own; the list offered is the ones already used, most used first.
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

/** Sets (or, with an empty name, clears) the gym of saved workout `ref`, inside a store update. */
export function setWorkoutGym(s, ref, gym) {
  const rec = (s.workouts || []).find(x => sameWorkout(x, ref))
  if (!rec) return
  const g = cleanGym(gym)
  if (g === cleanGym(rec.gym)) return
  if (g) rec.gym = g; else delete rec.gym
  stampWorkout(rec)
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
