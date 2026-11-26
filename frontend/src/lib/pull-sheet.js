// Olympus: what letting go of the full-screen AI panel does after it was pulled down
// (views/CoachAI.jsx). The screen follows the finger; where it is let go decides:
//   stay    a short pull: it springs back
//   shrink  pulled about halfway: the small chat window (half height) takes its place
//   close   pulled all the way down: the AI panel goes away entirely
// `pull` is how far the screen has moved (px), `height` the height of the screen (px), `ms` how
// long the pull took. The bands are fractions of the screen height, so a tall phone and a small
// one behave the same.
//
// The bands: a pull of 15% of the screen (120 px on an 800 px phone, the fixed distance this used
// to be) is the least that counts as meant. "All the way down" starts at 70%: a finger that starts
// on the top bar and aims for the middle lets go near 50%, one that aims for the bottom near 85-95%,
// and 70% sits between the two. A quick flick (over 0.5 px/ms across more than 40 px) is read as
// one step down, to the small window, never as a close: closing should not happen by accident.
export const PULL_SHRINK = 0.15
export const PULL_CLOSE = 0.7
const FLICK_MIN_PX = 40
const FLICK_SPEED = 0.5

export function pullOutcome({ pull, height, ms }) {
  if (!(height > 0) || !(pull > 0)) return 'stay'
  const f = pull / height
  if (f >= PULL_CLOSE) return 'close'
  if (f >= PULL_SHRINK) return 'shrink'
  const fast = pull > FLICK_MIN_PX && pull / Math.max(1, ms) > FLICK_SPEED
  return fast ? 'shrink' : 'stay'
}

/** How opaque the screen is while pulled: fading as it goes, faint once a release would close it. */
export function pullOpacity(pull, height) {
  if (!(height > 0) || !(pull > 0)) return 1
  const f = pull / height
  if (f >= PULL_CLOSE) return 0.3
  return 1 - 0.4 * (f / PULL_CLOSE)
}
