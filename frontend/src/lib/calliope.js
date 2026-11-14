// Olympus: Calliope, the guide. She welcomes a new profile and shows it around (the tour), is the
// face of the one-time tips (components/Guide.jsx), and answers "how do I…" about the app itself
// at any time (components/Calliope.jsx), in a speech bubble and aloud.
//
// The coaches answer about training; Calliope answers about the app. Her answers come from the
// server (api/hercules.js, the `calliope` persona and its manual of the app, APP_GUIDE).
//
// What she remembers rides in S.hints with the rest of the guide (lib/guide.js):
//   hints.calliopeMute  true when her voice is switched off (the bubble still shows what she says)
import { api } from './api.js'
import { getLang, t } from './i18n.js'

export const GUIDE = 'calliope'

/** Whether Calliope reads her lines aloud for this profile. On until switched off. */
export const voiceOn = S => !(S?.hints && S.hints.calliopeMute)

/** `hints` with her voice switched `on` or off. A new map: the store compares old with new. */
export function withVoice(hints, on) {
  const next = { ...(hints || {}) }
  if (on) delete next.calliopeMute; else next.calliopeMute = true
  return next
}

/*
 * The tours: Calliope shows each screen the first time it is opened, and only that screen, in a
 * few bubbles, each pointing at the real thing it is about. Nobody is told everything at once.
 *
 * A step: { id, target, text, need, scroll }. `target` is a CSS selector of what she points at
 * (a step without one is told without a spotlight); `need` leaves the step out when its target is
 * not on screen (a button that only some profiles have); `scroll` brings the target into view
 * first. A tour: { kind, ready, steps }. `kind` is who it is for ('basic': someone who said they
 * are new; 'analysis': a screen of numbers, for everyone who has not switched help off, as the
 * tips of lib/guide.js); `ready` is a selector that must be on screen before it starts (Stats
 * with nothing logged has nothing to show yet).
 */
export const SCREEN_TOURS = {
  home: {
    kind: 'basic',
    steps: () => [
      { id: 'start', target: '#tabbar .start', text: t('The round button in the middle of the bar at the bottom starts a workout. Pick a routine, or start an empty workout and add exercises as you go.') },
      { id: 'feed', target: '[data-tour="feed-tabs"]', need: true, text: t('Home is your feed: your friends’ workouts next to yours. Follow people you know and train together, even from far away.') },
      { id: 'profile', target: '#tabbar > button:last-child', text: t('Profile has your week, your charts and your settings. Stats starts simple; switch to Detailed whenever you want every number.') },
      { id: 'coach', target: '.hc-fab', need: true, text: t('The round face on the screen is your AI coach. Ask it about training, technique or food. Drag it aside if it is in the way.') },
      { id: 'me', target: '.cal-help', need: true, text: t('And I am always here. Tap my face at the top of Home whenever you are not sure how something works, and ask me.') },
    ],
  },
  workoutStart: {
    kind: 'basic',
    steps: () => [
      { id: 'empty', target: '.ws-empty', text: t('Tap Start routine on one of your routines, or Start empty workout and add exercises as you go. No routine yet? Explore routines has ready-made ones to copy.') },
      { id: 'routines', target: '.ws-tiles', text: t('A routine is a list of exercises you repeat, like “Push day”. Make your own, or pick a ready-made one.') },
      { id: 'card', target: '.rt-card', need: true, scroll: true, text: t('Your routines are here, today’s first. Start routine opens it, ready to log.') },
      { id: 'week', target: '[data-tour="ws-plan"]', need: true, text: t('The calendar puts your routines on the days of the week, so each day’s workout is waiting for you.') },
    ],
  },
  workout: {
    kind: 'basic',
    ready: '.setrow',
    steps: () => [
      { id: 'set', target: '.setrow', scroll: true, text: t('Type the weight and the reps, then tick the set when it is done. The rest timer starts by itself, and next time Olympus suggests what to lift.') },
      { id: 'unit', target: '.sethead .unit-hd', need: true, text: t('Tap the Weight title to switch between kg and lb.') },
      { id: 'kind', target: '.setrow .n', text: t('Tap a set’s number to mark it as a warm-up, a drop set or a set taken to failure.') },
      { id: 'menu', target: '.exhd .iconbtn:last-child', scroll: true, text: t('The dots open this exercise’s menu: swap it, see your history, learn how to do it, or change its rest timer.') },
      { id: 'add', target: '.wadd', need: true, scroll: true, text: t('Add exercise is below the last exercise.') },
      { id: 'chiron', target: '.whdr-chiron', need: true, scroll: true, text: t('Chiron is asleep up here: tap him three times to wake him, and ask him anything between sets, even by voice.') },
      { id: 'finish', target: '.whdr-finish', text: t('When you are done, Finish saves the workout.') },
    ],
  },
  plan: {
    kind: 'basic',
    steps: () => [
      { id: 'views', target: '.plan-views', text: t('Routines holds your workouts, each a list of exercises. Schedule puts them on weekdays: tap a day to choose what you train, and that day’s workout is ready when you open the app.') },
      { id: 'mode', target: '.plan-mode', need: true, text: t('Fixed week repeats the same routines on the same weekdays; Rotation goes through them in order, whatever the day.') },
    ],
  },
  profile: {
    kind: 'basic',
    steps: () => [
      { id: 'tabs', target: '.prof-tab', text: t('Overview is this week at a glance and Stats has your progress charts. Further down: your Plan, the exercise library and Settings.') },
      { id: 'medals', target: '[data-tour="medals"]', need: true, text: t('Your medals: records, streaks and goals reached.') },
      { id: 'settings', target: '[data-tour="settings"]', need: true, text: t('Settings: units, rest timer, language, reminders, and importing your history from other apps.') },
    ],
  },
  stats: {
    kind: 'analysis',
    ready: '.stats-mode',
    steps: () => [
      { id: 'mode', target: '.stats-mode', scroll: true, text: t('Simple shows the essentials in plain words. Switch to Detailed for every chart and number. Tap ⓘ next to a title to learn what a card shows.') },
      { id: 'chapters', target: '.stats-chap-tabs', need: true, text: t('The chapters group your statistics: tap one to see its cards.') },
      { id: 'pick', target: '[data-tour="stats-pick"]', need: true, text: t('Here you choose which statistics to keep on the page.') },
    ],
  },
  library: {
    kind: 'basic',
    ready: '.eg-map',
    steps: () => [
      { id: 'map', target: '.eg-map', text: t('Tap a muscle to see the exercises that train it, the best-known first.') },
      { id: 'groups', target: '.eg-tiles', need: true, scroll: true, text: t('Or pick a group: full body, cardio, stretching and more.') },
      { id: 'search', target: '.eg-search', need: true, scroll: true, text: t('Search by name finds any exercise, with filters for equipment.') },
    ],
  },
}

const onScreen = sel => typeof document !== 'undefined' && !!document.querySelector(sel)

/**
 * The steps of screen `id` as they apply now: those whose target must be there and is not are
 * left out. An empty list for a screen with no tour, or one that is not ready yet.
 */
export function tourFor(id, { has = onScreen } = {}) {
  const tour = SCREEN_TOURS[id]
  if (!tour || (tour.ready && !has(tour.ready))) return []
  return tour.steps().filter(s => !s.need || !s.target || has(s.target))
}

/** What she says to a newcomer, before showing the first screen: how she will help from now on. */
export const introStep = () => ({ id: 'intro', text: t('From now on, the first time you open each part of the app, I’ll show you how it works. Let’s start here.') })

/** What she says to someone who knows apps like this: only where she is. */
export const whereStep = () => ({ id: 'where', target: '.cal-help', text: t('And I am always here. Tap my face at the top of Home whenever you are not sure how something works, and ask me.') })

/** What she says first, before the question of how much help the person wants. */
export const greeting = () => t('Welcome to Olympus! I am Calliope, your guide. One question first: how much help would you like?')

// Screens she can send the person to, and their routes (api/hercules.js GUIDE_SCREENS).
const ROUTES = {
  home: '/home', workout: '/workout', plan: '/plan', library: '/library', stats: '/stats', history: '/history',
  medals: '/medals', profile: '/profile', body: '/body', settings: '/settings', 'settings/units': '/settings/units',
  'settings/workout': '/settings/workout', 'settings/data': '/settings/data', 'settings/about': '/settings/about', ai: '/ai',
}

/**
 * One of her answers, as the bubble shows it: { text, go }. The model may end with a line
 * "GO: <screen>"; it is taken off the text, and `go` is that screen's route when it is one of
 * hers, null otherwise. Markdown marks are taken out: the answer is read aloud.
 */
export function parseReply(reply) {
  let text = String(reply || '').trim()
  let go = null
  const m = text.match(/(?:^|\n)\s*GO:\s*([a-z/]+)\s*\.?\s*$/i)
  if (m) {
    text = text.slice(0, m.index).trim()
    go = ROUTES[m[1].toLowerCase()] || null
  }
  text = text.replace(/```[\s\S]*?```/g, '').replace(/[*_#`]+/g, '').replace(/\n{3,}/g, '\n\n').trim()
  return { text, go }
}

// The screens by the first part of their route, as she is told where the person is.
const SCREEN_NAMES = {
  home: 'Home (the feed)', workout: 'Workout', plan: 'Plan', library: 'Exercises (the library)', stats: 'Stats', history: 'History',
  medals: 'Medals', profile: 'Profile', body: 'Body & wellbeing', settings: 'Settings', ai: 'the AI coaches, full screen', today: 'Today’s training',
}

/** A few lines about where the person is and how far they have come, sent with each question. */
export function guideContext(S, path = '') {
  const first = String(path || '').split('/').filter(Boolean)[0] || 'home'
  const lines = []
  if (SCREEN_NAMES[first]) lines.push('Screen open now: ' + SCREEN_NAMES[first] + '.')
  if (S?.active) lines.push('A workout is in progress.')
  const workouts = S?.workouts?.length || 0
  const routines = S?.routines?.length || 0
  lines.push(workouts ? `Workouts logged: ${workouts}.` : 'No workout logged yet.')
  lines.push(routines ? `Routines: ${routines}.` : 'No routine yet.')
  if (S?.unit) lines.push('Weight unit: ' + S.unit + '.')
  return lines.join(' ')
}

/** Questions offered as chips before the person has asked anything. */
export const starterQuestions = () => [
  t('How do I create a routine?'),
  t('How do I log a set?'),
  t('How do I add friends?'),
  t('What can the AI coaches do?'),
]

const ANSWER_MS = 45000

/** Asks her: `messages` is the conversation, ending with the question. Resolves with { text, go, left }. */
export async function askCalliope(messages, { S, path } = {}) {
  const r = await api('/api/' + GUIDE, {
    method: 'POST',
    timeout: ANSWER_MS,
    body: JSON.stringify({ messages: messages.map(m => ({ role: m.role, content: m.content })), lang: getLang(), context: guideContext(S, path) }),
  })
  return { ...parseReply(r?.reply), left: r?.left }
}

/** Why she could not answer, in words for her bubble. */
export function askErrorText(e) {
  if (e?.data?.code === 'hercules-limit') return t('I have answered all I can for today. Ask me again tomorrow.')
  if (e?.status === 401 || e?.status === 404 || e?.status === 503) return t('I cannot answer questions on this server yet. The tour and the tips still work.')
  return t('I could not answer just now. Check the connection and ask me again.')
}
