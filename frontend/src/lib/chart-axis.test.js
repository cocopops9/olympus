import { describe, expect, it } from 'vitest'
import { timeTicks, anchorFor, linearTrend, trendRate, CHAR_W } from './chart-axis.js'

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const monthName = m => MON[m]
const at = (y, m, d = 1, h = 12) => new Date(y, m - 1, d, h).getTime()
const W = 294   // LineChart's plot width: 340 minus its 34 + 12 margins
const DAY = 864e5

describe('timeTicks', () => {
  it('labels the year at every new year across a multi-year span', () => {
    const { ticks } = timeTicks(at(2024, 6, 10), at(2025, 9, 20), W, { monthName })
    const labels = ticks.map(t => t.label)
    expect(labels).toContain('2025')
    // Nothing in the label list may be a bare month name that repeats with no year between:
    // the year marker separates the two Junes, Julys, ... of different years.
    expect(labels).toEqual(['Jul', 'Oct', '2025', 'Apr', 'Jul'])
    // Any month name that appears twice has a year marker between the two.
    labels.forEach((l, i) => {
      const j = labels.indexOf(l, i + 1)
      if (j > i) expect(labels.slice(i + 1, j).some(x => /^\d{4}$/.test(x))).toBe(true)
    })
  })

  it('spaces ticks evenly in time on calendar boundaries', () => {
    const { ticks, step } = timeTicks(at(2023, 2, 3), at(2026, 10, 1), W, { monthName })
    expect(ticks.length).toBeGreaterThanOrEqual(3)
    for (const tk of ticks) {
      const d = new Date(tk.t)
      expect(d.getDate()).toBe(1)
      expect(d.getHours()).toBe(0)
    }
    // Equal calendar steps: the month index advances by the same amount each time.
    const idx = ticks.map(tk => { const d = new Date(tk.t); return d.getFullYear() * 12 + d.getMonth() })
    const diffs = idx.slice(1).map((v, i) => v - idx[i])
    expect(new Set(diffs).size).toBe(1)
    expect(step.unit === 'year' ? diffs[0] : diffs[0]).toBe(step.unit === 'year' ? 12 * step.n : step.n)
  })

  it('never lets two labels collide and respects the tick cap', () => {
    const spans = [
      [at(2026, 11, 1), at(2026, 11, 3)],
      [at(2026, 10, 1), at(2026, 11, 20)],
      [at(2026, 1, 1), at(2026, 12, 31)],
      [at(2020, 5, 5), at(2026, 11, 26)],
      [at(2010, 1, 1), at(2026, 1, 1)],
    ]
    for (const [t0, t1] of spans) {
      const { ticks } = timeTicks(t0, t1, W, { monthName })
      expect(ticks.length).toBeGreaterThan(0)
      expect(ticks.length).toBeLessThanOrEqual(6)
      const xs = ticks.map(tk => (tk.t - t0) / (t1 - t0) * W)
      for (let i = 1; i < ticks.length; i++) {
        const need = (ticks[i].label.length + ticks[i - 1].label.length) / 2 * CHAR_W
        expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(need)
      }
      for (const tk of ticks) { expect(tk.t).toBeGreaterThanOrEqual(t0); expect(tk.t).toBeLessThanOrEqual(t1) }
    }
  })

  it('uses month names within one year and day labels within a few weeks', () => {
    expect(timeTicks(at(2026, 2, 10), at(2026, 9, 10), W, { monthName }).ticks.every(t => MON.includes(t.label))).toBe(true)
    const short = timeTicks(at(2026, 11, 2), at(2026, 11, 26), W, { monthName }).ticks
    expect(short.every(t => /^\d+ [A-Z][a-z]{2}$/.test(t.label))).toBe(true)
  })

  it('labels both ends of a span too short for any tick', () => {
    const t0 = at(2026, 11, 26, 9), t1 = at(2026, 11, 26, 18)
    const { ticks } = timeTicks(t0, t1, W, { monthName })
    expect(ticks.map(t => t.label)).toEqual(['26 Nov'])
  })

  it('returns nothing for an empty or inverted span', () => {
    expect(timeTicks(5, 5, W).ticks).toEqual([])
    expect(timeTicks(6, 5, W).ticks).toEqual([])
  })
})

describe('anchorFor', () => {
  it('keeps edge labels inside the viewBox', () => {
    expect(anchorFor(338, '2025', 340)).toBe('end')
    expect(anchorFor(2, '2025', 340)).toBe('start')
    expect(anchorFor(170, '2025', 340)).toBe('middle')
  })
})

describe('linearTrend', () => {
  it('recovers an exact line', () => {
    const t0 = at(2026, 1, 1)
    const pts = [0, 7, 14, 28].map(d => ({ t: t0 + d * DAY, y: 80 - 0.1 * d }))
    const tr = linearTrend(pts)
    expect(tr.slopePerMs * DAY).toBeCloseTo(-0.1, 10)
    expect(tr.at(t0)).toBeCloseTo(80, 8)
    expect(tr.at(t0 + 28 * DAY)).toBeCloseTo(77.2, 8)
    expect(tr.r2).toBeCloseTo(1, 10)
  })

  it('matches the textbook least-squares fit on noisy data', () => {
    // x = 0..4 days, y = [1, 3, 2, 5, 4]: slope 0.8/day, intercept 1.4, r^2 = 0.64.
    const t0 = at(2026, 3, 1)
    const tr = linearTrend([1, 3, 2, 5, 4].map((y, i) => ({ t: t0 + i * DAY, y })))
    expect(tr.slopePerMs * DAY).toBeCloseTo(0.8, 10)
    expect(tr.at(t0)).toBeCloseTo(1.4, 8)
    expect(tr.r2).toBeCloseTo(0.64, 10)
  })

  it('weights points by their date, not their order', () => {
    // Two early points a year before two late ones: the slope is the yearly change, not per entry.
    const pts = [{ t: at(2024, 6, 1), y: 100 }, { t: at(2024, 6, 2), y: 100 }, { t: at(2025, 6, 1), y: 112 }, { t: at(2025, 6, 2), y: 112 }]
    const rate = trendRate(linearTrend(pts), pts[3].t - pts[0].t)
    expect(rate.per).toBe('month')
    expect(rate.value).toBeCloseTo(1, 1)
  })

  it('is undefined for fewer than two points or a single instant', () => {
    expect(linearTrend([])).toBeNull()
    expect(linearTrend([{ t: 1, y: 2 }])).toBeNull()
    expect(linearTrend([{ t: 1, y: 2 }, { t: 1, y: 3 }])).toBeNull()
  })

  it('reports a flat series as a zero slope', () => {
    const tr = linearTrend([{ t: 0, y: 5 }, { t: DAY, y: 5 }, { t: 2 * DAY, y: 5 }])
    expect(tr.slopePerMs).toBe(0)
  })
})

describe('trendRate', () => {
  it('reads per week for short spans and per month for long ones', () => {
    const tr = { slopePerMs: 1 / DAY }
    expect(trendRate(tr, 30 * DAY)).toEqual({ value: 7, per: 'week' })
    expect(trendRate(tr, 200 * DAY).per).toBe('month')
    expect(trendRate(tr, 200 * DAY).value).toBeCloseTo(30.436875, 6)
  })
})
