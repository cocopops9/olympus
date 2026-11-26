// Validation of the personal medal tiers (lib/athlete-profile.js) on simulated athletes.
//
// The question: does every kind of athlete need a comparable amount of training for each tier?
// The athletes are simulated with a model of a different form from the one the tiers assume:
// each has their own ceiling and their own speed of approach (an exponential in z, not the
// hyperbola of the tiers), session-to-session noise of 2.5 % on the estimated one-rep max,
// lighter first sessions (learning), missed sessions, ageing and the body weight of the
// archetype. The medal engine sees only the logged sets, as the app does.
//
// Criteria, fixed before looking at the results:
//   1. For each tier, the median weeks to reach it differ by at most a factor 2.5 between the
//      slowest and the fastest archetype (comparable effort);
//   2. median weeks rise strictly from bronze to Olympian for every archetype;
//   3. no archetype reaches bronze in under 3 weeks or Olympian in under 78 weeks at the median
//      (every tier takes work);
//   4. every archetype reaches gold within the simulated four years in at least 70 % of runs
//      (reachable with effort).
// Limits: the simulator's ceilings and speeds are assumptions of the same kind as the model's,
// so this checks internal consistency and robustness to the curve's form, noise and adherence,
// not the truth of the numbers about real people.
import { describe, it, expect } from 'vitest'
import { profileOf, athleteBase, valueAt, TIERS } from './athlete-profile.js'
import { LIFTS } from './strength-level.js'

const BENCH = LIFTS.find(l => l.key === 'bench')
const DAY = 86400000

function rng(seed) {
  let a = seed >>> 0
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
const gauss = r => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r())

export const ARCHETYPES = [
  { key: 'pro-28M-105kg-10%', sex: 'male', age: 28, bw: 105, fat: 10, z0: 2.3, cap: 2.65, tau: 1.5, years: 8 },
  { key: 'novice-35M-80kg', sex: 'male', age: 35, bw: 80, z0: -1.0, cap: 2.0, tau: 1.0 },
  { key: 'novice-58F-50kg', sex: 'female', age: 58, bw: 50, z0: -1.0, cap: 1.6, tau: 1.2 },
  { key: 'novice-18F-60kg', sex: 'female', age: 18, bw: 60, z0: -1.0, cap: 2.1, tau: 0.9 },
  { key: 'novice-70M-75kg', sex: 'male', age: 70, bw: 75, z0: -1.1, cap: 1.4, tau: 1.3 },
  { key: 'trained5y-45M-90kg', sex: 'male', age: 45, bw: 90, z0: 1.1, cap: 1.9, tau: 1.5, years: 5 },
  { key: 'returning-40M-85kg', sex: 'male', age: 40, bw: 85, z0: -0.2, cap: 1.9, tau: 0.6, returning: true },
]

/** One simulated athlete over `weeks`: the week each tier was first earned (or null). */
export function simulate(a, seed, weeks = 208) {
  const r = rng(seed)
  const birthYear = 2020 - a.age
  const start = Date.parse('2020-01-06T18:00:00Z')
  const cap = a.cap + 0.3 * gauss(r)
  const tau = a.tau * Math.exp(0.35 * gauss(r))
  const s0 = a.z0 + 0.2 * gauss(r)
  const perWeek = 2 + Math.floor(r() * 3)        // 2 to 4 sessions planned a week
  const S = { body: a.sex, birth: `${birthYear}-01-01`, unit: 'kg', bodyweight: [{ d: '2020-01-01', w: a.bw }], measurements: a.fat ? [{ d: '2020-01-01', bodyFat: a.fat }] : [], workouts: [] }
  const facts = a.returning ? { returning: true } : a.years && r() < 0.5 ? { trainingYears: a.years } : {}
  const earned = Object.fromEntries(TIERS.map(t => [t, null]))
  let trained = 0, n = 0
  for (let wk = 0; wk < weeks; wk++) {
    for (let s = 0; s < perWeek; s++) {
      if (r() < 0.15) continue                    // a missed session
      trained += 1 / (perWeek * 52)
      const t = start + (wk * 7 + s * 2) * DAY
      const d = new Date(t).toISOString().slice(0, 10)
      const z = cap - (cap - s0) * Math.exp(-trained / tau)
      const ageNow = a.age + (wk / 52)
      const who = { sex: a.sex, age: Math.floor(ageNow), bw: a.bw, unit: 'kg', fat: a.fat ?? null }
      const learning = n < 2 ? 0.95 : 1
      const w = Math.round(valueAt(BENCH, z, who) * learning * Math.exp(0.025 * gauss(r)) * 2) / 2
      S.workouts.push({ d, start: t, end: t + 3600000, entries: [{ id: BENCH.id, sets: [{ w, r: 1, done: true }] }] })
      n++
    }
    const now = start + (wk * 7 + 6) * DAY
    const p = profileOf(S, BENCH, athleteBase(S, now), facts)
    if (p.status !== 'ready') continue
    for (const tier of TIERS) if (earned[tier] == null && p.earnedAt(tier)) earned[tier] = wk + 1
  }
  return earned
}

const median = xs => { const a = xs.filter(x => x != null).sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : null }

describe('personal tiers on simulated athletes', () => {
  const RUNS = 40, WEEKS = 208
  const table = ARCHETYPES.map(a => {
    const runs = Array.from({ length: RUNS }, (_, i) => simulate(a, 1000 + i * 7919, WEEKS))
    const row = { key: a.key }
    for (const tier of TIERS) {
      // A run that never reached the tier counts as later than every run that did.
      const ws = runs.map(x => x[tier] ?? Infinity)
      row[tier] = median(ws)
      row[tier + '%'] = runs.filter(x => x[tier] != null).length / RUNS
    }
    return row
  })
  // The table, for the report: written to $SIM_OUT when set.
  const text = ('median weeks to tier (share of runs reaching it in 4 years)\n' + table.map(r => r.key.padEnd(22) + TIERS.map(t => `${t} ${r[t] === Infinity ? '  -' : String(r[t]).padStart(3)} (${Math.round(r[t + '%'] * 100)}%)`).join('  ')).join('\n'))
  if (typeof process !== 'undefined' && process.env.SIM_OUT) import('node:fs').then(fs => fs.writeFileSync(process.env.SIM_OUT, text + '\n'))

  it('needs a comparable amount of training per tier across archetypes (factor <= 2.5)', () => {
    for (const tier of TIERS) {
      const ms = table.map(r => r[tier]).filter(Number.isFinite)
      expect(ms.length, tier).toBe(table.length)
      expect(Math.max(...ms) / Math.min(...ms), tier).toBeLessThanOrEqual(2.5)
    }
  })
  it('makes every tier harder than the one below, for every archetype', () => {
    for (const r of table) for (let i = 1; i < TIERS.length; i++) expect(r[TIERS[i]], r.key + ' ' + TIERS[i]).toBeGreaterThan(r[TIERS[i - 1]])
  })
  it('never gives bronze in under 3 weeks or Olympian in under 78 weeks', () => {
    for (const r of table) { expect(r.bronze, r.key).toBeGreaterThanOrEqual(3); expect(r.olympian, r.key).toBeGreaterThanOrEqual(78) }
  })
  it('lets every archetype reach gold within four years in most runs', () => {
    for (const r of table) expect(r['gold%'], r.key).toBeGreaterThanOrEqual(0.7)
  })
})
