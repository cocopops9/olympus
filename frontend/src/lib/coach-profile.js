// Olympus: what you train for, told once to the AI coaches (components/CoachGoals.jsx) so every
// answer starts from it: how you train (powerlifting, bodybuilding…), the phase you are in, and
// your goals and what is coming up in your own words ("I'm bulking and want progressive
// overload", "functional legs, but I play football in 3 days"). Kept in the training document
// (S.coachProfile), so it follows the profile; it goes to the model at the top of the summary
// (lib/hercules-context.js), with the workout in progress when there is one.
import { EXIDX } from './exercises.js'
import { exerciseNameFor } from './i18n.js'
import { elapsedOf, isPaused } from './workout-clock.js'
import { hasCompletedWork, isWarmupRow } from './workout-model.js'

/** How you train. Labels are English source strings, `ctx` is what the model reads. */
export const TRAINING_STYLES = [
  { id: 'bodybuilding', label: 'Bodybuilding', icon: 'arm', ctx: 'bodybuilding (muscle size and shape)' },
  { id: 'powerlifting', label: 'Powerlifting', icon: 'barbell', ctx: 'powerlifting (squat, bench, deadlift strength)' },
  { id: 'strength', label: 'General strength', icon: 'dumbbell', ctx: 'general strength training' },
  { id: 'functional', label: 'Functional', icon: 'kettlebell', ctx: 'functional training (movement, athleticism)' },
  { id: 'calisthenics', label: 'Calisthenics', icon: 'pullup', ctx: 'calisthenics (bodyweight skills)' },
  { id: 'sport', label: 'For a sport', icon: 'figureRun', ctx: 'training to support a sport' },
  { id: 'endurance', label: 'Endurance', icon: 'bike', ctx: 'endurance (cardio fitness)' },
  { id: 'health', label: 'Health and fitness', icon: 'heart', ctx: 'general health and fitness' },
]
/** The phase you are in; optional. */
export const PHASES = [
  { id: 'build', label: 'Building muscle', ctx: 'building muscle, eating in a surplus (bulk)' },
  { id: 'cut', label: 'Losing fat', ctx: 'losing fat while keeping muscle (cut)' },
  { id: 'maintain', label: 'Maintaining', ctx: 'maintaining' },
  { id: 'peak', label: 'Peaking for an event', ctx: 'peaking for a competition or test' },
  { id: 'recover', label: 'Coming back', ctx: 'coming back after a break or an injury, easing in' },
]
export const GOALS_MAX = 500

const isMap = v => !!v && typeof v === 'object' && !Array.isArray(v)

/** The stored profile read back: { styles: [...ids], phase, goals }, junk left out. */
export function coachProfileOf(S) {
  const p = isMap(S?.coachProfile) ? S.coachProfile : {}
  const styles = (Array.isArray(p.styles) ? p.styles : []).filter(id => TRAINING_STYLES.some(s => s.id === id))
  const phase = PHASES.some(x => x.id === p.phase) ? p.phase : null
  const goals = typeof p.goals === 'string' ? p.goals.trim().slice(0, GOALS_MAX) : ''
  return { styles: [...new Set(styles)], phase, goals }
}

export const hasCoachProfile = S => { const p = coachProfileOf(S); return !!(p.styles.length || p.phase || p.goals) }

/** The lines for the model about what they train for, or [] when nothing was said. */
export function profileLines(S) {
  const p = coachProfileOf(S)
  const out = []
  if (p.styles.length) out.push('How they train: ' + p.styles.map(id => TRAINING_STYLES.find(s => s.id === id).ctx).join('; ') + '.')
  if (p.phase) out.push('Current phase: ' + PHASES.find(x => x.id === p.phase).ctx + '.')
  if (p.goals) out.push(`Their goals and what is coming up, in their words: "${p.goals}"`)
  if (out.length) out.unshift('WHAT THEY TRAIN FOR (shape every answer around this):')
  return out
}

const nameOf = e => (EXIDX[e.id] ? exerciseNameFor(EXIDX[e.id]) : (e.n || e.id))
const setText = (s, unit) => {
  if (s.min) return `${s.min} min${s.speed ? ' at ' + s.speed + ' km/h' : ''}`
  if (s.sec) return `${s.sec} s${s.w ? ' with ' + s.w + ' ' + unit : ''}`
  return `${Number(s.w) || 0} ${unit} x ${s.r ?? '?'}${s.effort != null ? ' (effort ' + s.effort + ')' : ''}`
}

/**
 * The workout in progress, for the model: what it is, how long it has run, every exercise with
 * the sets done and still to do, and which one they are on. [] without one, and for a past
 * workout being logged or edited (no one is training right now).
 */
export function liveWorkoutLines(S, now = Date.now()) {
  const A = S?.active
  if (!A || A.backfill || A.editingWorkoutId) return []
  const unit = S.unit === 'lb' ? 'lb' : 'kg'
  const min = Math.round(elapsedOf(A, now) / 60000)
  const out = [
    'WORKOUT IN PROGRESS RIGHT NOW: they are at the gym, between sets. Coach them live: short, practical answers about the next set, the weight, the rest, a swap or how to adjust today, based on what they have done so far and on their recent sessions.',
    `"${A.name || 'Workout'}", ${min} min in${isPaused(A) ? ' (clock paused)' : ''}${A.bw ? ', body weight ' + A.bw + ' ' + unit : ''}.`,
  ]
  ;(A.entries || []).slice(0, 16).forEach((e, i) => {
    const sets = (e.sets || []).filter(s => s && !isWarmupRow(s))
    const done = sets.filter(hasCompletedWork).map(s => setText(s, unit))
    const todo = sets.filter(s => !hasCompletedWork(s)).map(s => setText(s, unit))
    const here = i === A.cur ? ' <- current exercise' : ''
    out.push(`- ${nameOf(e)}${here}: done ${done.length ? done.join(', ') : 'nothing yet'}${todo.length ? '; still planned ' + todo.join(', ') : ''}.`)
  })
  if (A.note) out.push(`Session note: "${String(A.note).slice(0, 200)}"`)
  return out
}
