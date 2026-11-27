// Olympus: the athlete's potential profile, and the performance medals cut to it.
//
// The aim. Every athlete, whatever their level, should need some work for a bronze medal, more for
// silver, and so on up to Olympian, which takes years of perseverance. Fixed thresholds cannot do
// that: 140 kg on the bench is a first month for a 105 kg professional and out of reach for life
// for a 50 kg woman of 58. So the medals here are measured against what this athlete can expect
// to gain, not against everyone else.
//
// The scale. Each exercise with a strength or fitness level (lib/strength-level.js) gives a
// standardised score z: how far a lift is above the lifters of the same sex, age and body weight,
// in standard deviations of ln(lift / body weight). Two consequences matter here:
//   - z is age-adjusted at the date of the set: keeping the same weight on the bar from 58 to 63
//     raises z, because the expected lift falls with age. An older athlete who holds their
//     strength for years therefore still climbs the tiers, which is what we want to reward;
//   - z is body-weight adjusted, with fat-free mass when a body-fat reading exists (strength
//     scales with muscle, not with fat), so a cut or a bulk moves the targets in kilograms the
//     right way.
//
// The model (assumptions, labelled; none of these numbers is a measured norm):
//   1. The expected z of a dedicated trainee of average response after tau years of consistent
//      training is a hyperbola, C(tau) = Z_UNTRAINED + GAIN * tau / (tau + HALF_YEARS). With
//      Z_UNTRAINED = -1, GAIN = 3 and HALF_YEARS = 0.75: about +12 % on a novice bench press in
//      6 weeks and +28 % in 16 weeks (in line with the 20 to 40 % gains of 8 to 16 week programmes
//      in untrained adults; e.g. ACSM position stand 2009, Kraemer and Ratamess 2004), half of all
//      gains in the first nine months, and a ceiling of z = 2, the edge of Elite (97.5th
//      percentile), for an average responder.
//   2. Where the athlete sits on that curve: from what they told their coaches (years of
//      training, read by the coaches' memory, api/hercules.js handleMemory) when known; otherwise
//      the training age an average responder would need to be at their first readings. A
//      returning athlete (muscle memory) is placed by their readings and given a faster response.
//   3. What is left to gain over a horizon t is C(tau + t) - C(tau), scaled per kind of measure
//      (RESPONSE: VO2max and sprint speed respond far less to training than strength; rep counts
//      more), and never less than FLOOR * sqrt(t) in ln units, the slow gains of athletes already
//      near their ceiling (about 2 to 4 % a year in the first competitive years of elite
//      powerlifters, Latella et al. 2020). A day-to-day spread of 2 to 3 % in estimated one-rep
//      maxes is why the floor is not smaller.
//   4. The tiers are the gains expected after HORIZONS of consistent training: bronze 6 weeks,
//      silver 16, gold 40, diamond 80, Olympian 156 (three years). So the effort, measured as
//      time of consistent training, is the same for everybody; the kilograms are not.
//   5. Perseverance: a tier also takes a minimum number of trained weeks (weeks with at least one
//      session of that exercise), MIN_WEEKS, about two thirds of its horizon, so a fast responder
//      or a lucky run of sessions does not skip the effort the tier stands for.
//   6. Response differs between people (in training studies the spread of individual gains is
//      wide; e.g. Ahtiainen et al. 2016). After the first readings, the gains of the next
//      LEARN_WEEKS trained weeks are compared with the curve, and the ratio rho, shrunk towards 1
//      (a prior worth PRIOR_WEEKS weeks), scales the targets still to come. It is frozen after
//      LEARN_WEEKS, so progress never keeps pushing its own targets away.
//
// The server's model. When signed in, 3 above comes from data instead of the curve: the gains of
// z after each horizon that the median lifter of the same sex, age, body weight and starting z
// made in the OpenPowerlifting meet histories (api/medal-model.js, trained by
// scripts/medal-model/train.py, fetched by lib/medal-targets.js). On 20 % of lifters held out it
// predicts their gains with a mean absolute error of 0.238 z, against 0.283 for the curve. The
// floor, the response rho, the perseverance weeks and the confirmed reading stay as above; the
// curve stands in without a server, for rep counts and cardio, and before the first answer.
//
// Enough data. Nothing is shown without sex, birth date and a body weight. An exercise gets its
// tiers once it has CALIB_SESSIONS sessions spread over at least CALIB_DAYS days: the best of
// that window is the athlete's starting point (first sessions are lighter than the athlete can
// lift: technique, nerves, learning the app, so one session is not enough).
//
// Medals already celebrated stay earned (lib/medals.js reads S.medals.got): the profile changes
// with age, body weight and what the coaches learn, so a target can move, never a medal won.
import { e1rmSeries } from './onerm.js'
import { METRICS, distribution, valueAgeFactor, entryValue, CUTS, ageOn } from './strength-level.js'

export const TIERS = ['bronze', 'silver', 'gold', 'diamond', 'olympian']
export const HORIZON_WEEKS = { bronze: 6, silver: 16, gold: 40, diamond: 80, olympian: 156 }
export const MIN_WEEKS = { bronze: 4, silver: 10, gold: 26, diamond: 52, olympian: 104 }

export const Z_UNTRAINED = -1
export const GAIN = 3
export const HALF_YEARS = 0.75
export const Z_CEILING = Z_UNTRAINED + GAIN
// How much of the strength curve each kind of measure moves (assumption, see 3 above).
export const RESPONSE = { load: 1, reps: 1.2, speed: 0.6, aerobic: 0.5, sprint: 0.3 }
// The slowest gains, in ln units times sqrt(years), for athletes at their ceiling.
export const FLOOR = { load: 0.045, reps: 0.06, speed: 0.03, aerobic: 0.03, sprint: 0.02 }
// The horizons of the server's model (api/medal-model.js MODEL_WEEKS), the same as HORIZON_WEEKS.
export const MODEL_WEEKS = [6, 16, 40, 80, 156]
export const CALIB_SESSIONS = 3
export const CALIB_DAYS = 14
export const LEARN_WEEKS = 12
export const PRIOR_WEEKS = 8
export const RHO_RANGE = [0.6, 1.6]
// A reading counts once confirmed: the second best of the readings of CONFIRM_DAYS days, so one
// lucky estimate (the spread of estimated maxes is 2 to 3 %) does not win a medal by itself.
export const CONFIRM_DAYS = 28
// Fat share of the reference lifters of the strength norms (assumption: typical of people who
// train), for scaling by fat-free mass.
const REF_FAT = { male: 0.15, female: 0.25 }
const DAY = 86400000
const YEAR = 365.25 * DAY
const LB = 0.45359237

/** C(tau): the expected z after `tau` years of consistent training, average response. */
export const curve = tau => Z_UNTRAINED + GAIN * Math.max(0, tau) / (Math.max(0, tau) + HALF_YEARS)

/** The training age (years) at which C reaches `z`; Infinity at or above the ceiling. */
export function trainingAgeOf(z) {
  if (z <= Z_UNTRAINED) return 0
  if (z >= Z_CEILING - 1e-9) return Infinity
  const u = (z - Z_UNTRAINED) / GAIN
  return HALF_YEARS * u / (1 - u)
}

/** How much of the curve's gains an athlete of `age` can expect: 1 to 50, then 1 % less a year, at least 0.7. */
export const ageResponse = age => (age > 50 ? Math.max(0.7, 1 - 0.01 * (age - 50)) : 1)

/** The z gain expected from training age `tau0` over `years`, for a measure of type `type` with spread `sigma`. */
export function expectedGain(tau0, years, type = 'load', sigma = 0.28, age = 30) {
  const k = (RESPONSE[type] ?? 1) * ageResponse(age)
  const onCurve = Number.isFinite(tau0) ? k * (curve(tau0 + years) - curve(tau0)) : 0
  const floor = (FLOOR[type] ?? FLOOR.load) * Math.sqrt(Math.max(0, years)) / sigma
  return Math.max(onCurve, floor)
}

/** Body weight on date `iso` (the last weigh-in on or before it, else the first one), in the profile's unit. */
export function bwOn(S, iso) {
  const list = (S?.bodyweight || []).filter(b => b && b.d && Number(b.w) > 0).sort((a, b) => (a.d < b.d ? -1 : 1))
  if (!list.length) return 0
  let pick = list[0]
  for (const b of list) if (b.d <= iso) pick = b
  return Number(pick.w)
}

/** The latest body-fat reading (percent, 4 to 60), or null. */
export function bodyFatOf(S) {
  const list = Array.isArray(S?.measurements) ? S.measurements : []
  for (let i = list.length - 1; i >= 0; i--) {
    const v = Number(list[i]?.bodyFat)
    if (v >= 4 && v <= 60) return v
  }
  return null
}

/**
 * The body weight the strength norms should read: the fat-free mass scaled to the reference fat
 * share, so 105 kg at 10 % counts as 111 kg of a typical lifter and 105 kg at 35 % as 85 kg.
 */
export function effectiveBw(bw, sex, fatPct) {
  if (!(bw > 0) || fatPct == null) return bw
  const ref = REF_FAT[sex === 'female' ? 'female' : 'male']
  return bw * (1 - fatPct / 100) / (1 - ref)
}

/** mu and sigma of ln(value) (or of ln(lift / bw) for loads) for a metric and a person. */
function normOf(metric, sex, age, bwKg) {
  if ((metric.type || 'load') === 'load') return distribution(metric, sex, age, bwKg)
  const [lo, hi] = metric[sex === 'female' ? 'female' : 'male']
  const sigma = (Math.log(hi) - Math.log(lo)) / (CUTS.elite - CUTS.intermediate)
  return { mu: Math.log(lo) - CUTS.intermediate * sigma + Math.log(valueAgeFactor(metric, age)), sigma }
}

/** The z of `value` at `metric` for a person { sex, age, bw (profile unit), unit, fat }. */
export function zOf(metric, value, who) {
  if (!(value > 0) || !(who.age > 0)) return null
  if ((metric.type || 'load') !== 'load') {
    const { mu, sigma } = normOf(metric, who.sex, who.age)
    return (Math.log(value) - mu) / sigma
  }
  if (!(who.bw > 0)) return null
  const bw = effectiveBw(who.bw, who.sex, who.fat)
  const bwKg = who.unit === 'lb' ? bw * LB : bw
  const { mu, sigma } = normOf(metric, who.sex, who.age, bwKg)
  return (Math.log(value / bw) - mu) / sigma
}

/** The value (load in the profile's unit, reps, km/h, VO2max) at which `metric` reaches `z` for `who`. */
export function valueAt(metric, z, who) {
  if (!(who.age > 0)) return null
  if ((metric.type || 'load') !== 'load') {
    const { mu, sigma } = normOf(metric, who.sex, who.age)
    return Math.exp(mu + z * sigma)
  }
  if (!(who.bw > 0)) return null
  const bw = effectiveBw(who.bw, who.sex, who.fat)
  const bwKg = who.unit === 'lb' ? bw * LB : bw
  const { mu, sigma } = normOf(metric, who.sex, who.age, bwKg)
  return bw * Math.exp(mu + z * sigma)
}

/** sigma of `metric` for `sex`: the width of one z, in ln units. */
export function sigmaOf(metric, sex) {
  const [lo, hi] = metric[sex === 'female' ? 'female' : 'male']
  return (Math.log(hi) - Math.log(lo)) / (CUTS.elite - CUTS.intermediate)
}

/**
 * Every reading of `metric`, in date order: [{ d, t, value, z }], z worked out with the age and
 * body weight of that day. Loads are estimated one-rep maxes (lib/onerm.js).
 */
export function readingsOf(S, metric, base) {
  const type = metric.type || 'load'
  let raw
  if (type === 'load') raw = e1rmSeries(S, metric.id).map(p => ({ d: p.d, t: p.t, value: p.y }))
  else {
    raw = []
    for (const w of S?.workouts || []) {
      if (!w?.d) continue
      let top = 0
      for (const e of w.entries || []) if (e.id === metric.id) top = Math.max(top, entryValue(metric, e).value)
      if (top > 0) raw.push({ d: w.d, t: Number(w.start) || Date.parse(w.d + 'T12:00:00'), value: top })
    }
  }
  return raw.filter(p => p.value > 0 && p.d).sort((a, b) => a.t - b.t).map(p => {
    const who = { ...base, age: ageOn(base.birth, new Date(p.d + 'T12:00:00')) || base.age, bw: bwOn(S, p.d) || base.bw }
    return { ...p, z: zOf(metric, p.value, who) }
  }).filter(p => p.z != null && Number.isFinite(p.z))
}

/** The Monday of the week of ISO date `iso`, as yyyy-mm-dd. */
function weekOf(iso) {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}
/** Distinct weeks of a list of readings. */
const weeksOf = points => new Set(points.map(p => weekOf(p.d))).size

/** The model's gain at `weeks`: linear between its horizons (MODEL_WEEKS), from 0 at week 0, flat past the last one. */
export function gainAtWeeks(gains, weeks) {
  if (!(weeks > 0)) return 0
  let w0 = 0, g0 = 0
  for (let i = 0; i < MODEL_WEEKS.length; i++) {
    const w1 = MODEL_WEEKS[i], g1 = gains[i]
    if (weeks <= w1) return g0 + (g1 - g0) * (weeks - w0) / (w1 - w0)
    w0 = w1; g0 = g1
  }
  return g0
}

/**
 * The gain of z over `weeks` from the server's model (gains of the median competitor of this sex,
 * age, body weight and starting z), for an athlete placed at training age `tau0` where their
 * readings alone place them at `inferred`.
 *   - The data carry no training age (the first meet is not the first day of training), so when
 *     the coaches know the athlete has trained longer than the readings imply, the model's gain
 *     is scaled by what that placement changes on the curve (assumption: the curve's shape,
 *     not its level, is right about it).
 *   - The floor of slow gains is kept, as with the curve, so a day-to-day spread of estimates is
 *     never a medal. Age is already in the model: no ageResponse here.
 */
export function modelGain(model, weeks, tau0, inferred, type = 'load', sigma = 0.28) {
  const years = weeks / 52
  const floor = (FLOOR[type] ?? FLOOR.load) * Math.sqrt(Math.max(0, years)) / sigma
  let g = gainAtWeeks(model, weeks)
  if (tau0 !== inferred && Number.isFinite(inferred)) {
    const onCurve = t => (Number.isFinite(t) ? curve(t + years) - curve(t) : 0)
    const base = onCurve(inferred)
    if (base > 0) g *= Math.min(1, onCurve(tau0) / base)
  }
  return Math.max(g, floor)
}

/**
 * The athlete facts the coaches' memory read from the chats ({ trainingYears, returning }),
 * cleaned; {} when nothing usable.
 */
export function cleanFacts(f) {
  const out = {}
  const y = Number(f?.trainingYears)
  if (Number.isFinite(y) && y >= 0 && y <= 60) out.trainingYears = y
  if (f?.returning === true) out.returning = true
  return out
}

/**
 * The potential profile of one exercise for this athlete, or { status } when it cannot be made:
 *   { status: 'missing' }           sex, birth date or body weight is missing (load measures)
 *   { status: 'none' }              never done
 *   { status: 'calibrating', done, need }   not enough readings yet
 *   { status: 'ready', z0, zBest, tau0, rho, learned, thresholds: { tier: z }, readings, ... }
 * `base` is { sex, birth, age, bw, unit, fat } as of now; `facts` what the coaches know; `model`
 * the server's median gains of z at HORIZON_WEEKS for this profile (api/medal-model.js, fetched by
 * lib/medal-targets.js), or null to use the curve of this file.
 */
export function profileOf(S, metric, base, facts = {}, model = null) {
  const type = metric.type || 'load'
  if (!(base.age > 0) || (type === 'load' && !(base.bw > 0))) return { status: 'missing' }
  const pts = readingsOf(S, metric, base)
  if (!pts.length) return { status: 'none' }
  // Calibration: the first CALIB_SESSIONS readings, and every reading of the first CALIB_DAYS days.
  const t0 = pts[0].t
  const calib = pts.filter((p, i) => i < CALIB_SESSIONS || p.t - t0 <= CALIB_DAYS * DAY)
  const span = (pts[pts.length - 1].t - t0) / DAY
  if (pts.length < CALIB_SESSIONS || span < CALIB_DAYS) {
    const doneDays = Math.min(1, span / CALIB_DAYS), doneN = Math.min(1, pts.length / CALIB_SESSIONS)
    return { status: 'calibrating', done: Math.min(doneDays, doneN), need: { sessions: Math.max(0, CALIB_SESSIONS - pts.length), days: Math.max(0, Math.ceil(CALIB_DAYS - span)) } }
  }
  const calibEnd = calib[calib.length - 1].t
  const z0 = Math.max(...calib.map(p => p.z))
  const sigma = sigmaOf(metric, base.sex)

  // Where they are on the curve.
  const facts2 = cleanFacts(facts)
  const inferred = trainingAgeOf(z0)
  const told = facts2.returning ? null : facts2.trainingYears
  // Told years are believed within reason: never more than 4 years from what the readings imply
  // for an average responder, so a misread note cannot flatten or inflate every target.
  const tau0 = told == null ? inferred
    : Number.isFinite(inferred) ? Math.max(0, Math.min(told, inferred + 4, 15), inferred - 4) : Math.max(told, 6)
  const prior = 1
  // The gain to expect over `years`: from the server's model when there is one, otherwise the curve.
  const gainOver = years => (model ? modelGain(model, years * 52, tau0, inferred, type, sigma) : expectedGain(tau0, years, type, sigma, base.age))

  // Response: the gains of the first LEARN_WEEKS trained weeks after calibration, against the curve.
  const after = pts.filter(p => p.t > calibEnd)
  const learnPts = []
  for (const p of after) { learnPts.push(p); if (weeksOf(learnPts) > LEARN_WEEKS) { learnPts.pop(); break } }
  const n = weeksOf(learnPts)
  let rho = prior
  if (n > 0) {
    const zLearn = Math.max(z0, confirmedBest(learnPts))
    const elapsed = n / 52
    const expected = gainOver(elapsed)
    const ratio = expected > 0 ? Math.max(0.3, Math.min(2.5, (zLearn - z0) / expected)) : prior
    rho = (n * ratio + PRIOR_WEEKS * prior) / (n + PRIOR_WEEKS)
  }
  rho = Math.max(RHO_RANGE[0], Math.min(RHO_RANGE[1], rho))

  // The thresholds, each at least one step above the one below (a rep for rep counts).
  const thresholds = {}
  let prev = z0
  for (const tier of TIERS) {
    const years = HORIZON_WEEKS[tier] / 52
    // Early gains say more about how fast this athlete improves than about how far they can go,
    // so the measured response weighs fully on the near tiers and less on the far ones.
    const weight = HALF_YEARS / (HALF_YEARS + years)
    let z = z0 + (1 + (rho - 1) * weight) * gainOver(years)
    if (type === 'reps') {
      const v0 = valueAt(metric, prev, base)
      if (v0 > 0) z = Math.max(z, prev + Math.log((Math.floor(v0) + 1) / v0) / sigma)
    }
    z = Math.max(z, prev + 0.005 / sigma)
    thresholds[tier] = z
    prev = z
  }
  const zBest = confirmedBest(pts)
  return {
    earnedAt: tier => earnedAt(pts, thresholds[tier], MIN_WEEKS[tier]),
    weeks: weeksOf(pts), status: 'ready', source: model ? 'model' : 'curve', type, z0, zBest, tau0, rho, learned: n >= LEARN_WEEKS, learnWeeks: n, sigma, thresholds, readings: pts, calibEnd }
}

/**
 * The confirmed z of each reading: the second best z of the readings of the CONFIRM_DAYS days up
 * to it (a single reading confirms nothing): [{ d, t, z }].
 */
export function confirmedSeries(points) {
  const out = []
  let from = 0
  for (let i = 0; i < points.length; i++) {
    while (points[i].t - points[from].t > CONFIRM_DAYS * DAY) from++
    if (i - from < 1) continue
    const zs = points.slice(from, i + 1).map(p => p.z).sort((a, b) => b - a)
    out.push({ d: points[i].d, t: points[i].t, z: zs[1] })
  }
  return out
}

/** The best confirmed z of `points`, or -Infinity. */
export const confirmedBest = points => Math.max(-Infinity, ...confirmedSeries(points).map(p => p.z))

/**
 * The date a tier was earned: the first confirmed reading at or above `z` once the exercise has
 * been trained in at least `minWeeks` weeks; null when not yet.
 */
export function earnedAt(readings, z, minWeeks = 0) {
  const conf = new Map(confirmedSeries(readings).map(p => [p.t, p.z]))
  const weeks = new Set()
  for (const p of readings) {
    weeks.add(weekOf(p.d))
    if (weeks.size >= minWeeks && conf.has(p.t) && conf.get(p.t) >= z - 1e-9) return p.d
  }
  return null
}

/** The date `z` was first confirmed in `readings`, or null. */
export const firstAtZ = (readings, z) => (confirmedSeries(readings).find(p => p.z >= z - 1e-9) || {}).d || null

/** Base data of the athlete now: { sex, birth, age, bw, unit, fat }. */
export function athleteBase(S, now = Date.now()) {
  const sex = S?.body === 'female' ? 'female' : 'male'
  const today = new Date(now)
  const iso = today.toISOString().slice(0, 10)
  return { sex, birth: S?.birth || null, age: ageOn(S?.birth, today), bw: bwOn(S, iso), unit: S?.unit === 'lb' ? 'lb' : 'kg', fat: bodyFatOf(S) }
}

/** The tier index (0 bronze ... 4 Olympian) a z falls in for a profile, or -1 below bronze. */
export function tierIndexOf(profile, z) {
  let k = -1
  TIERS.forEach((tier, i) => { if (z >= profile.thresholds[tier] - 1e-9) k = i })
  return k
}

/**
 * Strength kept with age: from 40 on, a session within KEEP of the best reached at least N years
 * earlier. The longest N over every measure: { years, at, metric } or null.
 */
export const KEEP = 0.95
export const KEPT_YEARS = [1, 2, 3, 5, 8]
export function keptFor(S, base, now = Date.now()) {
  let best = { years: 0, at: null, metric: null, held: [] }
  for (const metric of METRICS) {
    const pts = readingsOf(S, metric, base)
    if (pts.length < 2) continue
    for (const N of KEPT_YEARS) {
      for (const p of pts) {
        const age = ageOn(base.birth, new Date(p.d + 'T12:00:00'))
        if (!(age >= 40)) continue
        const peak = Math.max(0, ...pts.filter(q => q.t <= p.t - N * YEAR).map(q => q.value))
        if (peak > 0 && p.value >= KEEP * peak) {
          if (N > best.years) best = { years: N, at: p.d, metric }
          break
        }
      }
    }
  }
  // How far back the history reaches, for the next target's progress.
  const first = Math.min(...METRICS.flatMap(m => readingsOf(S, m, base).slice(0, 1).map(p => p.t)), Infinity)
  return { ...best, span: Number.isFinite(first) ? (now - first) / YEAR : 0 }
}
