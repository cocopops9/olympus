// Olympus: a set as history prints it (lib/history.js setLabel) cut into the pieces a card draws
// apart, so every number can carry the unit that says what it is. Posts carry only the label
// string (api/social.js), and posts already published keep theirs, which is why this reads the
// string instead of the set. The label stays the single source of the wording.
//
// The shapes setLabel writes, and the part each becomes:
//   "30×16"              weight×reps                 { w: '30', r: '16' }
//   "+10 × 12"           bodyweight plus a belt      { w: '+10', r: '12' }
//   "20 each × 8"        a dumbbell load that says   { w: '20', tag: 'each', r: '8' }
//                        what it means (any language)
//   "12", "10+4+2"       bodyweight reps             { r: '12' }
//   "5 min @ 12 km/h"    cardio                      { min: '5', speed: '12', su: 'km/h' }
//   "1:05:00 @ 12 km/h"  cardio past an hour         { clock: '1:05:00', speed: '12', su: 'km/h' }
//   "90 min"             a sport                     { min: '90' }
//   "0:45", "0:45 · 20"  a timed set (and its load)  { clock: '0:45' }, then { w: '20' } for the load
// Everything else (drop arrows, sides, the failure mark, an effort tail, an incline) stays text.

// A number as fmtNum writes it in any UI language: digits with the locale's grouping and
// decimal marks (",", ".", "'", "’", a no-break or narrow no-break space), always ending on a
// digit. Reps are whole numbers, a rest-pause set's bursts joined by "+".
const NUM = "\\d(?:[\\d.,'’\u00a0\u202f]*\\d)?"
const REPS = '\\d+(?:\\+\\d+)*'
const SPEED = `(?<speed>${NUM}) (?<su>km/h|mph)`

// Tried left to right at each position; the first alternative that matches wins, so the longer
// shapes come before the ones they contain.
const TOKEN = new RegExp([
  `(?<cmin>${NUM}(?::\\d\\d)?) min(?: @ ${SPEED})?`,
  `(?<cclock>\\d+:\\d\\d:\\d\\d)(?: @ (?<speed2>${NUM}) (?<su2>km/h|mph))?`,
  `(?<tclock>\\d+:\\d\\d)(?: · (?<tw>${NUM}))?`,
  `\\+(?<aw>${NUM}) × (?<ar>${REPS})`,
  `(?<dw>${NUM}) (?<tag>[^\\d×·↘()]+?) × (?<dr>${REPS})`,
  `(?<w>${NUM})×(?<r>${REPS})`,
  // Bare reps only where a bodyweight set's reps stand: alone, after a drop arrow, or after a
  // side's key ("L 8 · R 7", the key translated), so the "2" of "(RIR 2)" or the "5" of
  // "5% incline" is never read as reps.
  `(?<=^|↘ |(?:^|· )[^\\d\\s·]{1,5} )(?<br>${REPS})(?=$| F| \\(| ·| ↘)`,
].join('|'), 'gu')

function partOf(g) {
  if (g.cmin != null) return g.speed != null ? { min: g.cmin, speed: g.speed, su: g.su } : { min: g.cmin }
  if (g.cclock != null) return g.speed2 != null ? { clock: g.cclock, speed: g.speed2, su: g.su2 } : { clock: g.cclock }
  if (g.tclock != null) return { clock: g.tclock, ...(g.tw != null ? { load: g.tw } : {}) }
  if (g.aw != null) return { w: '+' + g.aw, r: g.ar }
  if (g.dw != null) return { w: g.dw, tag: g.tag, r: g.dr }
  if (g.w != null) return { w: g.w, r: g.r }
  return { r: g.br }
}

/** [{ text } | { w?, tag?, r } | { min | clock, speed?, su?, load? }]: the label in order. */
export function setLabelParts(label) {
  const s = String(label ?? '')
  const parts = []
  let at = 0
  for (const m of s.matchAll(TOKEN)) {
    if (m.index > at) parts.push({ text: s.slice(at, m.index) })
    parts.push(partOf(m.groups))
    at = m.index + m[0].length
  }
  if (at < s.length) parts.push({ text: s.slice(at) })
  return parts
}

/** True when the label is a single weight×reps pair and nothing else. */
export const isPlainPair = parts => parts.length === 1 && parts[0].w != null && parts[0].r != null

/** How many parts carry reps: with one, the reps can say "reps" without crowding the chip. */
export const repParts = parts => parts.filter(p => p.r != null).length
