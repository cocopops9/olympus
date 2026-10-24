// Olympus: the body-first exercise picker's choices (components/ExerciseGuide.jsx).
//
// The catalogue holds over 5,600 exercises, far too many to scroll for someone who just wants
// "something for my chest". The picker therefore asks one question at a time: which muscle (a tap
// on the body) or which kind of training (full body, cardio, stretching, other), and then lists
// what fits in three tiers:
//   - yours: what you have logged, planned or starred, most used first;
//   - popular: the exercises Hevy's library has (hevy-id-map.js), about 230 well-known movements,
//     topped up from the older 1,300-exercise catalogue where a choice has few of them;
//   - more: everything else, behind a "Show more" button.
// Within a tier shorter names come first: "push-up" before "superman push-up", which puts the
// basic movement ahead of its variations without a hand-made ranking.
import { HEVY_ID_MAP, HEVY_TITLE_MAP } from './hevy-id-map.js'
import { HEVY_TITLE_FIX } from './hevy-title-fixes.js'
import V13_IDS from './catalogue-v13-ids.json' with { type: 'json' }
import { musclesOf } from './muscles.js'
import { CATALOGUE } from './exercises.js'

export const POPULAR = new Set([
  ...Object.values(HEVY_ID_MAP), ...Object.values(HEVY_TITLE_MAP), ...Object.values(HEVY_TITLE_FIX),
].filter(id => typeof id === 'string'))
const CLASSIC = new Set(Array.isArray(V13_IDS) ? V13_IDS : Object.keys(V13_IDS || {}))

// The movements most people mean for each muscle, in the order they are listed first. Written as
// catalogue names, so a renumbered catalogue cannot point them at another exercise; a name the
// catalogue no longer has is skipped.
const STAPLE_NAMES = {
  chest: ['barbell bench press', 'dumbbell bench press', 'push-up', 'dumbbell incline bench press', 'barbell incline bench press', 'lever chest press', 'cable standing fly', 'chest dip', 'dumbbell fly', 'lever seated fly'],
  'upper-back': ['pull-up', 'cable pulldown', 'barbell bent over row', 'dumbbell bent over row', 'cable seated row', 'lever seated row', 'chin-up', 'inverted row'],
  deltoids: ['dumbbell seated shoulder press', 'barbell standing military press', 'dumbbell lateral raise', 'cable lateral raise', 'dumbbell front raise', 'cable standing face pull (with rope)', 'dumbbell arnold press', 'lever shoulder press', 'dumbbell rear fly'],
  biceps: ['dumbbell biceps curl', 'barbell curl', 'dumbbell hammer curl', 'cable curl', 'ez barbell curl', 'dumbbell incline curl', 'barbell preacher curl', 'dumbbell concentration curl'],
  triceps: ['cable pushdown', 'cable pushdown (with rope attachment)', 'triceps dip', 'dumbbell standing triceps extension', 'barbell lying triceps extension skull crusher', 'close-grip push-up', 'barbell close-grip bench press'],
  quadriceps: ['barbell full squat', 'dumbbell goblet squat', 'lever leg extension', 'sled 45° leg press', 'lever seated leg press', 'lunge', 'dumbbell lunge', 'air squat', 'barbell front squat', 'barbell split squat'],
  hamstring: ['barbell romanian deadlift', 'dumbbell romanian deadlift', 'lever lying leg curl', 'lever seated leg curl', 'barbell good morning', 'nordic hamstring curl'],
  gluteal: ['barbell hip thrust', 'barbell glute bridge', 'dumbbell glute bridge', 'cable kickback', 'barbell deadlift', 'dumbbell step-up', 'cable pull through'],
  abs: ['front plank', 'crunch (arms on chest)', 'hanging leg raise', 'hanging knee raise', 'bicycle crunch', 'lying leg raise', 'cable kneeling crunch', 'dead bug', 'mountain climber', 'russian twist'],
  calves: ['standing calf raise', 'lever standing calf raise', 'lever seated calf raise', 'barbell standing calf raise', 'dumbbell standing calf raise'],
  trapezius: ['barbell shrug', 'dumbbell shrug', 'cable shrug', 'barbell upright row', 'farmers walk'],
  forearm: ['barbell wrist curl', 'barbell reverse wrist curl', 'farmers walk'],
  'lower-back': ['hyperextension', '45 degrees back extension', 'barbell deadlift', 'barbell good morning', 'superman'],
  obliques: ['russian twist', 'side plank', 'bicycle crunch', 'cable twist', 'dumbbell side bend', 'cable reverse woodchop', 'elbow-to-knee', 'alternate heel touchers'],
  'hip-flexors': ['hanging knee raise', 'hanging leg raise', 'lying leg raise', 'flutter kicks', 'reverse crunch', 'dead bug'],
  // The training tiles have staples of their own, under the tile's id.
  stretch: ['standing hamstring stretch', 'quadriceps stretch', 'child pose', 'cat cow stretch', 'downward facing dog', 'cobra yoga pose', 'kneeling hip flexor stretch', 'pigeon hip stretch', 'world greatest stretch', 'doorway chest stretch', 'across chest shoulder stretch', 'overhead triceps stretch', 'calf stretch with hands against wall', 'knee to chest stretch', 'lying glute stretch', 'neck flexor stretch', 'standing forward bend uttanasana'],
  cardio: ['run', 'run on treadmill', 'walking', 'stationary bike run v. 3', 'rowing (with rowing machine)', 'elliptical machine walk', 'jump rope', 'stair up', 'burpee', 'jumping jack', 'mountain climber', 'high knee run'],
  full: ['barbell deadlift', 'burpee', 'kettlebell swing', 'barbell thruster', 'power clean', 'dumbbell thruster', 'trap bar deadlift', 'bear crawl'],
  adductors: ['lever seated hip adduction', 'cable hip adduction', 'sumo air squat', 'dumbbell sumo squat'],
}
const BY_NAME = new Map(CATALOGUE.map(e => [String(e.n).toLowerCase(), e.id]))
export const STAPLES = Object.fromEntries(Object.entries(STAPLE_NAMES).map(([m, names]) => [m, names.map(n => BY_NAME.get(n)).filter(Boolean)]))

// Below this many main-target exercises a muscle also lists the ones that work it on the side:
// obliques, hip flexors and shins are almost never an exercise's main target.
const FEW = 5

const STRETCH_CATS = new Set(['stretching', 'mobility', 'yoga', 'pilates', 'rehab'])
const OTHER_CATS = new Set(['plyometrics', 'olympic', 'combat'])
const CARDIO_MUSCLE = 'cardiovascular system'

export const isStretch = e => STRETCH_CATS.has(e.cat)
export const isCardioEx = e => !isStretch(e) && (e.bp === 'cardio' || e.cat === 'cardio' || e.tg === CARDIO_MUSCLE)

/** The kinds of training offered beside the body, in the order the tiles show them. */
export const GROUPS = [
  { id: 'full', label: 'Full body', sub: 'Whole-body moves', icon: 'figureStrength', tint: 'var(--acc)', test: e => e.bp === 'full body' && !isStretch(e) && !isCardioEx(e) },
  { id: 'cardio', label: 'Cardio', sub: 'Running, cycling, rowing…', icon: 'figureRun', tint: 'var(--red)', test: isCardioEx },
  { id: 'stretch', label: 'Stretching', sub: 'Mobility, yoga, pilates', icon: 'stretch', tint: 'var(--teal, #30b0c7)', test: isStretch },
  { id: 'other', label: 'Other', sub: 'Jumps, Olympic lifts, boxing', icon: 'bolt', tint: 'var(--orange)', test: e => OTHER_CATS.has(e.cat) && !isCardioEx(e) },
]
const GROUP = Object.fromEntries(GROUPS.map(g => [g.id, g]))

/**
 * What a choice lists. `target` is { kind: 'muscle', id: <slug in MUSCLES> }, { kind: 'group',
 * id: <GROUPS id> } or { kind: 'mine' } (`mine` is the set of ids you have used or starred).
 * A muscle lists the exercises it is the main target of; stretches and cardio have tiles of
 * their own, so tapping the chest does not list chest stretches among the presses.
 */
export function exercisesFor(list, target, mine = new Set()) {
  if (!target) return []
  if (target.kind === 'mine') return list.filter(e => mine.has(e.id))
  if (target.kind === 'group') return GROUP[target.id] ? list.filter(GROUP[target.id].test) : []
  const training = list.filter(e => !isStretch(e) && !isCardioEx(e))
  const main = training.filter(e => musclesOf(e)[target.id] === 1)
  return main.length >= FEW ? main : training.filter(e => musclesOf(e)[target.id] > 0)
}

const byName = nameOf => (a, b) => (nameOf(a).length - nameOf(b).length) || nameOf(a).localeCompare(nameOf(b))

/**
 * The listed exercises in tiers: { yours, popular, more }. `usage` maps id -> times used,
 * `favs` is a Set of starred ids, `nameOf` the displayed name (the sort follows the language
 * on screen). Popular is topped up to `minPopular` from the older catalogue when Hevy's list
 * has fewer for this choice.
 */
export function arrange(list, { usage = {}, favs = new Set(), nameOf = e => e.n || '', minPopular = 8, staples = [] } = {}) {
  const sort = byName(nameOf)
  const isYours = e => favs.has(e.id) || usage[e.id] > 0
  const yours = list.filter(isYours).sort((a, b) => (favs.has(b.id) - favs.has(a.id)) || ((usage[b.id] || 0) - (usage[a.id] || 0)) || sort(a, b))
  const rest = list.filter(e => !isYours(e))
  const lead = new Map(staples.map((id, i) => [id, i]))
  const first = rest.filter(e => lead.has(e.id)).sort((a, b) => lead.get(a.id) - lead.get(b.id))
  let popular = [...first, ...rest.filter(e => POPULAR.has(e.id) && !lead.has(e.id)).sort(sort)]
  if (popular.length < minPopular) {
    const extra = rest.filter(e => !POPULAR.has(e.id) && !lead.has(e.id) && (CLASSIC.has(e.id) || e.custom)).sort(sort)
    popular = [...popular, ...extra.slice(0, minPopular * 2 - popular.length)]
  }
  const inPopular = new Set(popular.map(e => e.id))
  const more = rest.filter(e => !inPopular.has(e.id)).sort(sort)
  return { yours, popular, more }
}

/** How many exercises each muscle and each group would list, for the labels on the screen. */
export function countsFor(list, muscles) {
  const out = {}
  for (const m of muscles) out[m] = 0
  for (const g of GROUPS) out[g.id] = 0
  const side = {}
  for (const m of muscles) side[m] = 0
  for (const e of list) {
    const stretch = isStretch(e), cardio = isCardioEx(e)
    if (!stretch && !cardio) {
      const ms = musclesOf(e)
      for (const m of muscles) { if (ms[m] === 1) out[m]++; if (ms[m] > 0) side[m]++ }
    }
    for (const g of GROUPS) if (g.test(e)) out[g.id]++
  }
  for (const m of muscles) if (out[m] < FEW) out[m] = side[m]
  return out
}
