// Olympus: a weight that is very likely a typo (an extra zero, 760 for 76). The workout card shows a
// warning under the exercise while such a weight is on one of its rows; nothing is blocked or
// changed, since a real lift must still be loggable.
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

/** The heaviest load typed on the work rows of `entry` (ticked or not), or 0. */
export function topLoadOf(entry) {
  let top = 0
  for (const s of entry?.sets || []) {
    if (!s || isWarmupRow(s)) continue
    const ws = [s.w, s.sides?.L?.w, s.sides?.R?.w].map(Number).filter(w => Number.isFinite(w) && w > 0)
    for (const w of ws) if (w > top) top = w
  }
  return top
}

/**
 * Whether the heaviest weight on `entry` is implausible for this person, against the history in `S`.
 * Returns null, or { w, ref, kind }: kind 'rm' (above 1.25 x the best estimated 1RM `ref`) or
 * 'cap' (no history, above any human lift `ref`).
 */
export function implausibleLoad(S, entry) {
  if (!entry?.id || isAssisted(entry.id)) return null
  const w = topLoadOf(entry)
  if (!(w > 0)) return null
  const unit = S?.unit === 'lb' ? 'lb' : 'kg'
  const best = best1RM(S, entry.id, formulaOf(S), entryDbLoad(entry))
  if (best && best.est > 0) {
    const ref = Math.round(best.est * 10) / 10
    return w > ref * PLAUSIBLE_RATIO && w - ref >= MIN_GAP[unit] ? { w, ref, kind: 'rm' } : null
  }
  return w > HUMAN_CAP[unit] ? { w, ref: HUMAN_CAP[unit], kind: 'cap' } : null
}
