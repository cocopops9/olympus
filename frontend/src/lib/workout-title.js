// Olympus: the title a workout gets when nobody gave it one. A routine's session keeps the
// routine's name; an empty workout ("Freestyle") is named after what it trained, the biggest
// muscles first, with an emoji for each picked at random from a few that fit the muscle (a
// mountain for shoulders, a trident for the three-headed triceps, a peach for glutes):
// "Shoulders & Triceps" followed by its two emoji.
//
// The emoji are written as code-point escapes, so the source stays plain ASCII. The pick is
// seeded by the workout's id: the same workout always gets the same title.
import { t } from './i18n.js'
import { EXIDX } from './exercises.js'
import { loadOfWorkouts, rankOf, MUSCLE_NAME } from './muscles.js'
import { isStretch, isCardioEx } from './exercise-guide.js'

const CARDIO = 'cardiovascular system'

export const MUSCLE_EMOJI = {
  chest: ['\u{1F98D}', '\u{1F6E1}\u{FE0F}', '\u{1F3DB}\u{FE0F}'],      // gorilla, shield, temple
  deltoids: ['\u{1F3D4}\u{FE0F}', '\u{1FAA8}', '\u{1F965}'],           // mountain, boulder, coconut
  'upper-back': ['\u{1F985}', '\u{1FABD}', '\u{1F409}'],               // eagle, wing, dragon
  trapezius: ['\u{1F422}', '\u{1F9F1}'],                               // turtle, brick
  biceps: ['\u{1F4AA}', '\u{1F9BE}'],                                  // flexed biceps, mechanical arm
  triceps: ['\u{1F531}', '\u{1F40E}'],                                 // trident, horse
  forearm: ['\u{1F9BE}', '\u{1FAA2}'],                                 // mechanical arm, knot
  abs: ['\u{1F36B}', '\u{1F9C7}'],                                     // chocolate bar, waffle
  obliques: ['\u{1F32A}\u{FE0F}', '\u{1F300}'],                        // tornado, cyclone
  'lower-back': ['\u{1F3DB}\u{FE0F}', '\u{1F9F1}'],                    // pillar, brick
  serratus: ['\u{1F988}'],                                             // shark
  gluteal: ['\u{1F351}', '\u{1F680}'],                                 // peach, rocket
  quadriceps: ['\u{1F333}', '\u{1F98F}', '\u{1F9B5}'],                 // tree trunk, rhino, leg
  hamstring: ['\u{1F406}', '\u{1F3F9}'],                               // leopard, bow and arrow
  adductors: ['\u{1F438}', '\u{1F9B5}'],                               // frog, leg
  'hip-flexors': ['\u{1F938}', '\u{1F9B5}'],                           // cartwheel, leg
  calves: ['\u{1F402}', '\u{1F98C}'],                                  // ox, deer
  tibialis: ['\u{1F9B6}'],                                             // foot
}
const CARDIO_EMOJI = ['\u{1F525}', '\u{1FAC0}', '\u{1F3C3}']            // fire, heart, runner
const STRETCH_EMOJI = ['\u{1F9D8}', '\u{1F33F}']                       // lotus position, herb

// A small deterministic generator, seeded by a string.
function seeded(seed) {
  let h = 2166136261
  for (const c of String(seed || '')) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    return ((h ^= h >>> 16) >>> 0) / 4294967296
  }
}
const pick = (list, rnd) => list[Math.floor(rnd() * list.length) % list.length]

/** A name that is no title: empty, or the default an empty workout starts with. */
export function isUntitled(name) {
  const n = String(name || '').trim()
  return !n || n === 'Freestyle' || n === t('Freestyle') || n === 'Workout' || n === t('Workout')
}

const joinNames = names => (names.length < 2 ? names.join('')
  : names.slice(0, -1).join(', ') + ' & ' + names[names.length - 1])

/**
 * The title for logged workout `w`: the muscles it trained most (up to three, those with at
 * least half the load of the first), each with its emoji; "Cardio" or "Stretching" when that
 * is all it was. Null when nothing in it says what it trained.
 */
export function autoTitle(w) {
  const entries = (w?.entries || []).filter(e => EXIDX[e.id])
  const rnd = seeded(w?.id || w?.start || '')
  if (entries.length && entries.every(e => isStretch(EXIDX[e.id]))) return t('Stretching') + ' ' + pick(STRETCH_EMOJI, rnd)
  // Cardio and stretches say nothing about which muscles were trained: a run is not leg day.
  const cardio = entries.some(e => isCardioEx(EXIDX[e.id]))
  const lifting = { ...w, entries: (w?.entries || []).filter(e => !EXIDX[e.id] || !(isCardioEx(EXIDX[e.id]) || isStretch(EXIDX[e.id]))) }
  const load = loadOfWorkouts([lifting])
  const ranked = rankOf(load).worked.filter(m => m !== CARDIO && MUSCLE_EMOJI[m])
  if (!ranked.length) return cardio ? t('Cardio') + ' ' + pick(CARDIO_EMOJI, rnd) : null
  const top = load[ranked[0]]
  const chosen = ranked.filter(m => load[m] >= top * 0.5).slice(0, 3)
  const emoji = [...new Set(chosen.map(m => pick(MUSCLE_EMOJI[m], rnd)))]
  if (cardio && chosen.length < 3) emoji.push(pick(CARDIO_EMOJI, rnd))
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
