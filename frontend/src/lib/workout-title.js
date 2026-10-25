// Olympus: the title a workout gets when nobody gave it one. A routine's session keeps the
// routine's name; an empty workout ("Freestyle") is named after what it trained, the biggest
// muscles first, followed by the emoji for what that was. Never random: the same kind of
// training always gets the same emoji.
//   lifting for chest, shoulders or back    weightlifter
//   arms                                    flexed biceps
//   legs                                    leg
//   glutes                                  peach
//   abs and obliques                        chocolate bar (the six-pack)
//   cardio                                  by the activity: runner, cyclist, rower, swimmer,
//                                           walker, boxing glove; fire for jumps and intervals
//   stretching, yoga, mobility              lotus position
// "Chest & Triceps" is followed by the weightlifter and the biceps; a run after leg day adds the
// runner. The emoji are written as code-point escapes, so the source stays plain ASCII.
import { t } from './i18n.js'
import { EXIDX } from './exercises.js'
import { loadOfWorkouts, rankOf, MUSCLE_NAME } from './muscles.js'
import { isStretch, isCardioEx } from './exercise-guide.js'

const CARDIO_SYSTEM = 'cardiovascular system'

export const EMOJI = {
  lift: '\u{1F3CB}\u{FE0F}',
  arms: '\u{1F4AA}',
  legs: '\u{1F9B5}',
  glutes: '\u{1F351}',
  core: '\u{1F36B}',
  run: '\u{1F3C3}',
  bike: '\u{1F6B4}',
  row: '\u{1F6A3}',
  swim: '\u{1F3CA}',
  walk: '\u{1F6B6}',
  box: '\u{1F94A}',
  jump: '\u{1F525}',
  stretch: '\u{1F9D8}',
}

/** Which kind of training each drawn muscle stands for. */
export const MUSCLE_REGION = {
  chest: 'lift', deltoids: 'lift', 'upper-back': 'lift', trapezius: 'lift', 'lower-back': 'lift', serratus: 'lift',
  biceps: 'arms', triceps: 'arms', forearm: 'arms',
  quadriceps: 'legs', hamstring: 'legs', adductors: 'legs', calves: 'legs', tibialis: 'legs', 'hip-flexors': 'legs',
  gluteal: 'glutes',
  abs: 'core', obliques: 'core',
}

/** The activity a cardio exercise is, from its name and kind. */
export function cardioKind(e) {
  const n = String(e?.n || '').toLowerCase()
  if (e?.cat === 'combat' || /boxing|boxer|punch|\bjab\b|uppercut|sparr|kickbox|side kick|front kick|roundhouse/.test(n)) return 'box'
  if (/swim/.test(n)) return 'swim'
  if (/bike|bicycle|cycl|spin/.test(n)) return 'bike'
  if (/rowing|rower/.test(n)) return 'row'
  if (/walk|hike/.test(n)) return 'walk'
  if (/\brun\b|running|jog|treadmill|sprint/.test(n)) return 'run'
  if (/jump|burpee|skip|jack|climber|hiit|interval|plyo|hop|rope|battling/.test(n)) return 'jump'
  if (/stair|step|elliptical/.test(n)) return 'walk'
  // Drills, circuits and the rest of conditioning.
  return 'jump'
}

/** A name that is no title: empty, or the default an empty workout starts with. */
export function isUntitled(name) {
  const n = String(name || '').trim()
  return !n || n === 'Freestyle' || n === t('Freestyle') || n === 'Workout' || n === t('Workout')
}

const joinNames = names => (names.length < 2 ? names.join('')
  : names.slice(0, -1).join(', ') + ' & ' + names[names.length - 1])

/**
 * The title for logged workout `w`: the muscles it trained most (up to three, those with at
 * least half the load of the first) and the emoji of what that training was; "Cardio" or
 * "Stretching" with theirs when that is all it was. Null when nothing in it says what it trained.
 */
export function autoTitle(w) {
  const known = (w?.entries || []).filter(e => EXIDX[e.id])
  if (!known.length) return null
  const exOf = e => EXIDX[e.id]
  if (known.every(e => isStretch(exOf(e)))) return t('Stretching') + ' ' + EMOJI.stretch
  // Cardio and stretches say nothing about which muscles were trained: a run is not leg day.
  const cardio = [...new Set(known.filter(e => isCardioEx(exOf(e))).map(e => cardioKind(exOf(e))))]
  const lifting = { ...w, entries: (w.entries || []).filter(e => !EXIDX[e.id] || !(isCardioEx(exOf(e)) || isStretch(exOf(e)))) }
  const load = loadOfWorkouts([lifting])
  const ranked = rankOf(load).worked.filter(m => m !== CARDIO_SYSTEM && MUSCLE_REGION[m])
  const cardioEmoji = cardio.map(k => EMOJI[k])
  if (!ranked.length) return cardio.length ? t('Cardio') + ' ' + cardioEmoji.slice(0, 2).join('') : null
  const top = load[ranked[0]]
  const chosen = ranked.filter(m => load[m] >= top * 0.5).slice(0, 3)
  const emoji = [...new Set([...chosen.map(m => EMOJI[MUSCLE_REGION[m]]), ...cardioEmoji])].slice(0, 3)
  return joinNames(chosen.map(m => t(MUSCLE_NAME[m]))) + ' ' + emoji.join('')
}

/** `w` with its title filled in when it had none and one can be worked out. In place. */
export function titleWorkout(w) {
  if (w && isUntitled(w.name)) {
    const title = autoTitle(w)
    if (title) w.name = title
  }
  return w
}
