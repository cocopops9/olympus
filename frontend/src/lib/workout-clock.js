// Olympus: the clock of the workout in progress. It can be paused (a phone call, a break between
// two halves of a session) and set by hand (started the clock late, or forgot to start it), so
// the duration saved is the time actually trained.
//
// On the running session (S.active):
//   start     when it started, ms (as always)
//   pausedAt  when the current pause began, ms; absent while running
//   pausedMs  time left out that is not a pause of this session: the gap before a saved workout
//             was picked up again (lib/session-edit.js resumeCompletedSession); absent when none
//
// Elapsed is (now, or the moment of the pause) − start − pausedMs. A pause that ends moves
// `start` later by its length: the clock keeps the trained time, and the workout ends at the
// phone's own time, so start, end and duration agree with the clock on the wall (a 30-minute pause
// in a 18:00 workout finished at 20:00 saves 18:30 to 20:00, not 18:00 to 19:30). Setting the time
// by hand moves `start` too, so the clock reads what was typed and keeps counting from there.

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

/** Starts the clock of `active` again: the start moves later by the length of the pause. */
export function resumeClock(active, now = Date.now()) {
  if (!active || !isPaused(active)) return
  const pause = Math.max(0, now - active.pausedAt)
  if (Number.isFinite(active.start)) active.start += pause
  delete active.pausedAt
}

/** Sets the trained time of `active` to `ms`, by moving its start; a pause stays a pause. */
export function setElapsed(active, ms, now = Date.now()) {
  if (!active || !(ms >= 0)) return
  const at = isPaused(active) ? active.pausedAt : now
  active.start = Math.round(at - (Number(active.pausedMs) || 0) - ms)
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
