// The order of the exercise picker's list (swap and add), the way a person scans it: what you
// do most, then what everybody knows, then the rest.
//
//   1. yours: exercises you have logged or planned (most often first), then favourites you have
//      not used yet, then the ones you made yourself (a favourite or your own that you have
//      used sits with the used ones, by how often);
//   2. popular: the well-known movements (lib/exercise-guide.js POPULAR);
//   3. the rest.
//
// While you type, the match comes first and the three tiers apply inside each kind of match:
//   a. names that start with what you typed ("che" lists Chest Press before Dumbbell Chest Press),
//   b. names with a word that starts with it (every typed word starting some word of the name),
//   c. everything else the search found (a typo, a synonym, another language).
// Inside one tier the list keeps the order it came in: the search's own relevance order, or the
// catalogue's, or the same equipment first on a swap.
import { POPULAR } from './exercise-guide.js'
import { normalizeStr } from './exercises.js'
import { favIds } from './favourites.js'

const wordsOf = s => normalizeStr(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean)

/**
 * `list` ordered for the picker. `usage` maps id -> how often the exercise is in a routine or a
 * logged workout, `query` is what is typed, `nameOf` the name on screen (the one being typed
 * against, in the app's language).
 */
export function rankForPicker(list, S, usage, { query = '', nameOf = e => e.n || '' } = {}) {
  const fav = new Set(favIds(S))
  const typed = wordsOf(query)
  const start = typed.join(' ')
  const count = e => usage?.[e.id] || 0
  const tier = e => (count(e) > 0 || fav.has(e.id) || e.custom ? 0 : POPULAR.has(e.id) ? 1 : 2)
  // Inside "yours": how often first, then a favourite, then one you made.
  const mine = e => count(e) * 4 + (fav.has(e.id) ? 2 : 0) + (e.custom ? 1 : 0)
  const kind = e => {
    if (!typed.length) return 0
    const words = wordsOf(nameOf(e))
    if (words.join(' ').startsWith(start)) return 0
    return typed.every(w => words.some(n => n.startsWith(w))) ? 1 : 2
  }
  return list
    .map((e, i) => ({ e, i, k: kind(e), t: tier(e) }))
    .sort((a, b) => (a.k - b.k) || (a.t - b.t) || (a.t === 0 ? mine(b.e) - mine(a.e) : 0) || (a.i - b.i))
    .map(x => x.e)
}
