// Olympus: the records an exercise sets during a workout, the moment a set is checked off
// (views/Workout.jsx), for the medal on its card and the fanfare (lib/sound.js triumph).
//
// Three kinds, each held against every finished workout before this one:
//   weight  the heaviest weight lifted in a work set (the same rule as the PR at the finish:
//           beatsWeight, so on an assisted machine less help is the record);
//   rm      the best estimated one-rep max (lib/onerm.js, the formula chosen in Settings);
//   volume  the most weight moved in the exercise in one session (weight x reps of its work sets).
// An exercise done for the first time sets no record: there is nothing to beat yet.
import { bestWeightFor, workoutVolume } from './history.js'
import { betterWeight, beatsWeight } from './exercises.js'
import { is1RMRecord } from './onerm.js'
import { entryDbLoad } from './dumbbells.js'
import { isWarmupRow } from './workout-model.js'

export const RECORD_KINDS = ['weight', 'rm', 'volume']

const entryVolume = e => workoutVolume({ entries: [e] })

/** The most volume of exercise `exId` in one finished workout, or 0. */
export function bestVolumeFor(S, exId) {
  let best = 0
  for (const w of S?.workouts || []) {
    const mine = (w.entries || []).filter(e => e && e.id === exId)
    if (mine.length) best = Math.max(best, workoutVolume({ entries: mine }))
  }
  return best
}

/** Which records the logged sets of `entry` beat, against `S.workouts`: a subset of RECORD_KINDS. */
export function recordsOf(S, entry) {
  if (!entry?.id) return []
  const out = []
  const work = (entry.sets || []).filter(s => s && s.done && !isWarmupRow(s))
  if (!work.length) return out
  const loads = work.map(s => Number(s.w)).filter(w => w > 0)
  if (loads.length) {
    const best = bestWeightFor(S, entry.id, entryDbLoad(entry))
    const mx = loads.reduce((a, b) => betterWeight(entry.id, a, b))
    if (best > 0 && beatsWeight(entry.id, mx, best)) out.push('weight')
    const rm = is1RMRecord(S, entry.id, entry)
    if (rm && rm.prev > 0) out.push('rm')
  }
  const vol = entryVolume(entry)
  const before = bestVolumeFor(S, entry.id)
  if (before > 0 && vol > before) out.push('volume')
  return out
}

/** The records of `entry` not celebrated yet in this session (entry.rec holds those that were). */
export function newRecords(S, entry) {
  const had = new Set(Array.isArray(entry?.rec) ? entry.rec : [])
  return recordsOf(S, entry).filter(k => !had.has(k))
}
