// Olympus: where a period's training went, by body region, against the period before it. The
// Stats "Muscle distribution" radar reads it (components/MuscleRadar.jsx).
//
// The unit is the one the rest of the muscle pages use, effective sets (lib/muscles.js loadOf):
// a work set counts 1 for the muscle it targets and SECONDARY for each muscle that helps. Volume
// in kg is deliberately not the axis: 100 kg of leg press against 12 kg of lateral raises says
// nothing about which region worked harder, and a radar drawn in kg would always point at legs.
import { loadOfWorkouts } from './muscles.js'
import { workoutAt, workoutDuration, workoutVolume, doneUnits } from './history.js'
import { isWarmupRow } from './workout-model.js'

const DAY = 86400000

/**
 * The six regions of the radar, in drawing order: clockwise from the top left, so back and chest
 * sit at the top, arms and legs at the bottom. Every muscle of lib/muscles.js MUSCLES belongs to
 * exactly one region (checked by the test). Grouping choices that are conventions, not anatomy
 * facts: the neck goes with the back (the traps that move it are back muscles here), the serratus
 * with the chest (it works in every press), the lower back with the back, glutes and hip flexors
 * with the legs.
 */
export const REGIONS = [
  { id: 'back', name: 'Back', muscles: ['neck', 'trapezius', 'upper-back', 'lower-back'] },
  { id: 'chest', name: 'Chest', muscles: ['chest', 'serratus'] },
  { id: 'core', name: 'Core', muscles: ['abs', 'obliques'] },
  { id: 'shoulders', name: 'Shoulders', muscles: ['deltoids'] },
  { id: 'arms', name: 'Arms', muscles: ['biceps', 'triceps', 'forearm'] },
  { id: 'legs', name: 'Legs', muscles: ['gluteal', 'quadriceps', 'hamstring', 'adductors', 'hip-flexors', 'calves', 'tibialis'] },
]

/** The periods offered, in days. */
export const DISTRIBUTION_PERIODS = [7, 30, 90, 365]

/** Effective sets per region of a muscle load ({ slug: sets }), rounded to a tenth. */
export function regionsOf(load) {
  const out = {}
  for (const r of REGIONS) {
    const sum = r.muscles.reduce((n, m) => n + (Number(load?.[m]) || 0), 0)
    out[r.id] = Math.round(sum * 10) / 10
  }
  return out
}

/** The workouts that happened in (from, to]: ms bounds, by when each workout happened. */
export function workoutsBetween(workouts, from, to) {
  return (workouts || []).filter(w => {
    const at = workoutAt(w)
    return Number.isFinite(at) && at > from && at <= to
  })
}

// Work sets ticked off (both sides of a per-side row count), warm-ups left out, as the post
// summary and the muscle map count them.
function workSetsOf(w) {
  let n = 0
  for (const e of w?.entries || []) for (const s of e?.sets || []) if (s && !isWarmupRow(s)) n += doneUnits(s)
  return n
}

/** Workouts, total duration (ms), volume (profile unit) and work sets of a list of workouts. */
export function totalsOf(workouts) {
  let duration = 0, volume = 0, sets = 0
  for (const w of workouts || []) {
    duration += workoutDuration(w)
    volume += Number.isFinite(w?.vol) ? w.vol : workoutVolume(w)
    sets += workSetsOf(w)
  }
  return { workouts: (workouts || []).length, duration, volume: Math.round(volume * 10) / 10, sets }
}

/**
 * The radar's data for the last `days` days ending at `now`, and the same number of days before
 * that: `current` and `previous` each carry { regions, totals }. `scale` is the largest region
 * value of either period, so both polygons are drawn against the same rim and can be compared
 * by eye; 0 when neither period trained anything.
 */
export function muscleDistribution(workouts, days, now = Date.now()) {
  const span = Math.max(1, Number(days) || 30) * DAY
  const cur = workoutsBetween(workouts, now - span, now)
  const prev = workoutsBetween(workouts, now - 2 * span, now - span)
  const current = { regions: regionsOf(loadOfWorkouts(cur)), totals: totalsOf(cur) }
  const previous = { regions: regionsOf(loadOfWorkouts(prev)), totals: totalsOf(prev) }
  const scale = Math.max(0, ...Object.values(current.regions), ...Object.values(previous.regions))
  return { current, previous, scale }
}
