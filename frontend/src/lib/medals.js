// Olympus: medals. Goals to reach in training (the volume of a workout, a week, a month and of all
// time; strength at the lifts; weeks in a row; workouts logged; records) and in spreading the word
// (friends invited, invitations sent, workouts shared to an Instagram story, posts in the feed).
//
// Each list of medals is a ladder of round targets, and what a person sees of it is cut to their
// own level, so that most of what is shown can be reached and some of it is ambitious:
//   - the start of a ladder that was already far below where they began (an athlete's first
//     workout was 9,000 kg: 1,000 kg is no achievement) is left out, except the highest one earned;
//   - the targets above them stop at a ceiling from their own numbers: for a lift, their personal
//     Olympian target (lib/athlete-profile.js), so a 50 kg woman is never shown a 150 kg squat;
//     for volume, a few times what they lift now;
//   - at most two or three targets ahead are shown at once, the next ones appear as they get close.
// The medal's colour (tier) is personal too: for a lift, the personal tier the target falls in;
// for volume, how far the target is above where they started.
//
// Strength is measured against the athlete's own potential (lib/athlete-profile.js): bronze,
// silver, gold, diamond and Olympian are the gains about 6, 16, 40, 80 and 156 weeks of steady
// training should bring this athlete, from their first sessions, for their sex, age, body weight
// and body fat and what the coaches know of their years of training. So each tier takes about the
// same work from a professional and from a beginner of 58, and Olympian takes years. From 40 on,
// strength kept over the years earns its own ladder. The medals of spreading the word, of
// consistency and the special days are the same for everyone.
//
// The medals of "Your goals" (lib/goal-medals.js) come from what the person told their coaches: the
// way they train, their phase, targets named in their goals and in the notes the coaches keep.
// For the administrator, `all` lists every medal of the app whatever the person's level or goals.
//
// Everything is worked out from the training document and a few counters (S.medals), never
// stored as "earned": a medal is earned when the data says so. S.medals.got only remembers which
// ones were already celebrated (components/Medals.jsx), so each pops up once.
import { t, tn, exerciseNameFor } from './i18n.js'
import { EXIDX } from './exercises.js'
import { fmtNum, weekKey, weekStartOf } from './format.js'
import { e1rmSeries } from './onerm.js'
import { lastBW } from './history.js'
import { LIFTS, METRICS, valuePoints, ageOn, missingFor, speedForVo2max, levelStart } from './strength-level.js'
import { TIERS, HORIZON_WEEKS, MIN_WEEKS, KEPT_YEARS, athleteBase, profileOf, valueAt, zOf, tierIndexOf, keptFor } from './athlete-profile.js'
import { fmtSpeed, speedUnitOf } from './speed.js'
import { goalGroup } from './goal-medals.js'
import { isWarmupRow } from './workout-model.js'

const LB = 0.45359237
export { TIERS }

// Heavy things to compare a volume with, in kg (rounded, typical adult weights).
const THINGS = [
  [500, () => t('grand piano')],
  [1000, () => t('small car')],
  [2300, () => t('white rhino')],
  [6000, () => t('African elephant')],
  [8000, () => t('T. rex')],
  [12000, () => t('double-decker bus')],
  [30000, () => t('humpback whale')],
  [150000, () => t('blue whale')],
  [180000, () => t('Boeing 747')],
  [420000, () => t('International Space Station')],
  [7300000, () => t('Eiffel Tower')],
]

/** "About 1.7 × African elephant." for a weight in kg, or '' below the lightest thing. */
export function funOf(kg) {
  let pick = null
  for (const th of THINGS) if (kg >= th[0]) pick = th
  if (!pick) return ''
  const r = kg / pick[0]
  const n = r < 10 ? Math.round(r * 10) / 10 : Math.round(r)
  return t('About {0} × {1}.', fmtNum(n), pick[1]())
}

const monthOf = iso => String(iso || '').slice(0, 7)
const sorted = S => [...(S?.workouts || [])].filter(w => w && w.d).sort((a, b) => (a.start || 0) - (b.start || 0))

/**
 * One ladder, cut to this person: medals for `values` (ascending), `best` reached so far,
 * `start` (where they began; targets far below it are trivial), `cap` (no unearned target above it),
 * `ahead` (how many unearned targets to show), `at(v)` (the date a target was reached, or null).
 */
function ladder({ id, group, icon, values, best, start = 0, trivial = 0.5, cap = Infinity, ahead = 2, tierOf, title, desc, fun, at, unit = '', all = false }) {
  const make = (v, e) => ({
    id: `${id}:${v}`, group, icon, value: v, target: v, current: best, unit,
    earned: e, at: e && at ? at(v) : null,
    progress: e ? 1 : Math.max(0, Math.min(1, best / v)),
    tier: TIERS[Math.max(0, Math.min(4, tierOf(v, values.indexOf(v))))],
    title: title(v), desc: desc(v), fun: fun ? fun(v) : '',
  })
  // The catalogue: every target of the ladder, whatever the person's level.
  if (all) return values.map(v => make(v, best >= v))
  const out = []
  const earned = values.filter(v => best >= v)
  const top = earned[earned.length - 1]
  for (const v of earned) {
    if (v !== top && start > 0 && v < start * trivial) continue
    out.push({ v, earned: true })
  }
  let shown = 0
  for (const v of values) {
    if (best >= v) continue
    if (shown >= ahead || (v > cap && shown > 0)) break
    if (v > cap * 1.15 && shown === 0 && cap !== Infinity) break
    out.push({ v, earned: false }); shown++
  }
  return out.map(({ v, earned: e }) => make(v, e))
}

// Tier by position in a ladder of fixed targets: the first are bronze, the last Olympian.
const byIndex = len => (_, i) => Math.floor(i * 5 / len)
// Tier by how far a volume target is above where this person started.
const byStart = start => v => {
  const r = start > 0 ? v / start : 1
  return r < 1.5 ? 0 : r < 2.5 ? 1 : r < 4 ? 2 : r < 7 ? 3 : 4
}

/** The first date in `points` ([{ d, y }], in order) where y reaches v. */
const firstAt = points => v => (points.find(p => p.y >= v) || {}).d || null

function median(xs) {
  if (!xs.length) return 0
  const a = [...xs].sort((x, y) => x - y)
  return a[Math.floor(a.length / 2)]
}

/** Weeks in a row, the longest run ever, with week keys from `ws`. */
function longestStreak(ws, keys) {
  const set = [...new Set(keys)].sort()
  let best = 0, run = 0, prev = null
  for (const k of set) {
    if (prev) {
      const d = new Date(prev + 'T12:00:00'); d.setDate(d.getDate() + 7)
      const next = d.toISOString().slice(0, 10)
      run = next === k ? run + 1 : 1
    } else run = 1
    if (run > best) best = run
    prev = k
  }
  return best
}

/**
 * The medals for `S` and the social counts `social` ({ invited, invites, stories, posts }), in
 * groups: [{ key, title, medals: [...] }]. A medal: { id, group, tier, title, desc, fun, earned,
 * at, progress, value, current }. `opts.notes` are the notes the coaches keep about the person
 * (texts, read for goals); `opts.all` lists every medal of the app, not only the person's own.
 */
export function medalsOf(S, social = {}, now = Date.now(), { notes = [], all = false, facts = {} } = {}) {
  const unit = S?.unit === 'lb' ? 'lb' : 'kg'
  const toKg = v => (unit === 'lb' ? v * LB : v)
  const x = unit === 'lb' ? 2 : 1   // ladders in pounds: the same round numbers, doubled
  const ws = weekStartOf(S)
  const W = sorted(S)
  const female = S?.body === 'female'
  const groups = []
  const vol = v => fmtNum(v) + ' ' + unit
  const L = o => ladder({ all, ...o })

  // ---- Spread the word: shown first, with more targets ahead, all of them within reach.
  const soc = []
  const invited = Number(social.invited ?? S?.medals?.invited) || 0
  const invites = Number(S?.medals?.invites) || 0
  const stories = Number(S?.medals?.stories) || 0
  const posts = Number(social.posts ?? Object.values(S?.wposts || {}).filter(v => v && v !== '-').length) || 0
  soc.push(...L({ id: 'invited', group: 'social', icon: 'person', values: [1, 3, 5, 10, 25, 50, 100], best: invited, ahead: 3,
    tierOf: (v) => (v >= 25 ? 4 : v >= 10 ? 3 : v >= 5 ? 2 : v >= 3 ? 1 : 0),
    title: v => tn('{0} friend joined', '{0} friends joined', v), desc: () => t('Friends who created their account with your invite code.') }))
  soc.push(...L({ id: 'invites', group: 'social', icon: 'envelope', values: [1, 5, 10, 25, 50], best: invites, ahead: 2, tierOf: byIndex(5),
    title: v => tn('{0} invitation sent', '{0} invitations sent', v), desc: () => t('Invitations to Olympus sent to friends from the app.') }))
  soc.push(...L({ id: 'stories', group: 'social', icon: 'camera', values: [1, 5, 10, 25, 50], best: stories, ahead: 2, tierOf: byIndex(5),
    title: v => tn('{0} story shared', '{0} stories shared', v), desc: () => t('Workouts shared to your Instagram story (or anywhere else) as an Olympus card.') }))
  soc.push(...L({ id: 'posts', group: 'social', icon: 'share', values: [1, 10, 25, 50, 100, 250], best: posts, ahead: 2, tierOf: byIndex(6),
    title: v => tn('{0} post in the feed', '{0} posts in the feed', v), desc: () => t('Workouts posted to your Olympus feed.') }))
  groups.push({ key: 'social', title: t('Spread the word'), medals: soc })

  const age = ageOn(S?.birth, new Date(now))
  const bw = lastBW({ bodyweight: S?.bodyweight || [] })?.w || 0
  const who = { sex: female ? 'female' : 'male', age, bw, unit }
  const upper = x => String(x).charAt(0).toUpperCase() + String(x).slice(1)
  const nameOf = m => {
    const name = upper(EXIDX[m.id] ? exerciseNameFor(EXIDX[m.id]) : m.name)
    return m.type === 'sprint' ? t('{0} (sprint)', name) : name
  }
  // The running best of an exercise, by date: { pts, best, start } (empty and 0 when never done).
  const series = m => {
    let pts
    if ((m.type || 'load') === 'load') {
      let b = 0
      pts = e1rmSeries(S, m.id).sort((a, c) => a.t - c.t).map(p => ({ d: p.d, y: (b = Math.max(b, p.y)), first: p.y }))
    } else pts = valuePoints(S, m)
    return { pts, best: pts.length ? pts[pts.length - 1].y : 0, start: pts.length ? pts[0].first : 0 }
  }

  // ---- Your goals: what they told their coaches. Built before the rest: it says which exercises to show.
  const goals = goalGroup({ S, notes, all, now, unit, who, W, ws, series, nameOf, levelName, vol, ladder: L, firstAt, byIndex })
  if (goals.medals.length) groups.push({ key: 'goals', title: goals.title, medals: goals.medals })


  // ---- Volume
  const vols = W.map(w => ({ d: w.d, y: Number(w.vol) || 0 }))
  const startSession = median(vols.slice(0, 5).map(p => p.y)) || (female ? 1200 : 2500) * x
  const bestSession = Math.max(0, ...vols.map(p => p.y))
  let runBest = 0
  const sessionPts = vols.map(p => ({ d: p.d, y: (runBest = Math.max(runBest, p.y)) }))
  const weeks = new Map(), months = new Map()
  for (const w of W) {
    const wk = weekKey(w.d, ws), mo = monthOf(w.d)
    weeks.set(wk, (weeks.get(wk) || 0) + (Number(w.vol) || 0))
    months.set(mo, { vol: (months.get(mo)?.vol || 0) + (Number(w.vol) || 0), n: (months.get(mo)?.n || 0) + 1, d: w.d })
  }
  const weekVals = [...weeks.values()], monthVals = [...months.values()].map(m => m.vol)
  const startWeek = median(weekVals.slice(0, 3)) || startSession * 2.5
  const startMonth = median(monthVals.slice(0, 2)) || startWeek * 4
  const ptsOf = (map, f) => { let b = 0; const out = []; for (const [k, v] of [...map.entries()].sort()) { b = Math.max(b, f(v)); out.push({ d: k.length === 7 ? k + '-01' : k, y: b }) } return out }
  let total = 0
  const totalPts = vols.map(p => ({ d: p.d, y: (total += p.y) }))
  const funKg = v => funOf(toKg(v))
  const volume = []
  volume.push(...L({ id: 'vol-session', group: 'volume', icon: 'dumbbell', values: [1000, 2500, 5000, 7500, 10000, 15000, 20000, 30000, 40000].map(v => v * x),
    best: bestSession, start: startSession, cap: Math.max(bestSession, startSession) * 2.5, tierOf: byStart(startSession),
    title: v => t('{0} in one workout', vol(v)), desc: () => t('The weight of every set of one workout, added up.'), fun: funKg, at: firstAt(sessionPts), unit }))
  volume.push(...L({ id: 'vol-week', group: 'volume', icon: 'calendar', values: [5000, 10000, 20000, 30000, 50000, 75000, 100000, 150000].map(v => v * x),
    best: Math.max(0, ...weekVals), start: startWeek, cap: Math.max(Math.max(0, ...weekVals), startWeek) * 2.5, tierOf: byStart(startWeek),
    title: v => t('{0} in one week', vol(v)), desc: () => t('All the volume of one week.'), fun: funKg, at: firstAt(ptsOf(weeks, v => v)), unit }))
  volume.push(...L({ id: 'vol-month', group: 'volume', icon: 'chart', values: [20000, 40000, 75000, 100000, 150000, 250000, 400000, 600000].map(v => v * x),
    best: Math.max(0, ...monthVals), start: startMonth, cap: Math.max(Math.max(0, ...monthVals), startMonth) * 2.5, tierOf: byStart(startMonth),
    title: v => t('{0} in one month', vol(v)), desc: () => t('All the volume of one calendar month.'), fun: funKg, at: firstAt(ptsOf(months, m => m.vol)), unit }))
  volume.push(...L({ id: 'vol-total', group: 'volume', icon: 'crown', values: [10000, 100000, 250000, 500000, 1000000, 2500000, 5000000, 10000000].map(v => v * x),
    best: total, ahead: 2, tierOf: byIndex(8),
    title: v => t('{0} lifted in total', vol(v)), desc: () => t('Everything you have lifted in Olympus.'), fun: funKg, at: firstAt(totalPts), unit }))
  groups.push({ key: 'volume', title: t('Volume'), medals: volume })

  // ---- Strength: personal tiers (lib/athlete-profile.js) for the exercises they train and the
  // ones their goals point at, the round weights on the main lifts, and strength kept with age.
  const strength = []
  const pending = []
  const base = athleteBase(S, now)
  const su = speedUnitOf(S)
  const valueText = (m, v) => {
    const type = m.type || 'load'
    if (type === 'load') return vol(unit === 'lb' ? Math.ceil(v) : Math.ceil(v * 2) / 2)
    if (type === 'reps') return `${fmtNum(Math.ceil(v - 1e-9))} ${t('reps')}`
    if (type === 'aerobic') return t('{0} for 30 min', fmtSpeed(Math.round(speedForVo2max(v, 30) * 10) / 10, su))
    return fmtSpeed(Math.round(v * 10) / 10, su)
  }
  const PLATES = unit === 'lb' ? [95, 135, 185, 225, 275, 315, 365, 405, 455, 495, 545, 585, 635] : [40, 60, 80, 100, 120, 140, 160, 180, 200, 220, 250, 280, 300]
  const PLATE_N = unit === 'lb' ? { 135: 1, 225: 2, 315: 3, 405: 4, 495: 5, 585: 6 } : { 60: 1, 100: 2, 140: 3, 180: 4, 220: 5, 260: 6 }
  // For the catalogue, a person without a birth date or body weight is measured as a reference adult.
  const ref = { ...base, age: base.age || 30, birth: base.birth || `${new Date(now).getFullYear() - 30}-01-01`, bw: base.bw || (female ? 62 : 80) * (unit === 'lb' ? 2.2046 : 1) }
  const w2 = all ? ref : base
  let potentialRatio = 0   // the highest Olympian target of a lift, against body weight
  for (const m of METRICS) {
    const type = m.type || 'load'
    const { pts, best, start } = series(m)
    // An exercise never done is shown only when their style or a goal of theirs points at it.
    if (!pts.length && !all && !goals.focus.has(m.key)) continue
    const prof = profileOf(S, m, w2, facts)
    if (prof.status === 'calibrating' && !all) pending.push({ key: m.key, name: nameOf(m), done: prof.done, need: prof.need })
    if (prof.status === 'ready') {
      if (type === 'load' && w2.bw > 0) potentialRatio = Math.max(potentialRatio, valueAt(m, prof.thresholds.olympian, w2) / w2.bw)
      let ahead = 0
      TIERS.forEach((tier, i) => {
        const z = prof.thresholds[tier]
        const at = prof.earnedAt(tier)
        const kept = !all && (S?.medals?.got || {})[`pt:${m.key}:${tier}`]
        if (!at && !kept && !all && ahead >= 2) return
        if (!at && !kept) ahead++
        const target = valueAt(m, z, w2)
        const span = z - prof.z0
        const progress = at ? 1 : Math.max(0, Math.min(1, Math.min(span > 0 ? (prof.zBest - prof.z0) / span : 0, prof.weeks / MIN_WEEKS[tier])))
        strength.push({
          id: `pt:${m.key}:${tier}`, group: 'strength', icon: i >= 3 ? 'crown' : 'bolt', value: target, current: best, unit,
          earned: !!at, at, progress, tier,
          title: t('{0}: {1}', nameOf(m), valueText(m, target)),
          desc: t('Your personal target: what about {0} weeks of steady training should bring you, from where you started, for your age and body. It also takes {1} weeks of training this exercise.', HORIZON_WEEKS[tier], MIN_WEEKS[tier]),
          fun: '',
        })
      })
    } else if (all) {
      // The catalogue: the tiers of a reference adult who starts this exercise from scratch.
      for (const tier of TIERS) strength.push({ id: `pt:${m.key}:${tier}`, group: 'strength', icon: 'bolt', value: 0, current: best, unit, earned: false, at: null, progress: 0, tier,
        title: t('{0}: {1}', nameOf(m), tierLabel(tier)), desc: t('Your personal target: what about {0} weeks of steady training should bring you, from where you started, for your age and body. It also takes {1} weeks of training this exercise.', HORIZON_WEEKS[tier], MIN_WEEKS[tier]), fun: '' })
    }
    // The round weights (plates on a barbell lift), between where they began and their Olympian target.
    if (type === 'load' && LIFTS.includes(m)) {
      const ready = prof.status === 'ready'
      // Before the profile is ready: the start of Elite for their sex, age and body weight.
      const cap = ready ? valueAt(m, prof.thresholds.olympian, w2) : w2.age && w2.bw > 0 ? levelStart(m, 'elite', w2) : best * 1.6
      strength.push(...L({ id: `lift:${m.key}`, group: 'strength', icon: 'barbell', values: PLATES, best, start, trivial: 0.8, cap, ahead: 2,
        tierOf: v => {
          if (!ready) return byIndex(PLATES.length)(v, PLATES.indexOf(v))
          return Math.max(0, tierIndexOf(prof, zOf(m, v, w2)))
        },
        title: v => t('{0}: {1}', nameOf(m), vol(v)),
        desc: v => (PLATE_N[v] ? tn('Estimated one-rep max: {0} plate on each side.', 'Estimated one-rep max: {0} plates on each side.', PLATE_N[v]) : t('Estimated one-rep max.')),
        at: firstAt(pts), unit }))
    }
  }
  // Strength kept with age: from 40 on, holding within 5 % of a best of years before.
  if (all || (base.age >= 40)) {
    const kept = keptFor(S, base, now)
    if (all || kept.span >= 0.75) {
      strength.push(...L({ id: 'kept', group: 'strength', icon: 'hourglass', values: KEPT_YEARS, best: kept.years, ahead: 1, tierOf: byIndex(KEPT_YEARS.length),
        title: v => tn('Strength kept for {0} year', 'Strength kept for {0} years', v),
        desc: () => t('From the age of 40: a set within 5% of your best of that many years before. Keeping your strength as the years go by is a feat of its own.'),
        at: v => (kept.years >= v ? kept.at : null) }))
    }
  }
  // A target of theirs already has its own medal: the round weight is not shown twice.
  const missing = !all && (!(base.age > 0) || !(base.bw > 0)) ? missingFor(S, new Date(now)) : []
  groups.push({ key: 'strength', title: t('Strength'), medals: strength.filter(m => !(m.id.startsWith('lift:') && goals.covers.has(m.id.slice(5)))), pending, missing })

  // ---- Consistency and milestones
  const streak = longestStreak(ws, W.map(w => weekKey(w.d, ws)))
  const perMonth = Math.max(0, ...[...months.values()].map(m => m.n))
  const n = W.length
  const prs = W.reduce((a, w) => a + ((w.prs || []).length), 0)
  const habit = []
  habit.push(...L({ id: 'streak', group: 'habit', icon: 'flame', values: [2, 4, 8, 12, 26, 52, 104], best: streak, ahead: 2, tierOf: byIndex(7),
    title: v => (v === 4 ? t('A month without missing a week') : v === 52 ? t('A whole year, every week') : tn('{0} week in a row', '{0} weeks in a row', v)),
    desc: () => t('Weeks with at least one workout, without a gap.') }))
  habit.push(...L({ id: 'month', group: 'habit', icon: 'calendar', values: [4, 8, 12, 16, 20, 25], best: perMonth, ahead: 2, tierOf: byIndex(6),
    title: v => tn('{0} workout in one month', '{0} workouts in one month', v), desc: () => t('Workouts logged in a single calendar month.') }))
  habit.push(...L({ id: 'count', group: 'habit', icon: 'checkCircle', values: [1, 10, 25, 50, 100, 200, 300, 500, 1000], best: n, ahead: 2, tierOf: byIndex(9),
    title: v => (v === 1 ? t('First workout') : tn('{0} workout logged', '{0} workouts logged', v)), desc: () => t('Every finished workout counts.'),
    at: v => W[v - 1]?.d || null }))
  habit.push(...L({ id: 'prs', group: 'habit', icon: 'trophy', values: [1, 10, 25, 50, 100, 250], best: prs, ahead: 2, tierOf: byIndex(6),
    title: v => tn('{0} personal record', '{0} personal records', v), desc: () => t('New heaviest weights, across all your exercises.') }))
  // Hours spent training, all workouts together.
  let mins = 0
  const minPts = W.map(w => ({ d: w.d, y: (mins += w.end && w.start && w.end > w.start ? Math.min(6 * 60, (w.end - w.start) / 60000) : 0) }))
  habit.push(...L({ id: 'hours', group: 'habit', icon: 'clock', values: [10, 25, 50, 100, 250, 500, 1000], best: Math.floor(mins / 60), ahead: 2, tierOf: byIndex(7),
    title: v => tn('{0} hour of training', '{0} hours of training', v), desc: () => t('All the time of your workouts, added up.'),
    at: v => firstAt(minPts)(v * 60) }))
  groups.push({ key: 'habit', title: t('Consistency'), medals: habit })

  // ---- Special: one-off feats and days to remember. Each is worked out from the workouts (and the
  // birth date, the body weight, the gyms); a medal that counts something shows how far along it is.
  const hour = w => new Date(w.start || 0).getHours()
  const mdOf = w => String(w.d).slice(5)
  const dayMs = iso => Date.parse(iso + 'T12:00:00')
  const workSets = w => (w.entries || []).flatMap(e => (e.sets || []).filter(x => x && x.done && !isWarmupRow(x)))
  const first = f => W.find(f) || null
  const nth = (f, k) => { let c = 0; for (const w of W) if (f(w) && ++c >= k) return w; return null }
  const countOf = f => W.reduce((c, w) => c + (f(w) ? 1 : 0), 0)
  const early = w => w.start && hour(w) < 7
  const long = w => w.end && w.start && w.end - w.start >= 2 * 3600000
  const days = new Map()
  for (const w of W) { const k = weekKey(w.d, ws); const dow = new Date(w.d + 'T12:00:00').getDay(); days.set(k, (days.get(k) || 0) | (dow === 6 ? 1 : dow === 0 ? 2 : 0)) }
  // Days in a row with a workout, the longest run, and the day it was reached.
  const dates = [...new Set(W.map(w => w.d))].sort()
  let runDays = 0, bestRun = 0, runAt = null
  dates.forEach((d, i) => {
    runDays = i && Math.round((dayMs(d) - dayMs(dates[i - 1])) / 86400000) === 1 ? runDays + 1 : 1
    if (runDays > bestRun) bestRun = runDays
    if (runDays >= 7 && !runAt) runAt = d
  })
  // The first workout after a month or more without one.
  const comeback = W.find((w, i) => i > 0 && dayMs(w.d) - dayMs(W[i - 1].d) >= 30 * 86400000) || null
  // Two workouts on the same day.
  const twice = W.find((w, i) => W.findIndex(o => o.d === w.d) < i) || null
  // Months in a row with a workout, the longest run.
  const monthsDone = [...new Set(W.map(w => monthOf(w.d)))].sort()
  let mRun = 0, mBest = 0, mAt = null
  monthsDone.forEach((m, i) => {
    const prev = monthsDone[i - 1]
    const next = prev ? (() => { const [y, mo] = prev.split('-').map(Number); return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}` })() : null
    mRun = prev && next === m ? mRun + 1 : 1
    if (mRun > mBest) mBest = mRun
    if (mRun >= 12 && !mAt) mAt = m + '-01'
  })
  // Every exercise ever done, in order, and the day the 25th and the 75th were first done.
  const seen = new Map()
  for (const w of W) for (const e of w.entries || []) if (e?.id && workSets({ entries: [e] }).length && !seen.has(e.id)) seen.set(e.id, w.d)
  const seenAt = k => [...seen.values()][k - 1] || null
  // Sets in one week, the most.
  const weekSets = new Map()
  for (const w of W) { const k = weekKey(w.d, ws); weekSets.set(k, (weekSets.get(k) || 0) + workSets(w).length) }
  const sets100 = [...weekSets.entries()].sort().find(([, n]) => n >= 100)
  const gymsSeen = new Map()
  for (const w of W) { const g = String(w.gym || '').trim(); if (g && !gymsSeen.has(g)) gymsSeen.set(g, w.d) }
  const birth = String(S?.birth || '').slice(5, 10)
  const heavy = bw > 0 ? first(w => workSets(w).some(x => (Number(x.w) || 0) >= 2 * bw && (Number(x.r) || 0) >= 1)) : null
  const fri13 = w => w.d.slice(8) === '13' && new Date(w.d + 'T12:00:00').getDay() === 5
  const one = (k, icon, tier, w, title, desc, { progress, show = true } = {}) =>
    (show || all || w ? { id: 'special:' + k, group: 'special', icon, earned: !!w, at: w?.d || (typeof w === 'string' ? w : null), progress: w ? 1 : Math.max(0, Math.min(1, progress || 0)), tier, title, desc, fun: '' } : null)
  const special = [
    one('early', 'sunrise', 'silver', first(early), t('Early bird'), t('A workout started before 7 in the morning.')),
    one('dawn', 'sunrise', 'diamond', nth(early, 10), t('Dawn patrol'), t('Ten workouts started before 7 in the morning.'), { progress: countOf(early) / 10 }),
    one('late', 'moon', 'silver', first(w => w.start && hour(w) >= 22), t('Night owl'), t('A workout started after 10 at night.')),
    one('weekend', 'star', 'gold', first(w => days.get(weekKey(w.d, ws)) === 3), t('Weekend warrior'), t('Trained on both Saturday and Sunday of the same weekend.')),
    one('long', 'hourglass', 'gold', first(long), t('Marathon session'), t('One workout of two hours or more.')),
    one('quick', 'stopwatch', 'silver', first(w => w.end && w.start && w.end - w.start <= 30 * 60000 && workSets(w).length >= 12), t('In and out'), t('Twelve sets or more in a workout of half an hour or less.')),
    one('twice', 'repeat', 'silver', twice, t('Twice in a day'), t('Two workouts on the same day.')),
    { ...one('seven', 'flame', 'diamond', runAt, t('Seven days straight'), t('A workout every day for seven days in a row.'), { progress: bestRun / 7 }), at: runAt },
    one('comeback', 'undo', 'silver', comeback, t('The comeback'), t('Back to training after a month or more away.')),
    { ...one('year', 'calendar', 'olympian', mAt, t('A year without a month off'), t('Twelve calendar months in a row, each with at least one workout.'), { progress: mBest / 12 }), at: mAt },
    one('records', 'trophy', 'gold', first(w => (w.prs || []).length >= 5), t('Record day'), t('Five personal records or more in one workout.')),
    one('labours', 'list', 'gold', first(w => new Set((w.entries || []).filter(e => workSets({ entries: [e] }).length).map(e => e.id)).size >= 12), t('Twelve labours'), t('Twelve different exercises in one workout, as many as the labours of Hercules.')),
    { ...one('explorer', 'magnifier', 'silver', seenAt(25), t('Explorer'), t('Twenty-five different exercises tried.'), { progress: seen.size / 25 }), at: seenAt(25) },
    { ...one('odyssey', 'magnifier', 'diamond', seenAt(75), t('Odyssey'), t('Seventy-five different exercises tried.'), { progress: seen.size / 75 }), at: seenAt(75) },
    { ...one('sets100', 'checkCircle', 'gold', sets100 ? sets100[0] : null, t('A hundred sets'), t('A hundred working sets in one week.'), { progress: Math.max(0, ...weekSets.values()) / 100 }), at: sets100 ? sets100[0] : null },
    { ...one('traveller', 'pin', 'silver', [...gymsSeen.values()][2] || null, t('Traveller'), t('Workouts in three different gyms.'), { progress: gymsSeen.size / 3 }), at: [...gymsSeen.values()][2] || null },
    one('atlas', 'arm', 'olympian', heavy, t('Atlas holds the sky'), t('A set with twice your body weight on the bar.'), { show: bw > 0 && (potentialRatio >= 2 || all) }),
    one('birthday', 'crown', 'gold', birth ? first(w => mdOf(w) === birth) : null, t('Birthday gains'), t('A workout on your birthday.'), { show: !!birth }),
    one('newyear', 'sparkles', 'gold', first(w => mdOf(w) === '01-01'), t('New year, first rep'), t('A workout on the first of January.')),
    one('valentine', 'heart', 'silver', first(w => mdOf(w) === '02-14'), t('Love the iron'), t('A workout on Valentine’s Day.')),
    one('leap', 'rocket', 'olympian', first(w => mdOf(w) === '02-29'), t('Leap day'), t('A workout on the 29th of February, once in four years.')),
    one('solstice', 'sun', 'silver', first(w => mdOf(w) === '06-21'), t('The longest day'), t('A workout on the summer solstice, the 21st of June.')),
    one('halloween', 'moon', 'silver', first(w => mdOf(w) === '10-31'), t('Ghost lifter'), t('A workout on Halloween.')),
    one('friday13', 'bolt', 'gold', first(fri13), t('Not superstitious'), t('A workout on a Friday the 13th.')),
    one('christmas', 'star', 'gold', first(w => mdOf(w) === '12-25'), t('Holiday spirit'), t('A workout on Christmas Day.')),
  ].filter(Boolean).map(m => (m.earned && !m.at ? { ...m, at: null } : m))
  groups.push({ key: 'special', title: t('Special'), medals: special })

  // A medal already celebrated stays won: the personal targets follow age, body weight and what
  // the coaches learn, so a target can move after it was reached; the medal does not go away.
  const got = S?.medals?.got || {}
  if (!all) for (const g of groups) g.medals = g.medals.map(m => (!m.earned && got[m.id] ? { ...m, earned: true, progress: 1, at: m.at || new Date(Number(got[m.id]) || now).toISOString().slice(0, 10) } : m))

  return groups
}

/** The name of a tier, in the app's language. */
export const tierLabel = tier => ({ bronze: t('Bronze'), silver: t('Silver'), gold: t('Gold'), diamond: t('Diamond'), olympian: t('Olympian') }[tier] || tier)

const levelName = lvl => (lvl === 'intermediate' ? t('Intermediate') : lvl === 'advanced' ? t('Advanced') : lvl === 'elite' ? t('Elite') : t('Beginner'))

/** All medals in one list. */
export const allMedals = groups => groups.flatMap(g => g.medals)

/** The medals earned in `after` and not in `got` (ids already celebrated), best tier first. */
export function newlyEarned(groups, got = {}) {
  return allMedals(groups).filter(m => m.earned && !got[m.id]).sort((a, b) => TIERS.indexOf(b.tier) - TIERS.indexOf(a.tier))
}

/** The unearned medal closest to being earned (the one to show as "next"). */
export function nextMedal(groups) {
  return allMedals(groups).filter(m => !m.earned && m.progress > 0).sort((a, b) => b.progress - a.progress)[0] || null
}
