// Olympus: the Profile page's "This week": which days you trained, how much, and the same
// figures for the week before, to compare. A week starts on the profile's first weekday.
import { startOfWeek, weekStartOf, isoOf } from './format.js'
import { workoutDay, workoutDuration, workoutVolume, setsDone } from './history.js'

const plus = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }

function totals(list) {
  return list.reduce((a, w) => ({
    count: a.count + 1,
    durMs: a.durMs + workoutDuration(w),
    vol: a.vol + (workoutVolume(w) || 0),
    sets: a.sets + setsDone(w),
  }), { count: 0, durMs: 0, vol: 0, sets: 0 })
}

/** { days: [{ iso, day, trained, today, future }], workouts, totals, before } for the week of `today`. */
export function weekSummary(S, today) {
  const start = startOfWeek(today, weekStartOf(S))
  const days = Array.from({ length: 7 }, (_, i) => isoOf(plus(start, i)))
  const prevStart = isoOf(plus(start, -7))
  const inWeek = new Set(days)
  const workouts = (S.workouts || []).filter(w => inWeek.has(workoutDay(w)))
    .sort((a, b) => (workoutDay(b) || '').localeCompare(workoutDay(a) || '') || (b.start || 0) - (a.start || 0))
  const prev = (S.workouts || []).filter(w => { const d = workoutDay(w); return d >= prevStart && d < days[0] })
  const trained = new Set(workouts.map(workoutDay))
  return {
    days: days.map(iso => ({ iso, day: new Date(iso + 'T12:00:00').getDay(), trained: trained.has(iso), today: iso === today, future: iso > today })),
    workouts,
    totals: totals(workouts),
    before: totals(prev),
  }
}
