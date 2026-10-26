// Olympus: the numbers a new exercise opens with are a suggestion, not a log. An exercise added to
// the workout starts from what you did last time (or 0 kg and 10 reps the first time), and those
// numbers show faded (`sug` on a set row: the fields still untouched) until you change them or
// tick the set, so what you typed and what the app guessed never look the same. Live-session
// bookkeeping only: a finished workout never keeps it (lib/finish-workout.js finishedRow).
const FIELDS = ['w', 'r', 'sec', 'min', 'speed', 'incline']

/** `sets` with every row not yet done marked as suggested in the fields it has. */
export function markSuggested(sets) {
  return (sets || []).map(s => {
    if (!s || s.done) return s
    const sug = FIELDS.filter(f => f in s)
    return sug.length ? { ...s, sug } : s
  })
}

/** Whether field `f` of row `s` still shows the suggestion. */
export const isSuggested = (s, f) => !s?.done && Array.isArray(s?.sug) && s.sug.includes(f)

/** Takes field `f` (or, with no field, the whole row) off the suggestion; edits `row` in place. */
export function clearSuggested(row, f) {
  if (!row || !Array.isArray(row.sug)) return row
  const left = f ? row.sug.filter(x => x !== f) : []
  if (left.length) row.sug = left; else delete row.sug
  return row
}
