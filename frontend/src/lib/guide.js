// Olympus: the guide — the welcome tour on a new profile and the one-time tips on each screen.
//
// Everything it remembers rides in S.hints (store/useStore.js), the synced map of one-time hints,
// so a tip read on the phone is not shown again on the laptop:
//   hints.guide    'new' | 'some' | 'off' — how much help this person wants (the welcome asks)
//   hints.welcomed true once the welcome was shown, answered or skipped
//   hints.tips     { <tip id>: true } — the tips already dismissed
//
// Two kinds of tip. A 'basic' tip explains the app itself (where Start is, what a routine is) and
// is for someone who said they are new. An 'analysis' tip explains a screen full of numbers
// (Stats, Structural balance), which reads as jargon to most people whatever their experience
// with apps, so it shows to everyone who has not switched tips off.

export const GUIDE_LEVELS = ['new', 'some', 'off']

/** Every tip, by id: which screen it belongs to and who it is for. */
export const TIPS = {
  feed: { kind: 'basic' },
  profile: { kind: 'basic' },
  workoutStart: { kind: 'basic' },
  plan: { kind: 'basic' },
  stats: { kind: 'analysis' },
  structural: { kind: 'analysis' },
}

const hintsOf = S => (S?.hints && typeof S.hints === 'object' ? S.hints : {})

// Whether the profile already holds training: someone who logged workouts or built routines
// before the guide existed knows their way around, and is not greeted as a newcomer.
export const hasTraining = S => (S?.workouts?.length || 0) > 0 || (S?.routines?.length || 0) > 0

/**
 * How much help this profile gets. The answer to the welcome when there is one; otherwise a
 * profile with training behind it gets only the analysis tips, and a blank one the full guide.
 */
export function guideLevelOf(S) {
  const level = hintsOf(S).guide
  if (GUIDE_LEVELS.includes(level)) return level
  return hasTraining(S) ? 'some' : 'new'
}

/** Whether the welcome tour should open: once per profile, and only on one with nothing in it yet. */
export function needsWelcome(S) {
  const h = hintsOf(S)
  return !h.welcomed && !GUIDE_LEVELS.includes(h.guide) && !hasTraining(S)
}

/** Whether tip `id` shows to this profile now. */
export function tipVisible(S, id) {
  const tip = TIPS[id]
  if (!tip) return false
  const h = hintsOf(S)
  if (h.tips && h.tips[id]) return false
  const level = guideLevelOf(S)
  if (level === 'off') return false
  if (tip.kind === 'analysis') return true
  // The basic tips follow the welcome: a profile that has not been greeted yet sees the welcome
  // first, not a tip on the screen behind it.
  return level === 'new' && !!(h.welcomed || GUIDE_LEVELS.includes(h.guide))
}

// The writers below return a new hints map and never touch the one they were given: the store
// stamps an edit by comparing the old state with the new one (lib/sync-merge.js stampEdits).

/** `hints` with tip `id` dismissed. */
export const withTipSeen = (hints, id) => ({ ...(hints || {}), tips: { ...(hints?.tips || {}), [id]: true } })

/** `hints` with the guide level set, which also counts as having been welcomed. */
export function withGuideLevel(hints, level) {
  if (!GUIDE_LEVELS.includes(level)) return { ...(hints || {}) }
  return { ...(hints || {}), guide: level, welcomed: true }
}

/** `hints` with the welcome marked as shown, the level left as it is. */
export const withWelcomed = hints => ({ ...(hints || {}), welcomed: true })

/** `hints` with every tip back on, for Settings → Show the tips again. */
export function withTipsReset(hints) {
  const next = { ...(hints || {}) }
  delete next.tips
  if (next.guide === 'off') next.guide = 'some'
  return next
}
