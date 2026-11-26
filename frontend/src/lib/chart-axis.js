// Time axis and trend line for LineChart. Pure helpers, so the layout rules are tested here
// rather than eyeballed on a phone.
//
// The x position of every point is proportional to its timestamp (LineChart maps t linearly
// onto the plot width). What this file decides is where the date labels go and what they say,
// so that a history spanning several years reads as such: ticks sit on calendar boundaries
// (a day, a week, the first of a month, the first of a year), are spaced evenly in time, and
// every year change is labelled with the year itself.

const DAY = 864e5
const MONTH_MS = 30.436875 * DAY   // mean Gregorian month, used only to size a span

// Candidate steps, finest first. Months step from January, so a quarterly axis always lands
// on Jan/Apr/Jul/Oct and the January tick (which carries the year) is never skipped.
const STEPS = [
  { unit: 'day', n: 1 }, { unit: 'day', n: 2 }, { unit: 'day', n: 7 }, { unit: 'day', n: 14 },
  { unit: 'month', n: 1 }, { unit: 'month', n: 2 }, { unit: 'month', n: 3 }, { unit: 'month', n: 6 },
  { unit: 'year', n: 1 }, { unit: 'year', n: 2 }, { unit: 'year', n: 5 }, { unit: 'year', n: 10 },
]

// Rough advance width of one label character at the chart's 9.5px font, in viewBox units.
// An over-estimate on purpose: digits and Latin capitals run about 5.5, so 6 keeps a margin
// for wider scripts rather than letting two labels touch.
export const CHAR_W = 6

const startOfDay = ms => { const d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), d.getDate()) }

// Every tick of one step inside [t0, t1], as Date objects on local calendar boundaries.
function ticksForStep(t0, t1, step) {
  const out = []
  if (step.unit === 'day') {
    let d = startOfDay(t0)
    if (step.n === 7 || step.n === 14) {
      // Weeks start on Monday; a fortnight keeps every other Monday counted from a fixed epoch
      // (Monday 1970-01-05) so the choice does not jump around as the range moves.
      while (d.getDay() !== 1) d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
      if (step.n === 14) {
        const weeks = Math.round((d - new Date(1970, 0, 5)) / (7 * DAY))
        if (weeks % 2) d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7)
      }
    } else if (+d < t0) d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
    for (; +d <= t1; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + step.n)) if (+d >= t0) out.push(d)
    return out
  }
  if (step.unit === 'month') {
    const s = new Date(t0)
    let m = Math.ceil((s.getFullYear() * 12 + s.getMonth() + (s.getDate() > 1 || s.getHours() || s.getMinutes() ? 1 : 0)) / step.n) * step.n
    for (let d = new Date(Math.floor(m / 12), m % 12, 1); +d <= t1; m += step.n, d = new Date(Math.floor(m / 12), m % 12, 1)) {
      if (+d >= t0) out.push(d)
    }
    return out
  }
  const y0 = new Date(t0).getFullYear()
  for (let y = Math.ceil(y0 / step.n) * step.n; ; y += step.n) {
    const d = new Date(y, 0, 1)
    if (+d > t1) break
    if (+d >= t0) out.push(d)
  }
  return out
}

// Label text for one tick. A tick on 1 January says the year, on a month or year axis alike,
// whenever the span crosses a year: "Oct Jan Apr" across a new year would otherwise read as
// the same year, which is exactly how June 2024 ended up looking like it sat next to
// September 2025.
function labelFor(d, step, monthName, crossesYear) {
  if (step.unit === 'year') return String(d.getFullYear())
  if (crossesYear && d.getMonth() === 0 && d.getDate() === 1) return String(d.getFullYear())
  if (step.unit === 'month') return monthName(d.getMonth())
  return d.getDate() + ' ' + monthName(d.getMonth())
}

// The axis for a span [t0, t1] drawn across `width` viewBox units.
// Returns { ticks: [{ t, label, year }], step } where `year` marks a tick labelled with a year.
// The finest step is chosen whose labels fit (each gap at least the widest label plus `gap`)
// and which gives no more than `maxTicks` ticks. A span with no tick of its own (a few hours)
// gets its two ends labelled by date instead, so the axis is never blank.
export function timeTicks(t0, t1, width, { monthName = m => String(m + 1), maxTicks = 6, gap = 8 } = {}) {
  if (!(t1 > t0) || !(width > 0)) return { ticks: [], step: null }
  const crossesYear = new Date(t0).getFullYear() !== new Date(t1).getFullYear()
  const span = t1 - t0
  for (const step of STEPS) {
    const approxMs = step.unit === 'day' ? step.n * DAY : step.unit === 'month' ? step.n * MONTH_MS : step.n * 12 * MONTH_MS
    if (span / approxMs > maxTicks + 1) continue    // cheap reject before building the list
    const dates = ticksForStep(t0, t1, step)
    if (dates.length > maxTicks) continue
    if (dates.length === 0) continue
    const ticks = dates.map(d => {
      const label = labelFor(d, step, monthName, crossesYear)
      return { t: +d, label, year: step.unit === 'year' || /^\d{4}$/.test(label) }
    })
    const widest = Math.max(...ticks.map(tk => tk.label.length)) * CHAR_W
    const pxPerStep = width * approxMs / span
    if (ticks.length > 1 && pxPerStep < widest + gap) continue
    return { ticks, step }
  }
  // Shorter than the finest step that still lands a tick: label both ends.
  const a = new Date(t0), b = new Date(t1)
  return {
    ticks: [
      { t: t0, label: a.getDate() + ' ' + monthName(a.getMonth()), year: false, anchor: 'start' },
      { t: t1, label: b.getDate() + ' ' + monthName(b.getMonth()), year: false, anchor: 'end' },
    ].filter((tk, i, all) => i === 0 || tk.label !== all[0].label),
    step: null,
  }
}

// Text anchor for a tick at x, so a label near either end of the plot stays inside the
// viewBox [0, W] instead of being cut off by the chart's clip.
export function anchorFor(x, label, W) {
  const half = label.length * CHAR_W / 2
  if (x + half > W) return 'end'
  if (x - half < 0) return 'start'
  return 'middle'
}

// Ordinary least-squares line through the points, y = a + b·t.
// Returns null when no line is defined: fewer than two points, or all at the same instant.
// Time is centred on its mean before fitting, so millisecond timestamps (~1.7e12) do not eat
// the precision of the slope.
// { slopePerMs, at(t), r2 } — r2 is the share of the variance the line explains (1 for points
// on a straight line, 0 for a flat cloud), so a caller can tell a real trend from noise.
export function linearTrend(points) {
  const pts = (points || []).filter(p => Number.isFinite(p?.t) && Number.isFinite(p?.y))
  const n = pts.length
  if (n < 2) return null
  const mt = pts.reduce((s, p) => s + p.t, 0) / n
  const my = pts.reduce((s, p) => s + p.y, 0) / n
  let sxx = 0, sxy = 0, syy = 0
  for (const p of pts) {
    const dt = p.t - mt, dy = p.y - my
    sxx += dt * dt; sxy += dt * dy; syy += dy * dy
  }
  if (sxx === 0) return null
  const b = sxy / sxx
  const r2 = syy === 0 ? 1 : (sxy * sxy) / (sxx * syy)
  return { slopePerMs: b, at: t => my + b * (t - mt), r2 }
}

// The slope expressed per week or per month, whichever reads better for the span shown:
// per week up to three months of data, per month beyond. { value, per: 'week' | 'month' }
export function trendRate(trend, spanMs) {
  if (!trend) return null
  const perMonth = spanMs > 3 * MONTH_MS
  return { value: trend.slopePerMs * (perMonth ? MONTH_MS : 7 * DAY), per: perMonth ? 'month' : 'week' }
}
