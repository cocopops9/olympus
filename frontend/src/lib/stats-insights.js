// Olympus: the Highlights card at the top of Stats — what the numbers below add up to, said in a
// sentence each, for someone who would never read a 1RM curve. Each highlight is plain data here
// (views/Stats.jsx words it), worked out from the same helpers the cards themselves use, so a
// highlight never says something its card would not show.
import { weekKey, isoOf, weekStartOf } from './format.js'
import { workoutDay, workoutAt } from './history.js'
import { e1rmSeries } from './onerm.js'
import { loadOfWorkouts } from './muscles.js'

const DAY = 86400000
// How far back "lately" reaches for a lift's progress, and for a muscle that dropped out.
export const PROGRESS_DAYS = 30
export const GAP_DAYS = 14
// The muscles worth a sentence when they go untrained. The small ones a compound lift hits on its
// way (serratus, forearms, hip flexors…) would read as nagging.
const MAJOR = ['chest', 'upper-back', 'deltoids', 'biceps', 'triceps', 'quadriceps', 'hamstring', 'gluteal', 'calves', 'abs', 'lower-back', 'trapezius']
// A muscle counts as one you train once it had this many sets in the last 90 days: a single
// accessory set months ago is not a habit that lapsed.
const HABIT_SETS = 4

/** Workouts this week and last week, by the profile's own first weekday. */
export function weekCounts(S, now = Date.now()) {
  const ws = weekStartOf(S)
  const thisWeek = weekKey(isoOf(new Date(now)), ws)
  const lastWeek = weekKey(isoOf(new Date(now - 7 * DAY)), ws)
  let cur = 0, before = 0
  for (const w of S.workouts || []) {
    const day = workoutDay(w)
    if (!day) continue
    const key = weekKey(day, ws)
    if (key === thisWeek) cur++
    else if (key === lastWeek) before++
  }
  return { now: cur, before }
}

/**
 * The lift that went up the most lately: the best estimated 1RM of the last PROGRESS_DAYS days
 * against the best one before them, as a share of the older best. Null when nothing went up, or
 * nothing has a before and an after.
 */
export function bestProgress(S, now = Date.now()) {
  const since = now - PROGRESS_DAYS * DAY
  const ids = new Set()
  for (const w of S.workouts || []) {
    if (!(workoutAt(w) >= since)) continue
    for (const e of w.entries || []) if (e?.id) ids.add(e.id)
  }
  let best = null
  for (const id of ids) {
    const pts = e1rmSeries(S, id)
    let recent = 0, earlier = 0
    for (const p of pts) {
      if (!(p.y > 0)) continue
      if (p.t >= since) recent = Math.max(recent, p.y)
      else earlier = Math.max(earlier, p.y)
    }
    if (!(earlier > 0) || !(recent > earlier)) continue
    const pct = (recent - earlier) / earlier * 100
    if (!best || pct > best.pct) best = { id, from: earlier, to: recent, gain: recent - earlier, pct }
  }
  return best
}

/** Major muscles trained regularly over 90 days that got no set at all in the last GAP_DAYS. */
export function trainingGaps(S, now = Date.now()) {
  const inLast = days => (S.workouts || []).filter(w => workoutAt(w) >= now - days * DAY)
  const habit = loadOfWorkouts(inLast(90))
  const lately = loadOfWorkouts(inLast(GAP_DAYS))
  return MAJOR
    .filter(m => (habit[m] || 0) >= HABIT_SETS && !((lately[m] || 0) > 0))
    .sort((a, b) => habit[b] - habit[a])
}

/** Personal records set this calendar month. */
export function monthRecords(S, now = Date.now()) {
  const month = isoOf(new Date(now)).slice(0, 7)
  return (S.workouts || []).reduce((n, w) => n + (workoutDay(w)?.slice(0, 7) === month && Array.isArray(w.prs) ? w.prs.length : 0), 0)
}

/**
 * The highlights, most telling first, each { kind, …data }:
 *   week     { now, before }          workouts this week and last
 *   progress { id, from, to, gain, pct }
 *   gap      { muscles }              up to three, most trained first
 *   records  { n }
 */
export function statsInsights(S, now = Date.now()) {
  if (!(S.workouts || []).length) return []
  const out = [{ kind: 'week', ...weekCounts(S, now) }]
  const progress = bestProgress(S, now)
  if (progress) out.push({ kind: 'progress', ...progress })
  const gaps = trainingGaps(S, now)
  if (gaps.length) out.push({ kind: 'gap', muscles: gaps.slice(0, 3) })
  const n = monthRecords(S, now)
  if (n > 0) out.push({ kind: 'records', n })
  return out
}
