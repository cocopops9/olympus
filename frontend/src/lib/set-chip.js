// A logged set taken apart for the set chips of a past workout (WorkoutDetail in sheets.jsx).
// The one-line "100×10 · 80×10" read as two numbers with nothing saying which was the weight and
// which the reps (2026-11-22): a chip shows the load with its unit over the reps with theirs.
// Only a rep set has that shape. A timed set, cardio and a set logged per side keep the line
// setLabel writes for them, which already names its units ("0:45", "20 min @ 8 km/h", "L … · R …").
import { fmtNum } from './format.js'
import { setReadOf, setLabel, isBw, burstRepsOf, effortOfSet } from './history.js'
import { isWarmupRow, isFailureSet, isSideSet, dropsOf } from './workout-model.js'
import { dbLoadOf, bellsIn } from './dumbbells.js'

/**
 * `{ text }` for a set read as a line, or for a rep set:
 * `{ parts: [{ load, reps }], fail, effort, warmup }`, where `parts` is the set followed by the
 * drops of a drop-set, and `load` is `{ value, unit, per }` (`per`: 'each' / 'total' for a pair of
 * dumbbells that says which it means, '+' for weight added to the body) or null for bodyweight
 * alone. `reps` is a string: "10", or a rest-pause set's bursts "10+4+2".
 */
export function setChipOf(id, s, cfg, { unit = 'kg', speedUnit } = {}) {
  const { c, mode } = setReadOf(id, s, cfg)
  if (mode !== 'reps' || isSideSet(s)) return { text: setLabel(id, s, cfg, speedUnit) }
  const bw = isBw(c)
  const meaning = !bw && bellsIn(c) === 2 ? dbLoadOf(c.dbLoad) : null
  const per = bw ? '+' : meaning === 'each' || meaning === 'total' ? meaning : null
  const loadOf = w => (bw && !(w > 0) ? null : { value: fmtNum(w || 0), unit, per })
  const drops = dropsOf(s).filter(d => (Number(d?.r) || 0) > 0)
  return {
    parts: [
      { load: loadOf(s.w), reps: String(burstRepsOf(s, c)) },
      ...drops.map(d => ({ load: loadOf(Number(d.w) || 0), reps: String(Number(d.r)) })),
    ],
    fail: isFailureSet(s),
    effort: effortOfSet(s),
    warmup: isWarmupRow(s),
  }
}
