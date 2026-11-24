// Olympus: changing the gym of the session in progress (the chip at the top of the workout).
// Each gym has its own machines, so the rows an exercise opens with come from its last session in
// that gym (lib/gyms.js historyAtGym). Picking another gym mid-workout builds every exercise again
// the way it would have opened there, and gives the new numbers to the sets not ticked yet. Ticked
// sets are what was lifted and stay as they are.
import { buildSets, applyIntensifierPlan, modeOf } from './history.js'
import { isWarmupRow } from './workout-model.js'
import { buildPlannedEntry, plannedConfigOf, builtOutOfProgression } from './session-start.js'
import { defaultIncrement, weightIncrement } from './progression.js'
import { dropGrid } from './plates.js'
import { historyAs, dbLoadFor, ownedWeightsFor } from './dumbbells.js'
import { markSuggested } from './suggested.js'
import { cleanGym, activeGym, sessionPast } from './gyms.js'

// The fields of a row that say what is lifted (lib/suggested.js FIELDS): the ones a new gym moves.
const VALUES = ['w', 'r', 'sec', 'min', 'speed', 'incline']

/**
 * `current` with each row not done taking the numbers of the row at the same place in `fresh`:
 * the n-th warm-up from the n-th fresh warm-up, the n-th work set from the n-th fresh work set.
 * Done rows, and rows with no counterpart, are kept as they are. The row keeps its own shape (a
 * drop set stays one); only its numbers change, and they show as a suggestion again.
 */
export function refillUndone(current, fresh) {
  const pool = { warm: (fresh || []).filter(isWarmupRow), work: (fresh || []).filter(x => !isWarmupRow(x)) }
  const seen = { warm: 0, work: 0 }
  return (current || []).map(row => {
    const kind = isWarmupRow(row) ? 'warm' : 'work'
    const from = pool[kind][seen[kind]++]
    if (!row || row.done || !from) return row
    const next = { ...row }
    let changed = false
    for (const f of VALUES) {
      if (!(f in from)) continue
      if (next[f] !== from[f]) changed = true
      next[f] = from[f]
    }
    if (!changed) return row
    delete next.weightOrigin
    return markSuggested([next])[0]
  })
}

/**
 * The rows `entry` would open with now, built from `past` the way an exercise added to the session
 * is (views/Workout.jsx addExercise): a planned exercise through its routine, a freestyle one from
 * what it did last time. Returns { sets, built } with `built` set for a planned exercise.
 */
export function rowsFor(s, past, entry) {
  const routine = entry?.rid ? (s.routines || []).find(r => r.id === entry.rid) : null
  if (routine) {
    const cfg = { ...plannedConfigOf(entry), id: entry.id }
    const built = buildPlannedEntry(past, cfg, routine, { noProg: builtOutOfProgression(entry, routine) })
    return { sets: built.sets, built }
  }
  const full = { ...(entry?.target || {}), id: entry.id }
  if (!(full.sets > 0)) full.sets = (entry.sets || []).filter(x => !isWarmupRow(x)).length || 1
  const step = modeOf(full) === 'reps' ? (ownedWeightsFor(s, full) || weightIncrement(full, s.unit)) : defaultIncrement(entry.id, s.unit)
  const sets = applyIntensifierPlan(buildSets(historyAs(past, entry.id, dbLoadFor(s, full)), full, { step, preferLast: true }), full, dropGrid(s, full))
  return { sets, built: null }
}

/**
 * Sets the gym of the session in progress to `gym` ('' for no gym), inside a store update, and
 * gives every exercise's unticked sets the numbers they would open with in that gym. Returns how
 * many exercises changed. A workout being edited after it was saved only changes its label: its
 * sets were all lifted already.
 */
export function changeSessionGym(s, gym) {
  const A = s?.active
  if (!A) return 0
  const before = activeGym(s)
  A.gym = cleanGym(gym)
  if (A.gym === before || A.editingWorkoutId != null) return 0
  const past = sessionPast(s)
  let n = 0
  for (const entry of A.entries || []) {
    if (!(entry.sets || []).some(x => !x.done)) continue
    const { sets, built } = rowsFor(s, past, entry)
    const next = refillUndone(entry.sets, sets)
    const moved = next.some((row, i) => row !== entry.sets[i])
    if (built && !entry.sets.some(x => x.done)) {
      // Nothing lifted yet: the plan and the target are the new gym's too, so the card's
      // progression line explains the numbers now on it.
      entry.target = built.target
      entry.plan = built.plan
      entry.planned = built.planned
    }
    if (moved) { entry.sets = next; n++ }
  }
  return n
}
