// Olympus: the records an exercise sets during a workout, the moment a set is checked off
// (views/Workout.jsx), for the medal on its card and the fanfare (lib/sound.js triumph).
//
// Three kinds, each held against every finished workout before this one:
//   weight  the heaviest weight lifted in a work set (the same rule as the PR at the finish:
//           beatsWeight, so on an assisted machine less help is the record);
//   rm      the best estimated one-rep max (lib/onerm.js, the formula chosen in Settings);
//   volume  the most weight moved in the exercise in one session (weight x reps of its work sets).
// An exercise done for the first time sets one record: its weight is the heaviest it has ever been
// lifted, which is what the finish already calls a PR (sheets.jsx: beatsWeight against nothing).
// Until 2026-11-26 a first time set none here, so a first session showed no medal however heavy
// it was, while the saved workout still listed the PR. The 1RM and volume records still need
// a previous session to beat: on a first time they would only repeat the same news.
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
    if (beatsWeight(entry.id, mx, best)) out.push('weight')
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

// Keys of a set row that say when or how it was entered, not what was lifted: a change to them
// alone is no reason to judge the records again.
const NOT_LIFTED = new Set(['at', 'weightOrigin', 'sug', 'planSec'])

/**
 * What the ticked rows of `entry` logged, as one string: two entries with the same signature
 * set the same records. Every number on a done row counts, at any depth (the L and R sides of a
 * unilateral row, a drop set's drops, a rest-pause burst), so an edit to any of them after the
 * tick is seen (views/Workout.jsx judges the records again when it changes).
 */
export function recordSignature(entry) {
  const done = (entry?.sets || []).filter(s => s && s.done)
  return JSON.stringify(done, (k, v) => (NOT_LIFTED.has(k) ? undefined : v))
}
