// Olympus: the app guide (Settings → App guide, components/AppGuide.jsx). Every feature of the app,
// one topic at a time, each in a few short steps with a picture or a small demo to try, and a way
// to see the real thing: "Show me" opens the screen and Calliope points at its buttons there.
//
// Calliope answers a question; the guide is for someone who wants to look around by themselves,
// at their own pace. Both are told in the words the screens use (api/hercules.js APP_GUIDE is
// the same app in Calliope's manual: when a screen changes, both change with it).
//
// What it remembers rides in S.hints with the rest of the guide (lib/guide.js):
//   hints.guideRead  { <topic id>: true } — the topics read to their last step
import { t } from './i18n.js'

/*
 * A topic: { id, icon, tint, title, summary, steps, route, tour, ask }.
 *   steps  the steps, in order: { text, demo, art }. `demo` names a small thing to try
 *          (components/AppGuide.jsx DEMOS); `art` an icon or a portrait drawn above the text
 *   route  the screen "Show me" opens
 *   tour   the screen tour Calliope gives there (lib/calliope.js SCREEN_TOURS), if it has one
 *   ask    the question "Ask Calliope" puts to her for this topic
 * The texts are functions so they are read in the language the app is in when the guide opens.
 */
export const TOPICS = [
  {
    id: 'basics', icon: 'house', tint: 'var(--acc)', route: '/home', tour: 'home',
    title: () => t('Getting around'),
    summary: () => t('The three buttons at the bottom take you everywhere.'),
    steps: () => [
      { demo: 'tabbar', text: t('The bar at the bottom has three buttons. Tap each one here to see what it opens.') },
      { art: 'magnifier', text: t('Home is your feed. Workout, the round button in the middle, starts or resumes a workout. Profile holds everything about your own training.') },
      { art: 'gear', text: t('Settings is the gear at the top right of your Profile: units, language, rest timer, reminders and more.') },
    ],
    ask: () => t('How do I find my way around the app?'),
  },
  {
    id: 'start', icon: 'play', tint: 'var(--green)', route: '/workout', tour: 'workoutStart',
    title: () => t('Start a workout'),
    summary: () => t('With a routine, or from an empty workout.'),
    steps: () => [
      { art: 'play', text: t('Tap the round Workout button. Today’s planned routine is the first card: Start routine opens it, ready to log.') },
      { art: 'plusCircle', text: t('No routine? Start empty workout and add exercises as you go.') },
      { art: 'sparkles', text: t('Explore routines has ready-made routines and whole weeks to copy. Or write your plan as text and the coaches turn it into routines.') },
    ],
    ask: () => t('How do I start my first workout?'),
  },
  {
    id: 'log', icon: 'check', tint: 'var(--green)', route: '/workout', tour: null,
    title: () => t('Log your sets'),
    summary: () => t('Weight, reps, a tick: try it right here.'),
    steps: () => [
      { demo: 'setrow', text: t('Each set is a row. Type the weight and the reps, then tap the tick: the rest timer starts by itself. Try it.') },
      { demo: 'setkind', text: t('Tap a set’s number to mark it as a warm-up, taken to failure, or to add a drop set. Try it.') },
      { demo: 'unit', text: t('Tap the Weight title to switch between kg and lb.') },
      { art: 'more', text: t('The three dots of an exercise open its menu: swap it, see your history, learn how to do it, change its rest timer. Finish saves the workout.') },
    ],
    ask: () => t('How do I log a set during a workout?'),
  },
  {
    id: 'plan', icon: 'calendar', tint: 'var(--orange)', route: '/plan', tour: 'plan',
    title: () => t('Routines and your week'),
    summary: () => t('Plan what you train, and when.'),
    steps: () => [
      { art: 'clipboard', text: t('A routine is a list of exercises you repeat, like “Push day”. Find them in Profile, Plan: New routine makes one, Load starter plan gives you a ready one.') },
      { demo: 'schedule', text: t('Schedule puts your routines on the week. Switch between the two ways to see the difference.') },
      { art: 'calendar', text: t('Tap a day to choose what you train. That day’s workout is waiting for you when you open the app.') },
    ],
    ask: () => t('How do I make a routine and plan my week?'),
  },
  {
    id: 'library', icon: 'dumbbell', tint: 'var(--indigo)', route: '/library', tour: 'library',
    title: () => t('Exercises'),
    summary: () => t('More than a thousand, with how to do each one.'),
    steps: () => [
      { art: 'figureStrength', text: t('Profile, Exercises is the library. Tap a muscle on the body to see the exercises that train it.') },
      { art: 'video', text: t('Each exercise has an animation, how to do it step by step, and your own history on it.') },
      { art: 'magnifier', text: t('Search by name, filter by equipment, or add an exercise of your own.') },
    ],
    ask: () => t('How do I find an exercise and learn how to do it?'),
  },
  {
    id: 'stats', icon: 'chart', tint: 'var(--blue)', route: '/stats', tour: 'stats',
    title: () => t('Your progress'),
    summary: () => t('Charts and levels, in plain words first.'),
    steps: () => [
      { demo: 'stats', text: t('Stats starts Simple: the highlights in plain words. Detailed shows every chart and number. Try the switch.') },
      { art: 'trophy', text: t('Levels compare each lift with people of your sex, age and body weight, from Beginner to Elite.') },
      { art: 'history', text: t('History has every past workout: tap one to see it or edit it.') },
    ],
    ask: () => t('Where do I see my progress?'),
  },
  {
    id: 'medals', icon: 'medal', tint: 'var(--yellow)', route: '/medals', tour: null,
    title: () => t('Medals and records'),
    summary: () => t('Earned for records, streaks and goals.'),
    steps: () => [
      { art: 'medal', text: t('Beat a record and the app tells you during the workout. Medals go from bronze to Olympian.') },
      { art: 'flame', text: t('Training regularly earns streak medals, and reaching a goal earns its own.') },
      { art: 'trophy', text: t('Your medals are the medal icon at the top right of your Profile.') },
    ],
    ask: () => t('How do medals work?'),
  },
  {
    id: 'body', icon: 'scale', tint: 'var(--teal)', route: '/body', tour: null,
    title: () => t('Body and wellbeing'),
    summary: () => t('Weight, measurements, photos and how you feel.'),
    steps: () => [
      { art: 'scale', text: t('Profile, Body & wellbeing keeps your body weight, measurements and progress photos.') },
      { art: 'camera', text: t('Progress photos can be compared side by side, to see the change over months.') },
      { art: 'smile', text: t('Tell the app how you feel: sleep, energy, soreness. The coaches take it into account.') },
    ],
    ask: () => t('How do I track my body weight and measurements?'),
  },
  {
    id: 'coaches', icon: 'sparkles', tint: 'var(--acc)', route: '/ai', tour: null,
    title: () => t('Your AI coaches'),
    summary: () => t('Hercules, Athena and Chiron, free.'),
    steps: () => [
      { art: 'coaches', text: t('The round face floating on the screen opens Hercules, the motivator, and Athena, the strategist. Ask about training, technique, food or recovery.') },
      { art: 'checkCircle', text: t('They know your workouts and can build a routine or set your next weights. Nothing changes until you confirm it with a tap.') },
      { art: 'mic', text: t('Tap the microphone to talk instead of typing. Hold the face and drag it to move it out of the way.') },
      { art: 'chiron', text: t('During a workout Chiron, the centaur, sleeps at the top. Tap him three times to wake him and ask him anything between sets.') },
    ],
    ask: () => t('How do I talk to the AI coaches?'),
  },
  {
    id: 'social', icon: 'personPlus', tint: 'var(--pink)', route: '/home', tour: 'home',
    title: () => t('Friends and the feed'),
    summary: () => t('Train together, even from far away.'),
    steps: () => [
      { art: 'magnifier', text: t('On Home, the magnifier finds people: type a name and tap Follow. Following shows your friends, Discover everyone.') },
      { art: 'share', text: t('A finished workout is shared to the feed by itself. You can switch this off.') },
      { art: 'message', text: t('The speech bubble opens Messages: words, photos and voice messages. Invite friends is in your Profile.') },
    ],
    ask: () => t('How do I add friends and share my workouts?'),
  },
  {
    id: 'data', icon: 'folder', tint: 'var(--blue)', route: '/settings/data', tour: null,
    title: () => t('Your data'),
    summary: () => t('Bring your history, keep a backup.'),
    steps: () => [
      { art: 'download', text: t('Settings, Data & backup imports your history from Hevy and other apps, so you do not start from zero.') },
      { art: 'share', text: t('Export a backup whenever you want: your data is yours.') },
      { art: 'ruler', text: t('Settings, Units & language switches kg or lb and the language of the app.') },
    ],
    ask: () => t('How do I import my workouts from another app?'),
  },
  {
    id: 'calliope', icon: 'chat', tint: 'var(--acc)', route: null, tour: null,
    title: () => t('Ask Calliope'),
    summary: () => t('Your guide, whenever you are stuck.'),
    steps: () => [
      { art: 'calliope', text: t('I am Calliope. The first time you open each screen, I show it in a few bubbles. When something less common happens, like a weight that looks like a typo, I appear for a few seconds to explain it.') },
      { art: 'lightbulb', text: t('Each explanation comes once. Tap it to keep it on screen, or close it. Settings, About & updates turns the tips off or shows them all again.') },
      { art: 'mic', text: t('Say “{0}” into any microphone of the app and ask your question. I answer aloud and can take you to the right screen.', t('Calliope')) },
      { art: 'chat', text: t('You also find me in Settings, About & updates, Ask Calliope.') },
    ],
    ask: () => '',
  },
]

export const TOPIC_IDS = TOPICS.map(x => x.id)

export const topicById = id => TOPICS.find(x => x.id === id) || null

const hintsOf = S => (S?.hints && typeof S.hints === 'object' ? S.hints : {})

/** Whether topic `id` was read to its last step on this profile. */
export const topicRead = (S, id) => !!hintsOf(S).guideRead?.[id]

/** How much of the guide this profile has read: { done, total }. Unknown ids are not counted. */
export function guideProgress(S) {
  const read = hintsOf(S).guideRead || {}
  return { done: TOPIC_IDS.filter(id => read[id]).length, total: TOPIC_IDS.length }
}

/**
 * `hints` with topic `id` read. A new map, the one given untouched: the store stamps an edit by
 * comparing the old state with the new one (lib/sync-merge.js stampEdits).
 */
export function withTopicRead(hints, id) {
  if (!TOPIC_IDS.includes(id)) return { ...(hints || {}) }
  return { ...(hints || {}), guideRead: { ...(hints?.guideRead || {}), [id]: true } }
}

/** `hints` with the guide unread again. */
export function withGuideUnread(hints) {
  const next = { ...(hints || {}) }
  delete next.guideRead
  return next
}

// Lower case, accents and other marks dropped, so "esercizi" finds "Esercizi" and "théme" "theme".
const fold = s => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/**
 * The topics matching `query`, in the guide's own order: every word has to appear in the topic's
 * title, summary or steps, as the app shows them now. An empty query is every topic.
 */
export function searchTopics(query) {
  const words = fold(query).trim().split(/\s+/).filter(Boolean)
  if (!words.length) return TOPICS
  return TOPICS.filter(x => {
    const hay = fold([x.title(), x.summary(), ...x.steps().map(s => s.text)].join(' '))
    return words.every(w => hay.includes(w))
  })
}

/** The topic to suggest next: the first one not read yet, or null once all are. */
export function nextTopic(S) {
  return TOPICS.find(x => !topicRead(S, x.id)) || null
}
