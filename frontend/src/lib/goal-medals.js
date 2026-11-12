// Olympus: medals that follow what the person told their coaches (lib/coach-profile.js and the
// notes of lib/coach-memory.js). The training medals of lib/medals.js are the same for everyone,
// cut to the person's level; these ones come from the person's own words, so two people with the
// same numbers see different medals:
//   - a target they named: "bench 100 kg" gives a medal for 100 kg and for the steps on the way
//     (lib/goal-parse.js reads it from their goals and from the coaches' notes);
//   - how often they want to train: weeks in a row at that many workouts;
//   - the way they train: a powerlifter has a total (squat, bench press and deadlift) with levels,
//     whoever trains for strength, size, skills or sport has weeks with a new record, whoever trains
//     for health, endurance or a sport has the weekly minutes (the WHO asks for at least 150);
//   - the phase: weight lost since a cut began, weeks in a row since a comeback began.
// Like every medal they are worked out from the training document, never stored. `all` lists
// every family of them whatever the person said (the administrator's catalogue).
import { t, tn } from './i18n.js'
import { fmtNum, weekKey } from './format.js'
import { coachProfileOf } from './coach-profile.js'
import { parseGoals } from './goal-parse.js'
import { METRICS, LIFTS, LEVELS, levelStart, speedForVo2max } from './strength-level.js'
import { fmtSpeed, speedUnitOf } from './speed.js'

// The styles each kind of medal is for.
const RECORD_STYLES = ['bodybuilding', 'powerlifting', 'strength', 'functional', 'calisthenics', 'sport']
const MINUTES_STYLES = ['endurance', 'health', 'functional', 'sport']

// The exercises a style puts in front: their level medals show even before the first set.
const FOCUS = {
  powerlifting: ['squat', 'bench', 'deadlift'],
  strength: ['squat', 'bench', 'deadlift', 'ohp'],
  bodybuilding: ['squat', 'bench', 'row', 'ohp'],
  calisthenics: ['pull-up', 'push-up', 'dip'],
  endurance: ['run', 'rowing'],
}

/** The keys of the exercises the person's style and targets point at (lib/strength-level.js). */
export function focusKeys(S, targets = []) {
  const keys = new Set(targets.map(x => x.key))
  for (const s of coachProfileOf(S).styles) for (const k of FOCUS[s] || []) keys.add(k)
  return keys
}

/** The targets and weekly frequency in the person's goals and notes, with where each came from. */
export function goalsRead(S, notes, { unit, bw }) {
  const p = coachProfileOf(S)
  const r = parseGoals([p.goals, ...notes], { unit, bw })
  return { ...r, targets: r.targets.map(x => ({ ...x, source: x.from === 0 ? 'goals' : 'memory' })) }
}

const nextWeek = k => { const d = new Date(k + 'T12:00:00'); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10) }

/** From the week keys that qualify: the longest run of weeks in a row, and the week it first reached a length. */
function streaks(keys) {
  const set = [...new Set(keys)].sort()
  const at = new Map()
  let best = 0, run = 0, prev = null
  for (const k of set) {
    run = prev && nextWeek(prev) === k ? run + 1 : 1
    if (run > best) best = run
    if (!at.has(run)) at.set(run, k)
    prev = k
  }
  return { best, at: v => at.get(v) || null }
}

/**
 * The goal medals: { key: 'goals', title, medals, covers } where `covers` holds "exercise:value" of
 * the targets, so the round-weight medals of lib/medals.js do not repeat them.
 * `c` is what lib/medals.js has at hand: S, notes, all, now, unit, who, W (the workouts in date
 * order), ws, series(metric), nameOf(metric), levelName(level), vol(v), ladder, firstAt, byIndex.
 */
export function goalGroup(c) {
  const { S, all, unit, who, W, ws } = c
  const p = coachProfileOf(S)
  const styles = new Set(p.styles)
  const read = goalsRead(S, c.notes || [], { unit, bw: who.bw })
  const medals = []
  const covers = new Set()
  const bwOk = who.age > 0 && who.bw > 0
  const ref = { ...who, age: who.age || 30, bw: who.bw || (who.sex === 'female' ? 62 : 80) * (unit === 'lb' ? 2.2046 : 1) }
  const L = o => c.ladder({ group: 'goals', all, ...o })
  const snapW = unit === 'lb' ? 5 : 2.5

  // ---- A target they named.
  let targets = read.targets
  if (all) {
    const level = m => levelStart(m, 'elite', ref)
    targets = [...LIFTS.slice(0, 3), ...METRICS.filter(m => m.key === 'pull-up' || m.key === 'run')]
      .map(m => ({ key: m.key, kind: m.type || 'load', value: level(m), source: 'sample' }))
  }
  for (const tg of targets) {
    const m = METRICS.find(x => x.key === tg.key)
    if (!m || !(tg.value > 0)) continue
    const kind = m.type || 'load'
    const { pts, best, start } = c.series(m)
    const base = pts.length ? start : 0
    const snap = v => (kind === 'load' ? Math.round(v / snapW) * snapW : kind === 'reps' ? Math.round(v) : Math.round(v * 2) / 2)
    const goal = snap(tg.value)
    if (!(goal > 0)) continue
    const steps = [0.5, 0.75].map(f => snap(base + (goal - base) * f)).filter((v, i, a) => v > base && v < goal && a.indexOf(v) === i)
    const values = [...steps, goal]
    const name = c.nameOf(m)
    // A running goal is kept as the VO2max it takes (lib/strength-level.js) and read back as the
    // speed that VO2max holds for 30 minutes, the way it was asked for.
    const su = speedUnitOf(S)
    const text = v => (kind === 'load' ? c.vol(v) : kind === 'reps' ? `${fmtNum(v)} ${t('reps')}`
      : kind === 'aerobic' ? t('{0} for 30 min', fmtSpeed(Math.round(speedForVo2max(v, 30) * 10) / 10, su)) : fmtSpeed(v, su))
    for (const v of values) covers.add(`${m.key}:${v}`)
    medals.push(...L({ id: `goal:${m.key}`, icon: 'target', values, best, ahead: 3, start: base,
      tierOf: v => (v === goal ? 4 : v === values[0] && values.length > 2 ? 1 : 2),
      title: v => t('{0}: {1}', name, text(v)),
      desc: v => (v === goal ? t('The goal you gave your coaches.') : t('On the way to a goal you gave your coaches.')),
      at: c.firstAt(pts), unit: kind === 'load' ? unit : '' }))
  }

  // ---- How often they want to train.
  const perWeek = all ? 3 : read.perWeek
  if (perWeek > 0) {
    const counts = new Map()
    for (const w of W) { const k = weekKey(w.d, ws); counts.set(k, (counts.get(k) || 0) + 1) }
    const run = streaks([...counts].filter(([, n]) => n >= perWeek).map(([k]) => k))
    medals.push(...L({ id: `goal:week${perWeek}`, icon: 'calendar', values: [2, 4, 8, 12, 26], best: run.best, ahead: 2, tierOf: c.byIndex(5),
      title: v => t('{0}: {1}', t('Weekly goal'), tn('{0} week in a row', '{0} weeks in a row', v)),
      desc: () => t('Weeks in a row with your goal of workouts per week: {0}.', perWeek), at: run.at }))
  }

  // ---- A powerlifter's total: squat, bench press and deadlift together, level by level.
  if (all || styles.has('powerlifting')) {
    const three = LIFTS.filter(l => ['squat', 'bench', 'deadlift'].includes(l.key))
    if (three.length === 3 && (all || bwOk)) {
      const bests = three.map(l => c.series(l).pts)
      const sum = bests.reduce((a, pts) => a + (pts.length ? pts[pts.length - 1].y : 0), 0)
      // The date a total was first reached: the three running bests, merged in date order.
      const events = bests.flatMap((pts, i) => pts.map(pt => ({ ...pt, i }))).sort((a, b) => String(a.d).localeCompare(String(b.d)))
      const run = [0, 0, 0]
      const totals = events.map(e => { run[e.i] = e.y; return { d: e.d, y: run[0] + run[1] + run[2] } })
      const w = bwOk ? who : ref
      let ahead = 0
      for (let i = 1; i < LEVELS.length; i++) {
        const need = three.reduce((a, l) => a + (levelStart(l, LEVELS[i], w) || 0), 0)
        if (!(need > 0)) continue
        const got = sum >= need
        if (!all && !got && ahead++ >= 2) break
        medals.push({
          id: `goal:total:${LEVELS[i]}`, group: 'goals', icon: 'barbell', value: need, current: sum, unit, earned: got,
          at: got ? c.firstAt(totals)(need) : null, progress: got ? 1 : Math.max(0, Math.min(1, sum / need)),
          tier: i === 1 ? 'silver' : i === 2 ? 'gold' : 'olympian',
          title: t('{0}: {1}', t('Powerlifting total'), c.levelName(LEVELS[i])),
          desc: t('Squat, bench press and deadlift together, for your sex, age and body weight.'), fun: '',
        })
      }
    }
  }

  // ---- Weeks with a new record: whoever trains for strength, size, skills or sport, or builds muscle.
  if (all || RECORD_STYLES.some(s => styles.has(s)) || p.phase === 'build' || p.phase === 'peak') {
    const weeks = new Map()
    for (const w of W) if ((w.prs || []).length) weeks.set(weekKey(w.d, ws), w.d)
    const ordered = [...weeks.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    medals.push(...L({ id: 'goal:record-weeks', icon: 'trophy', values: [1, 4, 8, 12, 26, 52], best: ordered.length, ahead: 2, tierOf: c.byIndex(6),
      title: v => tn('{0} week with a new record', '{0} weeks with a new record', v),
      desc: () => t('Weeks in which you set a personal record.'), at: v => ordered[v - 1]?.[1] || null }))
  }

  // ---- Minutes of training in a week: the WHO recommends at least 150 of physical activity.
  if (all || MINUTES_STYLES.some(s => styles.has(s))) {
    const weeks = new Map()
    for (const w of W) if (w.end > w.start) weeks.set(weekKey(w.d, ws), (weeks.get(weekKey(w.d, ws)) || 0) + Math.min(240, (w.end - w.start) / 60000))
    let top = 0
    const pts = [...weeks.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([d, m]) => ({ d, y: (top = Math.max(top, Math.round(m))) }))
    medals.push(...L({ id: 'goal:minutes', icon: 'clock', values: [60, 120, 150, 210, 300, 420], best: top, ahead: 2, tierOf: c.byIndex(6),
      title: v => t('Training time in one week: {0} min', v),
      desc: () => t('The World Health Organization recommends at least 150 minutes of physical activity a week.'), at: c.firstAt(pts) }))
  }

  // ---- Phases: a cut (weight lost since it began) and a comeback (weeks in a row since it began).
  const since = p.since > 0 ? new Date(p.since).toISOString().slice(0, 10) : ''
  if (all || (p.phase === 'cut' && since)) {
    const logged = (S?.bodyweight || []).filter(b => b && Number(b.w) > 0 && b.d).sort((a, b) => String(a.d).localeCompare(String(b.d)))
    const from = logged.filter(b => b.d >= since)
    const base = from[0]
    if (all || (base && from.length >= 2)) {
      let top = 0
      const pts = base ? from.map(b => ({ d: b.d, y: (top = Math.max(top, Math.round((Number(base.w) - Number(b.w)) / Number(base.w) * 1000) / 10)) })) : []
      medals.push(...L({ id: 'goal:cut', icon: 'flame', values: [1, 2, 3, 5, 7.5, 10], best: top, ahead: 2, tierOf: c.byIndex(6),
        title: v => t('{0}% of body weight lost', fmtNum(v)),
        desc: () => t('Measured from your first weigh-in after you chose your phase.'), at: c.firstAt(pts) }))
    }
  }
  if (all || (p.phase === 'recover' && since)) {
    const first = since ? weekKey(since, ws) : ''
    const run = streaks(W.filter(w => w.d >= (since || '9999')).map(w => weekKey(w.d, ws)).filter(k => k >= first))
    medals.push(...L({ id: 'goal:comeback', icon: 'heart', values: [1, 2, 4, 8, 12], best: run.best, ahead: 2, tierOf: c.byIndex(5),
      title: v => t('{0}: {1}', t('Coming back'), tn('{0} week in a row', '{0} weeks in a row', v)),
      desc: () => t('Weeks in a row with a workout since you chose this phase.'), at: run.at }))
  }

  return { key: 'goals', title: t('Your goals'), medals, covers, read, focus: focusKeys(S, read.targets) }
}
