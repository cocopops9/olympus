// Olympus: the clock of the workout in progress. It can be paused (a phone call, a break between
// two halves of a session) and set by hand (started the clock late, or forgot to start it), so
// the duration saved is the time actually trained.
//
// On the running session (S.active):
//   start     when it started, ms: the wall-clock time the workout began. A pause never moves it,
//             because pausing the workout does not stop the time of day (2026-11-24).
//   pausedAt  when the current pause began, ms; absent while running
//   pausedMs  time left out of the clock: every pause that has ended, plus the gap before a saved
//             workout was picked up again (lib/session-edit.js resumeCompletedSession); absent
//             when none
//
// Elapsed is (now, or the moment of the pause) − start − pausedMs. A workout saved from the
// session keeps its real start and is given end = start + time trained (trainedEnd), so
// end − start, which every reader of history takes as the duration, is the time trained: a
// 30-minute pause in an 18:00 workout finished at 20:00 saves start 18:00 and 90 minutes.

/** The session's trained time at `now`, in ms. */
export function elapsedOf(active, now = Date.now()) {
  if (!active || !Number.isFinite(active.start)) return 0
  const at = Number.isFinite(active.pausedAt) ? active.pausedAt : now
  return Math.max(0, at - active.start - (Number(active.pausedMs) || 0))
}

export const isPaused = active => Number.isFinite(active?.pausedAt)

/** Pauses the clock of `active` (inside a store update); nothing if it already is. */
export function pauseClock(active, now = Date.now()) {
  if (!active || isPaused(active)) return
  active.pausedAt = now
}

/** Starts the clock of `active` again: the pause is added to the time left out; the start stays. */
export function resumeClock(active, now = Date.now()) {
  if (!active || !isPaused(active)) return
  const pause = Math.max(0, now - active.pausedAt)
  if (pause > 0) active.pausedMs = (Number(active.pausedMs) || 0) + pause
  delete active.pausedAt
}

/**
 * Sets the trained time of `active` to `ms`; a pause stays a pause. The start stays where it is
 * and the time left out takes up the difference. Only a time longer than the whole span since the
 * start moves the start earlier, since the workout must then have begun before it says.
 */
export function setElapsed(active, ms, now = Date.now()) {
  if (!active || !(ms >= 0)) return
  const at = isPaused(active) ? active.pausedAt : now
  const left = Math.round(at - active.start - ms)
  if (Number.isFinite(active.start) && left >= 0) {
    if (left > 0) active.pausedMs = left; else delete active.pausedMs
  } else {
    active.start = Math.round(at - ms)
    delete active.pausedMs
  }
}

/**
 * Sets when `active` started to `at`, keeping what was typed. The time left out can never exceed
 * the span from the new start to now (or to the pause still on), so it shrinks to fit.
 */
export function setStart(active, at, now = Date.now()) {
  if (!active || !Number.isFinite(at)) return
  active.start = at
  const span = Math.max(0, (isPaused(active) ? active.pausedAt : now) - at)
  const left = Math.min(Number(active.pausedMs) || 0, span)
  if (left > 0) active.pausedMs = left; else delete active.pausedMs
}

/**
 * Where the saved workout ends, given the end the session would otherwise have (`end`, from
 * lib/finish-workout.js sessionEnd): no later than the pause still on (finished while paused, it
 * ended when the pause began), and earlier by any time left out in pausedMs, so end − start is the
 * time trained. Never before the start.
 */
export function trainedEnd(active, end) {
  if (!active) return end
  let e = end
  if (isPaused(active)) e = Math.min(e, active.pausedAt)
  e -= Number(active.pausedMs) || 0
  return Math.max(active.start, e)
}

/** "12:34", or "1:02:03" past an hour. */
export function fmtClock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`
}
