// Olympus: Chiron, the coach of the workout in progress (components/Chiron.jsx). He sleeps in the
// workout header; a few quick taps wake him, and the first thing he says needs no network: how
// long to rest before the next set, and what that set is (the weight and reps the app's own
// progression has already worked out). Anything else is a question for the model (api/hercules.js
// chiron), which reads the same workout, goals and shared coach memory.

/** Taps that wake him, and how close together they have to come. */
export const WAKE_TAPS = 3
export const WAKE_WINDOW_MS = 1600

/**
 * One tap on the sleeping Chiron: { taps, at, awake }. Taps further apart than the window start
 * the count again, so a stray touch never wakes him; three quick ones do.
 */
export function tapWake(prev, now) {
  const taps = (prev && !prev.awake && now - prev.at <= WAKE_WINDOW_MS ? prev.taps : 0) + 1
  return { taps, at: now, awake: taps >= WAKE_TAPS }
}

/** A lift that works several joints and muscles at once (squat, bench, row), from the catalogue. */
export const isCompound = ex => Array.isArray(ex?.sm) && ex.sm.length >= 2 && !['stretching', 'cardio'].includes(ex?.cat)

const round15 = s => Math.max(15, Math.round(s / 15) * 15)

/**
 * How long to rest before the next set, in seconds, with the range it comes from and why:
 * { sec, low, high, why }, `why` one of 'strength', 'hypertrophy-compound', 'hypertrophy-isolation',
 * 'endurance', 'timed'.
 *
 * The ranges follow the evidence: heavy sets of 1 to 5 reps recover best with 3 to 5 min on a
 * compound lift (ACSM position stand on progression models, 2009; de Salles et al., Sports Med
 * 2009); for hypertrophy, longer rests (about 2 to 3 min) beat 1 min on multi-joint lifts
 * (Schoenfeld et al., J Strength Cond Res 2016), while past about 90 s the benefit is small
 * (Singer et al., Front Sports Act Living 2024), so isolation work sits at 1 to 2 min; light
 * sets of 15 or more reps, 30 to 90 s. A set taken to failure earns the long end. What they train
 * for moves the pick inside the range, never out of it.
 */
export function restAdvice({ mode = 'reps', reps = null, compound = true, styles = [], phase = null, failure = false } = {}) {
  if (mode === 'time' || mode === 'cardio') return { sec: 60, low: 45, high: 90, why: 'timed' }
  const strong = styles.includes('powerlifting') || styles.includes('strength') || phase === 'peak'
  const endurance = styles.includes('endurance') && !strong
  const r = Number(reps) > 0 ? Number(reps) : 10
  let band
  if (r <= 5) band = compound ? { low: 180, high: 300, sec: strong ? 270 : 240 } : { low: 120, high: 180, sec: 150 }
  else if (r >= 15 || (endurance && r >= 12)) band = { low: 30, high: 90, sec: endurance ? 45 : 60 }
  else band = compound ? { low: 120, high: 180, sec: strong ? 180 : 150 } : { low: 60, high: 120, sec: strong ? 105 : 90 }
  const why = r <= 5 ? 'strength' : band.high <= 90 ? 'endurance' : compound ? 'hypertrophy-compound' : 'hypertrophy-isolation'
  const sec = Math.min(band.high, band.sec + (failure ? 30 : 0))
  return { sec: round15(sec), low: band.low, high: band.high, why }
}

const isWarm = s => !!(s && (s.warm || s.wu || s.type === 'warmup' || s.t === 'w'))

/**
 * What Chiron says the moment he wakes, from the workout as it stands: the current exercise, the
 * next set still to do ({ w, r, sec } as planned, or null when the exercise is done), the rest
 * before it, and how many sets are left. `exOf(id)` finds the exercise in the catalogue,
 * `modeOf(ex)` says reps, time or cardio, `isWarmup(set)` spots a warm-up row. Null without a
 * workout in progress.
 */
export function quickTips(S, { exOf = () => null, modeOf = () => 'reps', isWarmup = isWarm, styles = [], phase = null } = {}) {
  const A = S?.active
  const e = A?.entries?.[A.cur]
  if (!e) return null
  const ex = exOf(e.id)
  const work = (e.sets || []).filter(s => !isWarmup(s))
  const next = work.find(s => !s.done) || null
  const last = [...work].reverse().find(s => s.done) || null
  const mode = modeOf(ex || { id: e.id })
  const rest = restAdvice({ mode, reps: next?.r ?? last?.r, compound: ex ? isCompound(ex) : true, styles, phase, failure: !!last?.f })
  return {
    id: e.id,
    mode,
    next: next ? { w: Number(next.w) || 0, r: next.r ?? null, sec: next.sec ?? null, min: next.min ?? null } : null,
    left: work.filter(s => !s.done).length,
    rest,
  }
}
