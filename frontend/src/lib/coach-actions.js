// Olympus: the AI coaches as agents. Besides answering, a coach can propose changes to the app
// itself (a routine built for you, the weights of your next sets, your rest timer, the
// statistics you see, what you train for...). It writes them at the end of its reply as
//
//   ```olympus-action
//   {"type": "set_rest", "seconds": 120}
//   ```
//
// and the app shows each one as a card with Apply (components/CoachActions.jsx): nothing changes
// until the person taps it. The set of actions is closed and every value is checked here, so a
// model can only do what this file allows, within the limits of each action. The instructions
// the models read are in api/hercules.js (ACTIONS_HELP).
import { EXIDX, CATALOGUE, searchExercises, isCardio } from './exercises.js'
import { exerciseNameFor, t } from './i18n.js'
import { uid, exerciseNameText } from './format.js'
import { defaultConfig } from './history.js'
import { STATS_IDS, statsCard } from './stats-cards.js'
import { TRAINING_STYLES, PHASES, GOALS_MAX, coachProfileOf } from './coach-profile.js'
import { markSuggested } from './suggested.js'
import { isWarmupRow } from './workout-model.js'
import { DEFAULT_GLYPH } from './glyphs.js'

const BLOCK = /```olympus-action\s*([\s\S]*?)```/g
export const MAX_ACTIONS = 4
const num = (v, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : null }
const int = (v, lo, hi) => { const n = num(v, lo, hi); return n == null ? null : Math.round(n) }
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

/** The reply without its action blocks, and the actions it proposes, checked: { text, actions }. */
export function splitActions(reply) {
  const actions = []
  const text = String(reply || '').replace(BLOCK, (_, body) => {
    try {
      const v = JSON.parse(body.trim())
      for (const a of Array.isArray(v) ? v : [v]) { const ok = checkAction(a); if (ok && actions.length < MAX_ACTIONS) actions.push(ok) }
    } catch { /* a block that is not JSON is dropped */ }
    return ''
  }).replace(/\n{3,}/g, '\n\n').trim()
  return { text, actions }
}

/** An exercise of the catalogue (or of your own) from a name the model wrote, or null. */
export function findExercise(name, custom = []) {
  const q = str(name, 80)
  if (!q) return null
  const all = [...custom, ...CATALOGUE]
  const low = q.toLowerCase()
  const exact = all.find(e => e.n?.toLowerCase() === low || exerciseNameFor(e).toLowerCase() === low)
  if (exact) return exact
  // Of the matches, one whose name holds what was written, the shortest first: "cable fly" is
  // the cable fly, not the cable decline fly the search may rank first.
  const found = searchExercises(all, q).slice(0, 30)
  const holds = found.filter(e => e.n?.toLowerCase().includes(low)).sort((a, b) => a.n.length - b.n.length)
  return holds[0] || found[0] || null
}

const exerciseOf = (e, custom) => {
  const ex = findExercise(e?.name ?? e?.exercise, custom)
  if (!ex) return null
  return { id: ex.id, sets: int(e.sets, 1, 10) ?? 3, reps: int(e.reps, 1, 50) ?? 10, weight: num(e.weight, 0, 1000) ?? 0, ...(isCardio(ex) ? { min: int(e.minutes ?? e.min, 1, 180) ?? 20 } : {}) }
}

/** A proposed action made safe, or null when it is not one the app knows or its values are off. */
export function checkAction(a, custom = []) {
  if (!a || typeof a !== 'object') return null
  switch (a.type) {
    case 'create_routine': {
      const exercises = (Array.isArray(a.exercises) ? a.exercises : []).slice(0, 15).map(e => exerciseOf(e, custom)).filter(Boolean)
      const name = str(a.name, 40)
      return name && exercises.length ? { type: a.type, name, exercises } : null
    }
    case 'add_exercise': {
      const e = exerciseOf(a, custom)
      return e ? { type: a.type, ...e } : null
    }
    case 'set_next_sets': {
      const weight = num(a.weight, 0, 1000), reps = int(a.reps, 1, 50)
      return weight != null || reps != null ? { type: a.type, ...(weight != null ? { weight } : {}), ...(reps != null ? { reps } : {}) } : null
    }
    case 'set_rest': {
      const seconds = int(a.seconds, 15, 600)
      return seconds ? { type: a.type, seconds } : null
    }
    case 'set_stats_cards': {
      const cards = [...new Set((Array.isArray(a.cards) ? a.cards : []).filter(id => STATS_IDS.includes(id)))]
      return cards.length ? { type: a.type, cards } : null
    }
    case 'set_goals': {
      const styles = (Array.isArray(a.styles) ? a.styles : []).filter(id => TRAINING_STYLES.some(s => s.id === id))
      const phase = PHASES.some(p => p.id === a.phase) ? a.phase : undefined
      const goals = str(a.goals, GOALS_MAX)
      return styles.length || phase || goals ? { type: a.type, ...(styles.length ? { styles } : {}), ...(phase ? { phase } : {}), ...(goals ? { goals } : {}) } : null
    }
    default:
      return null
  }
}

const exName = id => (EXIDX[id] ? exerciseNameText(EXIDX[id]) : id)
const setsText = (e, unit) => (e.min ? t('{0} min', e.min) : `${e.sets} × ${e.reps}${e.weight ? ' · ' + e.weight + ' ' + unit : ''}`)

/** What an action does, in words, for its card: { title, lines, icon }. */
export function describeAction(a, S) {
  const unit = S?.unit === 'lb' ? 'lb' : 'kg'
  switch (a.type) {
    case 'create_routine': return { icon: 'clipboard', title: t('New routine: {0}', a.name), lines: a.exercises.map(e => exName(e.id) + ' · ' + setsText(e, unit)) }
    case 'add_exercise': return { icon: 'plusCircle', title: t('Add to this workout'), lines: [exName(a.id) + ' · ' + setsText(a, unit)] }
    case 'set_next_sets': return { icon: 'dumbbell', title: t('Your next sets'), lines: [[a.weight != null ? a.weight + ' ' + unit : null, a.reps != null ? t('{0} reps', a.reps) : null].filter(Boolean).join(' × ')] }
    case 'set_rest': return { icon: 'timer', title: t('Rest timer'), lines: [t('{0} s between sets', a.seconds)] }
    case 'set_stats_cards': return { icon: 'chart', title: t('Your statistics'), lines: [a.cards.map(id => statsCard(id).name()).join(', ')] }
    case 'set_goals': return {
      icon: 'target', title: t('What you train for'),
      lines: [...(a.styles || []).map(id => t(TRAINING_STYLES.find(s => s.id === id).label)), ...(a.phase ? [t(PHASES.find(p => p.id === a.phase).label)] : []), ...(a.goals ? ['"' + a.goals + '"'] : [])],
    }
    default: return { icon: 'sparkles', title: a.type, lines: [] }
  }
}

/**
 * Applies `a` to the training document `s` (inside a store update). Returns a short result for
 * the card, or throws an Error whose message says why it cannot be done now.
 */
export function applyAction(s, a) {
  switch (a.type) {
    case 'create_routine': {
      const r = { id: uid(), name: a.name, emoji: DEFAULT_GLYPH, ex: a.exercises.map(e => ({ id: e.id, ...defaultConfig(e.id), sets: e.sets, reps: e.reps, weight: e.weight, ...(e.min ? { min: e.min } : {}) })) }
      s.routines.push(r)
      return { routine: r.id }
    }
    case 'add_exercise': {
      const A = s.active
      if (!A || A.editingWorkoutId) throw new Error(t('Start a workout first.'))
      const target = { ...defaultConfig(a.id), sets: a.sets, reps: a.reps, weight: a.weight, ...(a.min ? { min: a.min } : {}) }
      const row = a.min ? { min: a.min, speed: target.speed || 8, done: false } : { w: a.weight, r: a.reps, done: false }
      A.entries.splice(A.cur + 1, 0, { id: a.id, target, plan: null, sets: markSuggested(Array.from({ length: a.sets }, () => ({ ...row }))) })
      A.cur = Math.min(A.cur + 1, A.entries.length - 1)
      return {}
    }
    case 'set_next_sets': {
      const e = s.active?.entries?.[s.active.cur]
      if (!e) throw new Error(t('Start a workout first.'))
      let n = 0
      for (const set of e.sets) {
        if (set.done || isWarmupRow(set) || set.sides) continue
        if (a.weight != null) set.w = a.weight
        if (a.reps != null) set.r = a.reps
        delete set.sug
        n++
      }
      if (!n) throw new Error(t('No sets left to change in this exercise.'))
      return {}
    }
    case 'set_rest': s.restSec = a.seconds; return {}
    case 'set_stats_cards': s.statsCards = [...a.cards]; return {}
    case 'set_goals': {
      const p = coachProfileOf(s)
      s.coachProfile = { styles: a.styles || p.styles, phase: a.phase || p.phase, goals: a.goals || p.goals }
      return {}
    }
    default: throw new Error('unknown action')
  }
}
