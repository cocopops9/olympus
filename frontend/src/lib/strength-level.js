// Olympus: how strong you are at the main barbell lifts, for your sex, age and body weight, as
// one of four levels: Beginner, Intermediate, Advanced, Elite.
//
// The model. Among people who train, the ratio r = (estimated one-rep max) / (body weight) of a
// lift is taken as log-normal: ln r ~ N(mu, sigma), with mu depending on sex, age and body weight.
//   - Two anchors per lift and sex fix mu and sigma at a reference body weight (80 kg for men,
//     62 kg for women) and at the age of peak strength (23 to 35): the ratio of a lifter at the
//     30th percentile and the one of a lifter at the 97.5th. They are rounded figures in line
//     with the strength standards in common use (bench press for men: 1.0 and 2.0 x body weight);
//     they are not a peer-reviewed norm, and the levels are an estimate to motivate, nothing more.
//   - Body weight: strength grows with about body weight^(2/3) (allometric scaling of muscle
//     cross-section; e.g. Jaric 2002, Vanderburgh and Batterham 1999), so the ratio expected of a
//     heavier lifter falls as (W / W_ref)^(-1/3).
//   - Age: the expected one-rep max is multiplied by a factor, 1 between 23 and 35, lower for
//     teenagers and falling from 35 on (about 12% at 50, 23% at 60), close to the age
//     coefficients used in masters powerlifting.
// The levels are cut at the 30th, 80th and 97.5th percentiles: Beginner below 30%, Intermediate
// to 80%, Advanced to 97.5%, Elite above. The one-rep max is the best estimate from the sets
// of the last 12 months (lib/onerm.js), so a level reflects current strength, not a long-gone peak.
//
// Nothing is worked out without all three of sex, birth date and a logged body weight.
import { EXDB } from './exercises.js'
import { e1rmSeries } from './onerm.js'
import { lastBW } from './history.js'

export const LEVELS = ['beginner', 'intermediate', 'advanced', 'elite']
// Standard normal quantiles of the cut points.
export const CUTS = { intermediate: -0.5244, advanced: 0.8416, elite: 1.96 }
const CUT_P = { intermediate: 0.30, advanced: 0.80, elite: 0.975 }
export const REF_BW = { male: 80, female: 62 }
const YEAR_MS = 365.25 * 86400000
const LB = 0.45359237

// [ratio at the 30th percentile, ratio at the 97.5th], at the reference weight and peak age.
export const LIFTS = [
  { key: 'squat', name: 'barbell full squat', male: [1.25, 2.5], female: [0.9, 1.9] },
  { key: 'bench', name: 'barbell bench press', male: [1.0, 2.0], female: [0.6, 1.25] },
  { key: 'deadlift', name: 'barbell deadlift', male: [1.5, 3.0], female: [1.1, 2.3] },
  { key: 'ohp', name: 'barbell standing military press', male: [0.65, 1.3], female: [0.4, 0.85] },
  { key: 'row', name: 'barbell bent over row', male: [0.75, 1.5], female: [0.5, 1.1] },
].map(l => ({ ...l, id: EXDB.find(e => e.n === l.name)?.id || null })).filter(l => l.id)

export const liftOf = exId => LIFTS.find(l => l.id === exId) || null

// Age factor on the expected one-rep max: [age, factor], straight lines in between.
const AGE = [[14, 0.78], [16, 0.86], [18, 0.93], [20, 0.97], [23, 1], [35, 1], [40, 0.97], [45, 0.93], [50, 0.88],
  [55, 0.83], [60, 0.77], [65, 0.71], [70, 0.65], [75, 0.58], [80, 0.52]]
export function ageFactor(age) {
  if (!(age > 0)) return 1
  if (age <= AGE[0][0]) return AGE[0][1]
  for (let i = 1; i < AGE.length; i++) {
    const [a1, f1] = AGE[i], [a0, f0] = AGE[i - 1]
    if (age <= a1) return f0 + (f1 - f0) * (age - a0) / (a1 - a0)
  }
  return AGE[AGE.length - 1][1]
}

/** The standard normal CDF (Abramowitz and Stegun 7.1.26, error below 1.5e-7). */
export function phi(z) {
  const x = Math.abs(z) / Math.SQRT2
  const t = 1 / (1 + 0.3275911 * x)
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x)
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2
}

/** mu and sigma of ln(ratio) for `lift`, a sex, an age in years and a body weight in kg. */
export function distribution(lift, sex, age, bwKg) {
  const [lo, hi] = lift[sex === 'female' ? 'female' : 'male']
  const sigma = (Math.log(hi) - Math.log(lo)) / (CUTS.elite - CUTS.intermediate)
  const mu0 = Math.log(lo) - CUTS.intermediate * sigma
  const ref = REF_BW[sex === 'female' ? 'female' : 'male']
  const mu = mu0 + Math.log(ageFactor(age)) - Math.log(bwKg / ref) / 3
  return { mu, sigma }
}

/**
 * The level of a one-rep max `oneRm` at `lift` for a body weight `bw` (both in the same unit,
 * `unit` 'kg' or 'lb'), a sex and an age: { level, index, z, percentile, next: { level, weight } }.
 * `next.weight` is the one-rep max the next level starts at, in `unit`; null at Elite.
 */
export function levelOf(lift, oneRm, bw, sex, age, unit = 'kg') {
  if (!(oneRm > 0) || !(bw > 0) || !(age > 0)) return null
  const bwKg = unit === 'lb' ? bw * LB : bw
  const { mu, sigma } = distribution(lift, sex, age, bwKg)
  const z = (Math.log(oneRm / bw) - mu) / sigma
  const index = z >= CUTS.elite ? 3 : z >= CUTS.advanced ? 2 : z >= CUTS.intermediate ? 1 : 0
  const nextLevel = LEVELS[index + 1] || null
  const at = lvl => bw * Math.exp(mu + CUTS[lvl] * sigma)
  const from = index > 0 ? at(LEVELS[index]) : 0
  const to = nextLevel ? at(nextLevel) : null
  return {
    level: LEVELS[index], index, z, percentile: phi(z),
    next: nextLevel ? { level: nextLevel, weight: to } : null,
    // How far from this level's start to the next one, 0 to 1, for the bar.
    progress: to ? Math.max(0, Math.min(1, (oneRm - from) / (to - from))) : 1,
    cutPercent: nextLevel ? CUT_P[nextLevel] : null,
  }
}

/** Whole years between ISO date `birth` and `today`. */
export function ageOn(birth, today = new Date()) {
  const b = new Date(String(birth || '') + 'T12:00:00')
  if (isNaN(b)) return null
  const d = today instanceof Date ? today : new Date(today + 'T12:00:00')
  let age = d.getFullYear() - b.getFullYear()
  if (d.getMonth() < b.getMonth() || (d.getMonth() === b.getMonth() && d.getDate() < b.getDate())) age--
  return age >= 10 && age <= 100 ? age : null
}

/** What the levels need and do not have yet: a subset of ['birth', 'weight']. */
export function missingFor(S, today = new Date()) {
  const out = []
  if (!ageOn(S?.birth, today)) out.push('birth')
  if (!(lastBW(S)?.w > 0)) out.push('weight')
  return out
}

/** The best estimated one-rep max of `exId` in the 12 months before `now`, or 0. */
export function recentBest(S, exId, now = Date.now()) {
  let best = 0
  for (const p of e1rmSeries(S, exId)) if (p.t >= now - YEAR_MS && p.y > best) best = p.y
  return best
}

/**
 * The level of every main lift trained in the last 12 months: [{ lift, oneRm, ...levelOf }],
 * or [] when sex, birth date or body weight is missing.
 */
export function strengthLevels(S, now = Date.now()) {
  if (missingFor(S, new Date(now)).length) return []
  const age = ageOn(S.birth, new Date(now))
  const bw = lastBW(S).w
  const sex = S.body === 'female' ? 'female' : 'male'
  const out = []
  for (const lift of LIFTS) {
    const oneRm = recentBest(S, lift.id, now)
    const lv = oneRm > 0 ? levelOf(lift, oneRm, bw, sex, age, S.unit || 'kg') : null
    if (lv) out.push({ lift, oneRm, ...lv })
  }
  return out
}

/** The lifts whose level went up between documents `before` and `after`: [{ lift, from, to }]. */
export function levelUps(before, after, now = Date.now()) {
  const was = new Map(strengthLevels(before, now).map(x => [x.lift.key, x.index]))
  return strengthLevels(after, now)
    .filter(x => x.index > (was.has(x.lift.key) ? was.get(x.lift.key) : -1) && (was.has(x.lift.key) || x.index > 0))
    .map(x => ({ lift: x.lift, from: was.has(x.lift.key) ? LEVELS[was.get(x.lift.key)] : null, to: x.level }))
}
