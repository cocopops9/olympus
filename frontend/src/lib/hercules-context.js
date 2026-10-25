// Olympus: what Hercules knows about the person, written out as short plain text for the model
// (api/hercules.js puts it under its instructions). Only the training document's own data:
// the plan, the routines, recent workouts with their best sets, the week's muscle work, the
// best lifts, and the latest body weight (useful for nutrition, never a goal). Bounded, newest
// first, so the most useful part survives the server's cut at 9,000 characters.
import { EXIDX } from './exercises.js'
import { exerciseNameFor, t } from './i18n.js'
import { todayISO, isoOf } from './format.js'
import { effectiveRoutineIds, lastBW } from './history.js'
import { loadOfWorkouts, rankOf, MUSCLE_NAME } from './muscles.js'
import { summaryFor } from './auto-post.js'

export const MAX_CONTEXT = 9000
const DAY = 86400000
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const nameOf = id => (EXIDX[id] ? exerciseNameFor(EXIDX[id]) : id)
const dayMs = iso => new Date(iso + 'T12:00:00').getTime()

function plan(S, today) {
  const out = []
  for (let i = 0; i < 7; i++) {
    const iso = isoOf(new Date(dayMs(today) + i * DAY))
    const names = effectiveRoutineIds(S, iso, today).map(id => S.routines.find(r => r.id === id)?.name).filter(Boolean)
    out.push(`${WEEKDAY[new Date(iso + 'T12:00:00').getDay()]} ${iso}: ${names.length ? names.join(' + ') : 'rest'}`)
  }
  return out
}

function routines(S) {
  return S.routines.slice(0, 12).map(r => {
    const ex = (r.ex || []).slice(0, 12).map(e => {
      const sets = Number(e.sets) || 1
      const reps = e.reps ? `x${e.reps}` : ' sets'
      const load = Number(e.weight) > 0 ? ` at ${e.weight} ${S.unit}` : ''
      return `${nameOf(e.id)} ${sets}${reps}${load}`
    })
    return `- ${r.name}: ${ex.join('; ') || 'no exercises yet'}`
  })
}

function workouts(S, today) {
  const since = dayMs(today) - 42 * DAY
  return [...S.workouts].filter(w => w && w.d && dayMs(w.d) >= since)
    .sort((a, b) => (b.end || dayMs(b.d)) - (a.end || dayMs(a.d))).slice(0, 14)
    .map(w => {
      const s = summaryFor(w, S)
      const min = s.durMs ? Math.round(s.durMs / 60000) + ' min, ' : ''
      const ex = s.exercises.map(e => `${e.n} ${e.sets} sets, best ${e.best}`).join('; ')
      const note = w.note ? ` Note: "${String(w.note).slice(0, 160)}"` : ''
      return `- ${s.d} ${s.name || 'Workout'} (${min}${s.sets} work sets, volume ${s.vol} ${s.unit}${s.prs ? ', ' + s.prs + ' PRs' : ''}): ${ex}.${note}`
    })
}

function weekMuscles(S, today) {
  const since = dayMs(today) - 7 * DAY
  const recent = S.workouts.filter(w => w && w.d && dayMs(w.d) > since)
  if (!recent.length) return null
  const load = loadOfWorkouts(recent)
  const worked = rankOf(load).worked.filter(m => m !== 'cardiovascular system')
  return worked.slice(0, 14).map(m => `${MUSCLE_NAME[m]} ${Math.round(load[m] * 10) / 10}`).join(', ')
}

function bests(S) {
  return Object.entries(S.exWeights || {})
    .filter(([, v]) => v && v.w > 0)
    .sort((a, b) => String(b[1].d || '').localeCompare(String(a[1].d || '')))
    .slice(0, 10)
    .map(([id, v]) => `${nameOf(id)} ${v.w} ${S.unit}${v.d ? ' (' + v.d + ')' : ''}`)
}

/** The summary for the model. `today` as YYYY-MM-DD. */
export function herculesContext(S, today = todayISO()) {
  if (!S) return ''
  const lines = []
  const first = S.workouts.length ? S.workouts.map(w => w.d).filter(Boolean).sort()[0] : null
  // Sex only when it is female: male is the default an untouched profile also has, so it says nothing.
  lines.push(`Today: ${today}. Units: ${S.unit === 'lb' ? 'lb' : 'kg'}.${S.body === 'female' ? ' Sex: female.' : ''}`)
  lines.push(`Workouts logged: ${S.workouts.length}${first ? ' since ' + first : ''}.`)
  const wk = weekMuscles(S, today)
  if (wk) lines.push(`Muscle work in the last 7 days (weighted sets): ${wk}.`)
  const w = workouts(S, today)
  if (w.length) lines.push('Recent workouts (last 6 weeks, newest first):', ...w)
  if (S.routines.length) {
    let days = []
    try { days = plan(S, today) } catch { days = [] }
    lines.push(...(days.length ? ['Weekly plan, next 7 days:', ...days] : []), 'Routines:', ...routines(S))
  }
  const b = bests(S)
  if (b.length) lines.push('Heaviest weights lifted: ' + b.join('; ') + '.')
  const bw = lastBW(S)
  if (bw) lines.push(`Latest body weight: ${bw.w} ${S.unit} (${bw.d}).`)
  let out = lines.join('\n')
  if (out.length > MAX_CONTEXT) out = out.slice(0, MAX_CONTEXT)
  return out
}

/** The first things to ask, shown before the first message. */
export const SUGGESTIONS = () => [
  t('Plan my training for next week'),
  t('Why am I not getting stronger?'),
  t('What should I eat after training?'),
  t('Give me tips for a better squat'),
]
