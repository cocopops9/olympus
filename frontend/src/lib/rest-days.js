// Rest days, as the calendar shows them. A rest day is a day that has ended with no
// workout logged on it. Days before the first workout are not rest days (the athlete was not
// training yet), and today is not one until it is over: a workout may still come.
import { todayISO, isoOf } from './format.js'
import { workoutDay } from './history.js'

/** The days with at least one workout, and the first of them (null with no workouts). */
export function trainingDays(S) {
  const days = new Set()
  let first = null
  for (const w of S.workouts || []) {
    const day = workoutDay(w)
    if (!day) continue
    days.add(day)
    if (first === null || day < first) first = day
  }
  return { days, first }
}

/** Whether `iso` is a rest day, given `trainingDays(S)`. ISO dates compare as strings. */
export function isRestDay(iso, { days, first }, today = todayISO()) {
  return first !== null && iso >= first && iso < today && !days.has(iso)
}

/** The rest days of one month (`month` 0-11), up to the day before today. */
export function restDaysInMonth(S, year, month, today = todayISO()) {
  const td = trainingDays(S)
  const daysIn = new Date(year, month + 1, 0).getDate()
  let n = 0
  // Noon keeps the date clear of daylight-saving shifts, as the rest of the app does.
  for (let d = 1; d <= daysIn; d++) if (isRestDay(isoOf(new Date(year, month, d, 12)), td, today)) n++
  return n
}
