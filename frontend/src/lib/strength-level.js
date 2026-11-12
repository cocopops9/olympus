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
import { isWarmupRow } from './workout-model.js'
import { isIntervals } from './intervals.js'

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

// More exercises, measured five ways: `load` (estimated one-rep max against body weight, as the
// five above), `reps` (the most reps in one set with no added weight: push-ups, pull-ups, dips,
// burpees), `speed` (the fastest steady pace in km/h over a set of at least `minMin` minutes:
// rowing), `aerobic` (the VO2max a run points to, in ml/kg/min, read by the kind of session) and
// `sprint` (the top speed of short all-out efforts). The anchors are rounded from common strength
// and fitness norms in the same way as the main lifts: estimates to show progress, not
// measurements. For running they are VDOT figures (Daniels): 35 is a 5 km in about 27 minutes,
// 60 one in about 17. Rep counts, speeds and VO2max are not scaled for body weight (VO2max is
// already per kilogram); the age factor applies to rep counts and speeds at `ageWeight` of its
// effect on strength, and VO2max has its own (aerobicAgeFactor).
export const MORE = [
  { key: 'front-squat', name: 'barbell front squat', male: [1.0, 2.1], female: [0.75, 1.6] },
  { key: 'incline', name: 'barbell incline bench press', male: [0.85, 1.7], female: [0.5, 1.05] },
  { key: 'sumo', name: 'barbell sumo deadlift', male: [1.5, 3.0], female: [1.1, 2.3] },
  { key: 'rdl', name: 'barbell romanian deadlift', male: [1.0, 2.2], female: [0.75, 1.7] },
  { key: 'hip-thrust', name: 'barbell hip thrust', male: [1.25, 3.0], female: [1.0, 2.6] },
  { key: 'leg-press', name: 'sled 45° leg press', male: [2.0, 4.5], female: [1.5, 3.6] },
  { key: 'pulldown', name: 'cable lat pulldown full range of motion', male: [0.7, 1.35], female: [0.45, 0.9] },
  { key: 'pulldown2', name: 'cable pulldown', male: [0.7, 1.35], female: [0.45, 0.9] },
  { key: 'curl', name: 'barbell curl', male: [0.4, 0.85], female: [0.22, 0.5] },
  { key: 'push-up', name: 'push-up', type: 'reps', male: [12, 50], female: [4, 30], ageWeight: 0.8 },
  { key: 'pull-up', name: 'pull-up', type: 'reps', male: [3, 20], female: [1, 10], ageWeight: 0.8 },
  { key: 'chin-up', name: 'chin-up', type: 'reps', male: [4, 22], female: [1, 12], ageWeight: 0.8 },
  { key: 'dip', name: 'chest dip', type: 'reps', male: [6, 30], female: [2, 15], ageWeight: 0.8 },
  { key: 'burpee', name: 'burpee', type: 'reps', male: [12, 45], female: [8, 35], ageWeight: 0.7 },
  // Running is read by the kind of session (readCardio below): `aerobic` is the estimated VO2max
  // (ml/kg/min) of steady runs and intervals, `sprint` the top speed of short all-out efforts.
  { key: 'run', name: 'run', type: 'aerobic', male: [35, 60], female: [30, 52] },
  { key: 'treadmill', name: 'run on treadmill', type: 'aerobic', male: [35, 60], female: [30, 52] },
  { key: 'run-sprint', name: 'run', type: 'sprint', male: [17, 27], female: [14, 23], ageWeight: 0.8 },
  { key: 'treadmill-sprint', name: 'run on treadmill', type: 'sprint', male: [17, 27], female: [14, 23], ageWeight: 0.8 },
  { key: 'rowing', name: 'rowing (with rowing machine)', type: 'speed', minMin: 5, male: [11, 15.5], female: [9.5, 13.5], ageWeight: 0.6 },
].map(l => ({ ...l, id: EXDB.find(e => e.n === l.name)?.id || null })).filter(l => l.id)

/** Every exercise with a level: the five main lifts first, then the others. */
export const METRICS = [...LIFTS, ...MORE]

export const liftOf = exId => METRICS.find(l => l.id === exId) || null

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

// Aerobic capacity falls with age on its own curve, not on the strength one: flat to 25, then
// about 8% of the young value per decade (in people who keep training the loss is about
// 5 to 10% per decade; Hawkins and Wiswell 2003), never below 40%.
export function aerobicAgeFactor(age) {
  if (!(age > 25)) return 1
  return Math.max(0.4, 1 - 0.008 * (age - 25))
}

/** The age factor of a rep count, a speed or a VO2max: what the young reference is multiplied by. */
export function valueAgeFactor(metric, age) {
  if (metric.type === 'aerobic') return aerobicAgeFactor(age)
  return 1 - (1 - ageFactor(age)) * (metric.ageWeight ?? 1)
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

/**
 * The level of a rep count or a speed (`metric.type` 'reps' or 'speed'): the value itself is
 * log-normal, centred for sex and age. { level, index, z, percentile, next: { level, value } }.
 */
export function levelOfValue(metric, value, sex, age) {
  if (!(value > 0) || !(age > 0)) return null
  const [lo, hi] = metric[sex === 'female' ? 'female' : 'male']
  const sigma = (Math.log(hi) - Math.log(lo)) / (CUTS.elite - CUTS.intermediate)
  const mu = Math.log(lo) - CUTS.intermediate * sigma + Math.log(valueAgeFactor(metric, age))
  const z = (Math.log(value) - mu) / sigma
  const index = z >= CUTS.elite ? 3 : z >= CUTS.advanced ? 2 : z >= CUTS.intermediate ? 1 : 0
  const nextLevel = LEVELS[index + 1] || null
  const at = lvl => Math.exp(mu + CUTS[lvl] * sigma)
  const from = index > 0 ? at(LEVELS[index]) : 0
  const to = nextLevel ? at(nextLevel) : null
  return {
    level: LEVELS[index], index, z, percentile: phi(z),
    next: nextLevel ? { level: nextLevel, value: to, weight: to } : null,
    progress: to ? Math.max(0, Math.min(1, (value - from) / (to - from))) : 1,
    cutPercent: nextLevel ? CUT_P[nextLevel] : null,
  }
}

/** The value a level starts at, for `metric` and this person: a weight (load) or a value. */
export function levelStart(metric, level, { sex, age, bw, unit = 'kg' }) {
  if (!(age > 0)) return null
  const sx = sex === 'female' ? 'female' : 'male'
  if ((metric.type || 'load') !== 'load') {
    const [lo, hi] = metric[sx]
    const sigma = (Math.log(hi) - Math.log(lo)) / (CUTS.elite - CUTS.intermediate)
    const mu = Math.log(lo) - CUTS.intermediate * sigma + Math.log(valueAgeFactor(metric, age))
    return Math.exp(mu + CUTS[level] * sigma)
  }
  if (!(bw > 0)) return null
  const bwKg = unit === 'lb' ? bw * LB : bw
  const { mu, sigma } = distribution(metric, sx, age, bwKg)
  return bw * Math.exp(mu + CUTS[level] * sigma)
}


/*
 * Running, read by the kind of session. The oxygen cost of running at v metres a minute and the
 * share of VO2max a runner can hold for t minutes are the equations of Daniels and Gilbert
 * (Oxygen Power, 1979), the ones behind the VDOT tables:
 *   VO2(v) = -4.60 + 0.182258 v + 0.000104 v^2                     (ml/kg/min)
 *   f(t)   = 0.8 + 0.1894393 e^(-0.012778 t) + 0.2989558 e^(-0.1932605 t)
 * and VO2max is estimated as VO2(v) / f(t). A treadmill incline adds the vertical cost of the
 * ACSM running equation, 0.9 v x grade. What a session says depends on what it was:
 *   - endurance: a stretch of at least STEADY_MIN minutes at one speed, read with its own length,
 *     so 40 minutes at 12 km/h counts for more than 10 minutes at 12 km/h;
 *   - intervals (HIIT): hard segments shorter than that, with easy running or a rest between
 *     them. Repeated segments of a few minutes are run close to the speed at VO2max (Billat 2001),
 *     so their speed is read with f(t) of one segment, held between 1 and 1.1: a 30 s segment can
 *     be a little faster than the speed at VO2max, never as much faster as one all-out effort;
 *   - sprints: segments of SPRINT_MAX_MIN or less with a long recovery (at least three times the
 *     work) are anaerobic, so they give no VO2max: what they measure is the top speed reached.
 * Every figure is the best the logged sessions show, so an easy run reads lower than what the
 * runner could do: the estimate rises as harder sessions are logged.
 */
export const STEADY_MIN = 5
export const SPRINT_MAX_MIN = 0.5
export const HIIT_MIN_WORK = 4
const HARD_SHARE = 0.9

/** The oxygen cost of running at `kmh` on a `incline` percent slope, in ml/kg/min. */
export function runVO2(kmh, incline = 0) {
  const v = (Number(kmh) || 0) * 1000 / 60
  return -4.6 + 0.182258 * v + 0.000104 * v * v + 0.9 * v * Math.max(0, Number(incline) || 0) / 100
}

/** The share of VO2max that can be held for `min` minutes. */
export function vo2Fraction(min) {
  return 0.8 + 0.1894393 * Math.exp(-0.012778 * min) + 0.2989558 * Math.exp(-0.1932605 * min)
}

/** The VO2max a steady run of `min` minutes at `kmh` (and `incline` percent) points to. */
export const vo2maxOfRun = (kmh, min, incline = 0) => runVO2(kmh, incline) / vo2Fraction(min)

/** The flat speed in km/h that a VO2max of `vo2` can hold for `min` minutes. */
export function speedForVo2max(vo2, min = 30) {
  const need = vo2 * vo2Fraction(min)
  const a = 0.000104, b = 0.182258, c = -4.6 - need
  const v = (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a)
  return v > 0 ? v * 60 / 1000 : 0
}

/**
 * What one logged running exercise says: { vo2, top, basis } or null with no running in it.
 * `vo2` is the estimated VO2max (0 when the session says nothing about it), `top` the top
 * speed of a sprint session (0 otherwise), `basis` how the best figure was read:
 * { kind: 'endurance' | 'hiit' | 'sprint', min, speed }.
 */
export function readCardio(entry) {
  const rows = (entry?.sets || []).filter(st => st?.done && !isWarmupRow(st) && Number(st.min) > 0 && Number(st.speed) > 0)
  if (!rows.length) return null
  const out = { vo2: 0, top: 0, basis: null }
  const vmax = Math.max(...rows.map(r => Number(r.speed)))

  // Endurance: every stretch long enough to be read as a steady run.
  for (const r of rows) {
    if (Number(r.min) < STEADY_MIN) continue
    const v = vo2maxOfRun(Number(r.speed), Math.min(240, Number(r.min)), r.incline)
    if (v > out.vo2) { out.vo2 = v; out.basis = { kind: 'endurance', min: Number(r.min), speed: Number(r.speed) } }
  }

  // The hard segments: near the fastest speed of the exercise and too short for a steady read.
  const hard = rows.filter(r => Number(r.speed) >= HARD_SHARE * vmax && Number(r.min) < STEADY_MIN)
  if (!hard.length) return out
  const hardMin = hard.reduce((sum, r) => sum + Number(r.min), 0)
  const easyMin = rows.filter(r => Number(r.speed) < HARD_SHARE * vmax).reduce((sum, r) => sum + Number(r.min), 0)
  // The planned rest after each segment, when the exercise is a written interval plan.
  const plan = isIntervals(entry?.target) ? entry.target.intervals : null
  const restMin = plan ? rows.reduce((sum, r, k) => sum + (hard.includes(r) ? (Number(plan[Math.min(k, plan.length - 1)]?.rest) || 0) / 60 : 0), 0) : 0
  const recoveryKnown = easyMin > 0 || restMin > 0
  const ratio = recoveryKnown ? (easyMin + restMin) / hardMin : null
  const work = hardMin / hard.length

  if (work <= SPRINT_MAX_MIN && (ratio == null || ratio >= 3)) {
    out.top = Math.max(...hard.map(r => Number(r.speed)))
    if (!out.basis) out.basis = { kind: 'sprint', min: work, speed: out.top }
    return out
  }
  if (hard.length >= 2 && hardMin >= HIIT_MIN_WORK) {
    for (const r of hard) {
      const f = Math.min(1.1, Math.max(1, vo2Fraction(Number(r.min))))
      const v = runVO2(Number(r.speed), r.incline) / f
      if (v > out.vo2) { out.vo2 = v; out.basis = { kind: 'hiit', min: Number(r.min), speed: Number(r.speed) } }
    }
  }
  return out
}

/** What one logged exercise is worth for `metric`, with how it was read: { value, basis }. */
export function entryValue(metric, entry) {
  if (metric.type === 'aerobic' || metric.type === 'sprint') {
    const r = readCardio(entry)
    if (!r) return { value: 0, basis: null }
    if (metric.type === 'aerobic') return { value: r.vo2, basis: r.vo2 > 0 ? r.basis : null }
    return { value: r.top, basis: r.top > 0 ? { kind: 'sprint', speed: r.top } : null }
  }
  let best = 0
  for (const st of entry?.sets || []) {
    if (!st?.done || isWarmupRow(st)) continue
    if (metric.type === 'reps') { if (!(Number(st.w) > 0) && Number(st.r) > best) best = Number(st.r) }
    else if (metric.type === 'speed') { if (Number(st.min) >= (metric.minMin || 1) && Number(st.speed) > best) best = Number(st.speed) }
  }
  return { value: best, basis: null }
}

/**
 * The best of `metric` in the workouts after `since` (ms), with how it was read: { value, basis }.
 * Reps: the most in one set with no added weight. Speed: the fastest in a set of at least
 * metric.minMin minutes. Aerobic and sprint: readCardio of each session.
 */
export function bestReading(S, metric, since = 0) {
  let best = { value: 0, basis: null }
  for (const w of S?.workouts || []) {
    if (!(w?.start >= since || (w?.end || 0) >= since)) continue
    for (const e of w.entries || []) {
      if (e.id !== metric.id) continue
      const r = entryValue(metric, e)
      if (r.value > best.value) best = r
    }
  }
  return best
}

/** The best of `metric` in the workouts after `since` (ms): bestReading's value. */
export const bestValue = (S, metric, since = 0) => bestReading(S, metric, since).value

/**
 * The running best of `metric` (reps, speed, VO2max) after each workout that has it, in date
 * order: [{ d, y, first }], `first` the value of the first of those workouts. For the date a
 * value was first reached (lib/medals.js).
 */
export function valuePoints(S, metric) {
  const ws = [...(S?.workouts || [])].filter(w => w && w.d).sort((a, b) => (a.start || 0) - (b.start || 0))
  const pts = []
  let best = 0, first = 0
  for (const w of ws) {
    let top = 0
    for (const e of w.entries || []) if (e.id === metric.id) top = Math.max(top, entryValue(metric, e).value)
    if (top > 0) { if (!first) first = top; best = Math.max(best, top); pts.push({ d: w.d, y: best, first }) }
  }
  return pts
}

/** How many workouts of the last 90 days have `exId` in them. */
export function timesDone(S, exId, now = Date.now()) {
  let n = 0
  for (const w of S?.workouts || []) if ((w?.start || 0) >= now - 90 * 86400000 && (w.entries || []).some(e => e.id === exId)) n++
  return n
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
  for (const lift of METRICS) {
    const type = lift.type || 'load'
    if (type === 'load') {
      const oneRm = recentBest(S, lift.id, now)
      const lv = oneRm > 0 ? levelOf(lift, oneRm, bw, sex, age, S.unit || 'kg') : null
      if (lv) out.push({ lift, type, oneRm, value: oneRm, ...lv })
    } else {
      const { value, basis } = bestReading(S, lift, now - YEAR_MS)
      const lv = value > 0 ? levelOfValue(lift, value, sex, age) : null
      if (lv) out.push({ lift, type, value, basis, ...lv })
    }
  }
  // The exercises this person does most come first; the main lifts before the others on a tie.
  const order = new Map(METRICS.map((l, i) => [l.key, i]))
  const times = new Map(out.map(x => [x.lift.key, timesDone(S, x.lift.id, now)]))
  return out.sort((a, b) => (times.get(b.lift.key) - times.get(a.lift.key)) || (order.get(a.lift.key) - order.get(b.lift.key)))
}

/** The lifts whose level went up between documents `before` and `after`: [{ lift, from, to }]. */
export function levelUps(before, after, now = Date.now()) {
  const was = new Map(strengthLevels(before, now).map(x => [x.lift.key, x.index]))
  return strengthLevels(after, now)
    .filter(x => x.index > (was.has(x.lift.key) ? was.get(x.lift.key) : -1) && (was.has(x.lift.key) || x.index > 0))
    .map(x => ({ lift: x.lift, from: was.has(x.lift.key) ? LEVELS[was.get(x.lift.key)] : null, to: x.level }))
}
