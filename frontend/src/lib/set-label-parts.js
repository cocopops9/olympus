// Olympus: a set as history prints it (lib/history.js setLabel, "30×16", "100×8 ↘ 80×6",
// "L 15×8 · R 15×7") cut into the pieces a card draws apart: each weight×reps pair on its own,
// so the weight can carry its unit and the reps theirs, and everything else as plain text.
// The label stays the single source of the wording; this only finds the pairs inside it. Posts
// carry only the label string (api/social.js), which is why it works on the string.

// A number as fmtNum writes it in any UI language: digits with the locale's grouping and
// decimal marks (",", ".", "'", "’", a no-break or narrow no-break space), always ending on a
// digit. The reps after the × are whole numbers, a rest-pause set's bursts joined by "+".
const PAIR = /(\d(?:[\d.,'’  ]*\d)?)×(\d+(?:\+\d+)*)/g

/** [{ text } | { w, r }]: the label in order, its weight×reps pairs picked out. */
export function setLabelParts(label) {
  const s = String(label ?? '')
  const parts = []
  let at = 0
  for (const m of s.matchAll(PAIR)) {
    if (m.index > at) parts.push({ text: s.slice(at, m.index) })
    parts.push({ w: m[1], r: m[2] })
    at = m.index + m[0].length
  }
  if (at < s.length) parts.push({ text: s.slice(at) })
  return parts
}

/** True when the label is a single weight×reps pair and nothing else: the one shape given a "reps" word. */
export const isPlainPair = parts => parts.length === 1 && parts[0].w != null
