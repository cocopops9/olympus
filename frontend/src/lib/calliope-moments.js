// Olympus: Calliope's moments. Instead of one long tour of everything, she explains a less common
// situation when it first happens to this person, in a small bubble that stays a few seconds and
// goes away by itself (components/CalliopeMoment.jsx). Someone who never meets the situation is
// never told about it.
//
// Why this shape (the evidence, and what it does not show):
//   - Product tours lose people with every step: in Chameleon's 2025 benchmark (over 550 million
//     in-app interactions, vendor data, not peer reviewed) 3-step tours were completed by 72%,
//     4-step tours by 74%, tours of 7 steps or more by 16%. So every screen tour here has at most
//     four bubbles (lib/calliope.js SCREEN_TOURS), and the welcome is the question plus Home's four.
//   - The same data: tours started by the person's own action were completed by 67%, tours started
//     after a fixed delay by 31%. A moment is started by what the person just did.
//   - Learning in segments, at the learner's pace, beats one continuous lesson: a meta-analysis of
//     56 studies (Rey et al. 2019, Educational Psychology Review 31:389-419) found small to medium
//     gains in retention and transfer, and lower cognitive load.
//   - On length in minutes no study measures an optimum for app onboarding. The closest measured
//     proxy, 6.9 million edX video sessions (Guo, Kim, Rubin 2014), found engagement falls after
//     about 6 minutes, and tutorials are watched for 2 to 3 minutes whatever their length. The
//     welcome here takes well under a minute, so it sits far inside that.
//
// What it remembers rides in S.hints with the rest of the guide (lib/guide.js):
//   hints.moments  { <moment id>: true } — the moments already shown, each shown once
import { t } from './i18n.js'
import { guideLevelOf } from './guide.js'
import { implausibleLoad } from './plausible-load.js'
import { modeOf } from './history.js'

const hintsOf = S => (S?.hints && typeof S.hints === 'object' ? S.hints : {})

/*
 * Every moment, in the order they are looked for (the first due one is shown when several apply).
 * `where` is the screen it belongs to ('workout': only while the workout screen is open, null:
 * anywhere); `text` what she says. The texts are functions, read in the app's language now.
 */
export const MOMENTS = {
  oddLoad: { where: 'workout', text: () => t('The ! in place of the tick means that weight is far above anything you have lifted on this exercise. An extra zero is easy to type. Tap ! to log it as it is, or correct it.') },
  deload: { where: 'workout', text: () => t('The weight went down on purpose. You missed your reps a few sessions in a row, so Olympus lowers it a little and lets you build back up. This is normal, and it works.') },
  toppedOut: { where: 'workout', text: () => t('You have reached your heaviest dumbbell, so the weight stays. Add heavier dumbbells in Settings, Equipment, and progression moves on.') },
  planChanged: { where: 'workout', text: () => t('This exercise starts from the routine’s own target, not from your last session: the plan changed, or the exercise is new to this routine. Progression picks up from here.') },
  superset: { where: 'workout', text: () => t('This is a superset: one set of each exercise in a row, then the rest. Olympus moves you from one to the next by itself.') },
  backfill: { where: 'workout', text: () => t('You are logging a past workout: there is no rest timer, and Mark all sets done ticks every set at once.') },
  firstRest: { where: 'workout', text: () => t('Rest time: the timer counts down and tells you when to go again. Meanwhile Chiron sleeps at the top: tap him three times to ask him anything.') },
  firstFinish: { where: null, text: () => t('Your first workout is saved. Find it in Profile, History. Next time Olympus suggests what to lift from what you did today.') },
}

export const MOMENT_IDS = Object.keys(MOMENTS)

/** Whether moment `id` may still be shown to this profile: not shown before, and help not switched off. */
export function momentDue(S, id) {
  if (!MOMENTS[id]) return false
  const h = hintsOf(S)
  if (h.moments && h.moments[id]) return false
  return guideLevelOf(S) !== 'off'
}

/** `hints` with moment `id` shown. A new map: the store compares the old state with the new one. */
export const withMomentSeen = (hints, id) => ({ ...(hints || {}), moments: { ...(hints?.moments || {}), [id]: true } })

/** `hints` with every moment to be shown again (Settings → Show the tips again, the welcome replayed). */
export function withMomentsReset(hints) {
  const next = { ...(hints || {}) }
  delete next.moments
  return next
}

// The reasons a progression line can give (lib/progression.js nextPrescription `why`), by its key.
const OUTGROWN = 'You’ve outgrown the rack: {0} {1} is your heaviest dumbbell, so the weight stays.'
const NEW_PLAN = ['Plan changed, so starting from your new target.', 'First time in this routine, so starting from its own target.']

// Each situation, by moment id: whether it is true now. `x` is { S, A, entries, resting }, with
// `entries` the exercises of a live workout while its screen is open (none otherwise).
const CHECKS = {
  oddLoad: x => x.entries.some(e => !isCardio(e) && implausibleLoad(x.S, e)),
  deload: x => x.entries.some(e => e?.plan?.kind === 'deload'),
  toppedOut: x => x.entries.some(e => whyOf(e) === OUTGROWN),
  planChanged: x => x.entries.some(e => NEW_PLAN.includes(whyOf(e))),
  superset: x => x.entries.some(e => e?.sg),
  backfill: x => x.entries.length > 0 && !!x.A.backfill,
  firstRest: x => x.entries.length > 0 && x.resting && !x.A.backfill,
  firstFinish: x => !x.A && (x.S?.workouts?.length || 0) === 1,
}

const whyOf = e => (Array.isArray(e?.plan?.why) ? e.plan.why[0] : '')
// Cardio and sports log distance and time, not a load (views/Workout.jsx gives them no warning).
const isCardio = e => modeOf({ ...(e?.target || {}), id: e?.id }) === 'cardio'

function contextOf(S, { screen = '', resting = false } = {}) {
  const A = S?.active || null
  const live = !!A && !A.editingWorkoutId
  return { S, A, resting, entries: live && screen === 'workout' ? (A.entries || []) : [] }
}

/**
 * The situations true now, in MOMENTS order. `screen` is the first part of the route open now
 * ('workout', 'home'…); `resting` whether a rest timer is counting down in a live workout.
 */
export function situationsOf(S, ctx) {
  const x = contextOf(S, ctx)
  return MOMENT_IDS.filter(id => CHECKS[id](x))
}

/**
 * The moment to show now: the first situation that is true and still due, or null. A moment
 * already shown is not even looked for (the weight check reads the exercise's whole history).
 */
export function momentFor(S, ctx) {
  const x = contextOf(S, ctx)
  return MOMENT_IDS.find(id => momentDue(S, id) && CHECKS[id](x)) || null
}

/*
 * How long a bubble stays: long enough to read it at a glance, mid-workout. Adults read
 * non-fiction silently at about 238 words a minute, 4 words a second (Brysbaert 2019, a
 * meta-analysis of 190 studies, Journal of Memory and Language 109:104047). A glance between sets
 * is slower than reading at a desk, so 3 words a second is assumed, plus 1.5 s to notice the
 * bubble; never under 5 s or over 14 s. Her voice, when on, keeps it open until she has finished
 * (components/CalliopeMoment.jsx), and a tap on it keeps it until closed.
 */
export const READ_WPS = 3
export const NOTICE_MS = 1500
export const MIN_MS = 5000
export const MAX_MS = 14000
export function momentMs(text) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean).length
  return Math.min(MAX_MS, Math.max(MIN_MS, Math.round(NOTICE_MS + (words / READ_WPS) * 1000)))
}
