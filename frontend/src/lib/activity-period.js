// Olympus: the period the Activity card of Stats is showing (components/Activity.jsx), and what
// was trained in it. The card used to show only the current month, the last twelve weeks and the
// last year; an offset now steps back through earlier ones, one whole page at a time:
//   month  one calendar month, offset in months;
//   weeks  twelve whole weeks ending with the current week, offset in pages of twelve weeks;
//   year   one calendar year, offset in years.
// Offsets are 0 for the period holding today and negative before it; nothing lies ahead of today.
// Dates are local ISO days ('2026-11-23'), built at noon so a DST change cannot move a day.
import { isoOf, startOfWeek, weekKey, MONDAY } from './format.js'

/** How many weeks the Weeks view shows on one page. */
export const WEEKS_PER_PAGE = 12

const noon = iso => new Date(iso + 'T12:00:00')
const addDays = (iso, n) => { const d = noon(iso); d.setDate(d.getDate() + n); return isoOf(d) }

/**
 * The first and last day of the period `offset` steps away from the one holding `today`.
 * @param {'month'|'weeks'|'year'} view
 * @param {number} offset 0 for the current period, -1 for the one before, and so on.
 * @param {string} today Local ISO day.
 * @param {number} ws First day of the week (0 Sunday, 1 Monday).
 * @returns {{ from: string, to: string }} Both inclusive.
 */
export function periodOf(view, offset, today, ws = MONDAY) {
  const off = Math.min(0, Math.trunc(offset) || 0)
  const d = noon(today)
  if (view === 'year') {
    const y = d.getFullYear() + off
    return { from: `${y}-01-01`, to: `${y}-12-31` }
  }
  if (view === 'weeks') {
    const lastWeek = addDays(isoOf(startOfWeek(today, ws)), off * WEEKS_PER_PAGE * 7)
    return { from: addDays(lastWeek, -(WEEKS_PER_PAGE - 1) * 7), to: addDays(lastWeek, 6) }
  }
  const first = new Date(d.getFullYear(), d.getMonth() + off, 1, 12)
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0, 12)
  return { from: isoOf(first), to: isoOf(last) }
}

/**
 * The longest run of consecutive weeks with at least one trained day among `days`.
 * @param {string[]} days Local ISO days, any order, duplicates allowed.
 */
export function bestWeekRun(days, ws = MONDAY) {
  const weeks = new Set(days.map(d => weekKey(d, ws)))
  let best = 0
  for (const w of weeks) {
    if (weeks.has(addDays(w, -7))) continue
    let run = 0
    for (let c = w; weeks.has(c); c = addDays(c, 7)) run++
    best = Math.max(best, run)
  }
  return best
}

/**
 * What was trained between `from` and `to` (inclusive), from the per-day totals of
 * components/Activity.jsx activityByDay ({ [iso]: { n, min, vol } }).
 * @returns {{ days: number, n: number, min: number, vol: number, bestRun: number }}
 */
export function periodSummary(agg, from, to, ws = MONDAY) {
  const inside = Object.keys(agg || {}).filter(d => d >= from && d <= to)
  let n = 0, min = 0, vol = 0
  for (const d of inside) { n += agg[d].n || 0; min += agg[d].min || 0; vol += agg[d].vol || 0 }
  return { days: inside.length, n, min, vol, bestRun: bestWeekRun(inside, ws) }
}
