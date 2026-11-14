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
 * The tour: what she says, and what on the screen she points at while she says it. Each step is
 * one bubble of one to three sentences; the whole of it is under a minute, and every bubble has
 * a way out. `target` is a CSS selector of something on Home (the tour runs there); a step whose
 * target is not on screen is told without a spotlight. `demo` names a small drawing shown in the
 * bubble. The coach step is only for a profile that has the coaches.
 */
export function tourSteps({ coach = false } = {}) {
  return [
    { id: 'start', target: '#tabbar .start', text: t('The round button in the middle of the bar at the bottom starts a workout. Pick a routine, or start an empty workout and add exercises as you go.') },
    { id: 'log', demo: 'set', text: t('Type the weight and the reps, then tick the set when it is done. The rest timer starts by itself, and next time Olympus suggests what to lift.') },
    { id: 'home', target: '#tabbar > button:first-child', text: t('Home is your feed: your friends’ workouts next to yours. Follow people you know and train together, even from far away.') },
    { id: 'profile', target: '#tabbar > button:last-child', text: t('Profile has your week, your charts and your settings. Stats starts simple; switch to Detailed whenever you want every number.') },
    ...(coach ? [{ id: 'coach', target: '.hc-fab', text: t('The round face on the screen is your AI coach. Ask it about training, technique or food. Drag it aside if it is in the way.') }] : []),
    { id: 'me', target: '.cal-help', text: t('And I am always here. Tap my face at the top of Home whenever you are not sure how something works, and ask me.') },
    { id: 'go', last: true, text: t('That is all you need to begin. Start with a ready-made routine, or look around on your own.') },
  ]
}

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
