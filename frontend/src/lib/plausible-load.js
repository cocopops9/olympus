// Olympus: a weight that is very likely a typo (an extra zero, 760 for 76). Such a set is not
// ticked straight away: its tick shows an exclamation mark, and tapping it asks whether to log the
// weight as it is or correct it (views/Workout.jsx). A confirmed weight is remembered on the row
// (`loadOk`, dropped when the session is saved), so it is asked once. Nothing is ever refused: a
// real lift must stay loggable. The helpers are pure so that other screens (the exercise card,
// Calliope's tips) can ask the same question and get the same answer.
//
// The reference is the best estimated one-rep max of the exercise (lib/onerm.js best1RM, the
// formula chosen in Settings, read in the dumbbell meaning this session logs in). A load above it
// is already a new single-rep max. The warning starts at 1.25 times it, and at least 10 kg
// (22 lb) above it:
//   - 1.25: a 25% jump in maximal strength in one session. Measured gains in trained lifters are
//     of the order of 1-2% a month, and even a beginner's first months are far below 25% a session,
//     so a real lift almost never reaches it; a typo by a factor of 10 always does.
//   - 10 kg: on light exercises a single dumbbell step is already 25% (8 to 10 kg), so the ratio
//     alone would warn on ordinary progress.
// With no history to compare with (a first time), only a load above any human lift warns:
// 500 kg (1,100 lb), about the heaviest deadlift ever recorded (501 kg, 2020).
// On an assisted machine the lower load is the harder one, so a high number is no record and no
// warning is given.
import { best1RM, formulaOf } from './onerm.js'
import { isAssisted } from './exercises.js'
import { entryDbLoad } from './dumbbells.js'
import { isWarmupRow } from './workout-model.js'

export const PLAUSIBLE_RATIO = 1.25
const MIN_GAP = { kg: 10, lb: 22 }
const HUMAN_CAP = { kg: 500, lb: 1100 }

const unitOf = S => (S?.unit === 'lb' ? 'lb' : 'kg')

/** The heaviest load on one set row (either side of a unilateral row), or 0. */
export function setLoad(s) {
  if (!s) return 0
  const ws = [s.w, s.sides?.L?.w, s.sides?.R?.w].map(Number).filter(w => Number.isFinite(w) && w > 0)
  return ws.length ? Math.max(...ws) : 0
}

/** The heaviest load typed on the work rows of `entry` (ticked or not), or 0. */
export function topLoadOf(entry) {
  let top = 0
  for (const s of entry?.sets || []) if (s && !isWarmupRow(s)) top = Math.max(top, setLoad(s))
  return top
}

/**
 * What the loads of `entry` are held against, worked out once per exercise:
 * { ref, kind: 'rm' | 'cap', unit }, or null when no load can be implausible (an assisted machine).
 */
export function loadReference(S, entry) {
  if (!entry?.id || isAssisted(entry.id)) return null
  const unit = unitOf(S)
  const best = best1RM(S, entry.id, formulaOf(S), entryDbLoad(entry))
  if (best && best.est > 0) return { ref: Math.round(best.est * 10) / 10, kind: 'rm', unit }
  return { ref: HUMAN_CAP[unit], kind: 'cap', unit }
}

/** Is load `w` implausible against `reference` (loadReference)? */
export function isImplausible(reference, w) {
  if (!reference || !(w > 0)) return false
  if (reference.kind === 'cap') return w > reference.ref
  return w > reference.ref * PLAUSIBLE_RATIO && w - reference.ref >= MIN_GAP[reference.unit]
}

/**
 * Whether set row `s` asks to be confirmed before it is ticked: a work row whose load is
 * implausible and was not confirmed at that very load (s.loadOk; a changed weight asks again).
 * Returns null, or { w, ref, kind }.
 */
export function setNeedsConfirm(reference, s) {
  if (!s || isWarmupRow(s)) return null
  const w = setLoad(s)
  if (!isImplausible(reference, w) || Number(s.loadOk) === w) return null
  return { w, ref: reference.ref, kind: reference.kind }
}

/**
 * Whether the heaviest weight on `entry` is implausible for this person, against the history in `S`,
 * not counting rows already confirmed. Returns null, or { w, ref, kind } for the heaviest such row.
 */
export function implausibleLoad(S, entry) {
  const reference = loadReference(S, entry)
  let out = null
  for (const s of entry?.sets || []) {
    const hit = setNeedsConfirm(reference, s)
    if (hit && (!out || hit.w > out.w)) out = hit
  }
  return out
}
