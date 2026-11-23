// Olympus: the exercise a question asks how to do ("come si fa lo stacco rumeno?", "how do I do
// a hip thrust?"), read from the person's own words, so the coach's answer shows its
// demonstration even when the model forgot to write the show_exercise action
// (lib/coach-actions.js). The action stays the first source: this is the fallback, and it is
// deliberately strict, because a wrong animation beside a technique answer is worse than none.
//
// How it reads a question:
//   1. A cue that asks for technique must be there ("how do I", "come si fa", "cómo se hace",
//      "technique", ...). Without one, nothing: "I did squats today" is not a question about
//      how to squat.
//   2. The words after the cue, without articles and filler, are the candidate name. It is
//      shortened from the right one word at a time ("stacco rumeno senza dolore alla schiena"
//      still finds "stacco rumeno"), and the longest candidate that names an exercise wins.
//   3. "Names an exercise" means every word of the candidate is a word (or the start of one) of
//      the exercise's own name, in English or in the active language. The catalogue search alone
//      also matches muscles, equipment and descriptions, which is right for the library and too
//      loose here: "how do I grow my chest" must not pick a chest press.
import { exerciseNameFor } from './i18n.js'
import { splitActions, isShown } from './coach-actions.js'
import { CATALOGUE, normalizeStr, searchExercises, priorOf } from './exercises.js'
import { SPORTS } from './sports.js'

// The cues, accent-free and lower-case (the question is normalised the same way before
// matching). Each is a regular-expression fragment; the candidate name is what follows it.
// Only languages written with spaces between words: the others rely on the model's action.
const CUES = [
  // English
  'how (?:do|should|can) (?:i|you|we|one)(?: properly| correctly| safely)?(?: do| perform| execute| make)?',
  'how to(?: properly| correctly| safely)?(?: do| perform| execute)?', 'how is', 'how are',
  'tell me how to(?: properly| correctly| safely)?(?: do| perform| execute)?',
  '(?:proper |correct |good )?(?:form|technique) (?:for|on|of|in)', 'show me(?: how to do)?', 'explain(?: how to do)?', 'teach me(?: how to do)?',
  // Italian
  'come (?:si )?(?:fa|fanno|esegue|eseguono|eseguo|faccio|fare|eseguire)(?: correttamente| bene)?', 'come (?:devo|posso|dovrei) (?:fare|eseguire)',
  '(?:la )?(?:tecnica|esecuzione|forma) (?:corretta )?(?:del|dello|della|dei|degli|delle|di|per)', 'spiegami(?: come (?:si )?fa)?', 'mostrami(?: come (?:si )?fa)?', 'insegnami(?: a fare)?',
  'dimmi come (?:si )?(?:fa|fanno|esegue|fare|eseguire)', 'fammi vedere(?: come (?:si )?(?:fa|fanno|esegue))?', 'come (?:si )?(?:allena|allenano|alleno|allenare)',
  // Spanish
  'como (?:se )?(?:hace|hacen|realiza|realizo|hago|hacer|ejecuta)(?: correctamente| bien)?', 'como (?:debo|puedo) (?:hacer|realizar)',
  '(?:la )?(?:tecnica|ejecucion) (?:correcta )?(?:del|de la|de los|de las|de|para)', 'explicame(?: como se hace)?', 'muestrame(?: como se hace)?', 'ensename(?: a hacer)?', 'dime como se hace', 'como (?:se )?(?:entrena|entrenar|entreno)',
  // Portuguese
  'como (?:se )?(?:faz|fazem|executa|faco|fazer|executar)(?: corretamente| bem)?', 'como (?:devo|posso) (?:fazer|executar)',
  '(?:a )?(?:tecnica|execucao) (?:correta )?(?:do|da|dos|das|de|para)', 'explica(?:-me)?(?: como se faz)?', 'mostra(?:-me)?(?: como se faz)?',
  // French
  'comment (?:on )?(?:fait|faire|execute|executer|realiser|je fais)(?: correctement| bien)?', 'comment (?:dois|peux)-je (?:faire|executer)',
  "(?:la )?(?:technique|execution) (?:correcte )?(?:du|de la|des|de l'|de|pour)", 'explique(?:-moi)?(?: comment faire)?', 'montre(?:-moi)?(?: comment faire)?',
  // German
  'wie (?:mache|macht|fuhre|fuhrt) (?:ich|man)(?: richtig)?', 'wie geht', '(?:die )?(?:technik|ausfuhrung) (?:beim|bei|vom|von|fur)', 'zeig mir(?: wie)?', 'erklar mir(?: wie)?',
]
const CUE = new RegExp('(?:^|[^a-z])(?:' + CUES.join('|') + ')(?=[^a-z]|$)', 'g')

// A verb of training right after the cue ("how do I train the squat", "come allenare lo stacco"):
// what it trains may be a muscle as well as a lift, so the name after it must be an exercise's
// own name (exerciseNamed `strict`): "how do I train my chest" must not pick a chest press.
// Strict means: a query that holds a body part is taken only when it is a whole name by itself
// ("squat"); "romanian deadlift" names a lift, "chest" or "upper chest" a muscle.
const BODY = new Set(`
  chest pec pecs back lats legs leg arms arm shoulders shoulder delts abs core glutes glute biceps triceps quads hamstrings calves forearms traps neck hips
  petto pettorali schiena dorsali gambe gamba braccia braccio spalle spalla addominali addome glutei bicipiti tricipiti quadricipiti femorali polpacci avambracci trapezi collo
  pecho pectorales espalda piernas pierna brazos brazo hombros hombro abdominales gluteos biceps triceps cuadriceps isquiotibiales gemelos antebrazos
  peito costas pernas braco bracos ombros abdomen
  poitrine dos jambes bras epaules abdos fessiers
  brust rucken beine arme schultern bauch po
`.split(/\s+/).filter(Boolean))
const TRAIN = new Set('train training allenare allenarsi allenamento allena alleno allenano entrenar entreno entrena treinar treino treina entrainer entraine trainieren trainiere'.split(' '))

// Leading words that are not part of a name: articles, "a", "the", "properly"...
const FILLER = new Set(`
  a an the my this that these those one some it correctly properly safely do doing perform
  il lo la i gli le l un uno una un' del dello della dei degli delle al allo alla ai agli alle di per bene correttamente esercizio
  el los las unos unas del al de para bien correctamente ejercicio
  o os as um uma do da dos das ao aos de para bem corretamente exercicio
  le la les l un une du des de au aux pour bien correctement exercice
  der die das den dem des ein eine einen einem beim bei vom von fur richtig ubung
`.split(/\s+/).filter(Boolean))

const MAX_WORDS = 6

/** Words of a text, accent-free and lower-case, punctuation gone (apostrophes split words). */
const wordsOf = s => normalizeStr(s).replace(/[^a-z0-9Ѐ-ӿ]+/g, ' ').trim().split(' ').filter(Boolean)

// The words of each name an exercise goes by: the English one and the active language's, the
// latter without the English name the app adds in brackets ("squat bulgaro (split squat)").
const namesOf = ex => {
  const local = exerciseNameFor(ex)
  const tail = ' (' + ex.n + ')'
  return [ex.n, local.endsWith(tail) ? local.slice(0, -tail.length) : local].map(wordsOf).filter(w => w.length)
}
// A word of the query is in a name as itself, as the start of a longer word ("lat" of "lats"),
// or in the singular ("pull-ups" is the "pull-up").
const covers = (name, q) => name.some(w => w === q || (q.length >= 3 && w.startsWith(q)) || (q.length >= 3 && q.endsWith('s') && w === q.slice(0, -1)))
// Words that join a name without adding to it: "panca piana con bilanciere" says one thing more
// than "panca piana", not two.
const JOINERS = new Set('with on in at to of a al alla allo ai alle con di da per en de del la le du des au avec sur mit am im auf com do da no na em'.split(' '))

const exact = (name, q) => name.some(w => w === q || (q.length >= 3 && q.endsWith('s') && w === q.slice(0, -1)))

/**
 * How far the exercise's name is from the query, by the name that fits it best, or null when
 * some word of the query is in neither name: each word of the name the query leaves out counts
 * 3, each query word found only as the start of a longer one ("lat" of "lateral") counts 1.
 */
function distance(ex, words) {
  // The joining words of the query are not looked for: "con" would otherwise be found as the
  // start of "concentrato".
  const query = words.filter(q => !JOINERS.has(q))
  if (!query.length) return null
  const names = namesOf(ex)
  if (!query.every(q => covers(names.flat(), q))) return null
  return Math.min(...names.map(name => {
    if (!query.every(q => covers(name, q))) return Infinity
    const extra = name.filter(w => !JOINERS.has(w) && !query.some(q => covers([w], q))).length
    return 3 * extra + query.filter(q => !exact(name, q)).length
  }))
}

/**
 * The exercise one query names, or null. Of the search's matches whose names hold every word,
 * the nearest (distance above), weighed against how common it is (priorOf, the preference the
 * library search uses: the barbell bench press before the Smith machine one, the 45 degree leg
 * press before the rest). A name that is the query itself wins outright, as in the library
 * search: "squat" is the squat, not the dumbbell squat.
 */
function exerciseNamed(query, custom, strict = false) {
  const found = searchExercises([...custom, ...CATALOGUE], query.join(' ')).slice(0, 40)
  let best = null, bestScore = -Infinity
  for (const ex of found) {
    const d = distance(ex, query)
    if (d == null || (strict && d > 0 && query.some(w => BODY.has(w)))) continue
    const score = priorOf(ex) - d + (d === 0 ? 50 : 0)
    // Ties keep the search's order.
    if (score > bestScore) { best = ex; bestScore = score }
  }
  return best
}

/** The exercise one candidate phrase names, or null: the longest start of it that names one. */
function nameAfter(phrase, custom, strict = false) {
  const words = wordsOf(phrase)
  while (words.length && (FILLER.has(words[0]) || TRAIN.has(words[0]))) { strict = strict || TRAIN.has(words[0]); words.shift() }
  for (let n = Math.min(words.length, MAX_WORDS); n > 0; n--) {
    const query = words.slice(0, n)
    while (query.length && FILLER.has(query[query.length - 1])) query.pop()
    if (!query.length || query.join('').length < 3) continue
    const ex = exerciseNamed(query, custom, strict)
    if (ex) return ex
  }
  return null
}

/**
 * The id of the exercise the question asks how to do, or null. `custom`: the person's own
 * exercises, which are searched first.
 */
export function askedExercise(question, custom = []) {
  const text = normalizeStr(String(question || '').slice(0, 400))
  if (!text.trim()) return null
  // Each cue in turn, left to right: "ciao! come si fa la panca piana?" has one, and "show me,
  // how do I do a pull-up" finds the pull-up after either.
  for (const m of text.matchAll(CUE)) {
    const rest = text.slice(m.index + m[0].length).split(/[?!.;:\n]/)[0]
    // A cue that ends with a training verb ("come si allena") makes the name strict, as one followed by it does.
    const ex = nameAfter(rest, custom, TRAIN.has(wordsOf(m[0]).pop()))
    if (ex) return ex.id
  }
  return null
}

// How to train for a sport ("how do I train for football?", "esercizi per il tennis", "basketball
// drills"): a word about training within a few words of a sport's name. The words are stems,
// matched at the start of a word of the question, accent-free: "allenarmi", "allenamento" and
// "allenare" are all "allen". The sport is named in English or in the active language, by any part
// of its name around brackets ("football (soccer)" is "football" and "soccer").
const TRAIN_STEMS = [
  'train', 'drill', 'practi', 'improv', 'better', 'workout', 'exercis', 'prepar',
  'allen', 'eserciz', 'miglior', 'prepara',
  'entren', 'ejercic', 'mejor',
  'trein', 'exercic', 'melhor',
  'entrain', 'exercice', 'ameliorer',
  'trainier', 'ubung', 'verbesser',
]
const NEAR = 4

const sportNames = sport => [sport.n, exerciseNameFor(sport)]
  .flatMap(n => String(n).split(/[()]/))
  .map(wordsOf).filter(w => w.length && w.join('').length >= 4)

// Where the words of `name` start in `words`, or -1.
const indexOfName = (words, name) => {
  for (let i = 0; i + name.length <= words.length; i++) if (name.every((w, j) => words[i + j] === w)) return i
  return -1
}

/** The id of the sport a question asks how to train for, or null. */
export function askedSportTraining(question) {
  const words = wordsOf(String(question || '').slice(0, 400))
  if (!words.length) return null
  const cues = words.map((w, i) => (TRAIN_STEMS.some(s => w.startsWith(s)) ? i : -1)).filter(i => i >= 0)
  if (!cues.length) return null
  for (const sport of SPORTS) {
    for (const name of sportNames(sport)) {
      const at = indexOfName(words, name)
      if (at < 0) continue
      const end = at + name.length - 1
      if (cues.some(c => (c < at ? at - c : c - end) <= NEAR)) return sport.id
    }
  }
  return null
}

/**
 * The exercise to keep on a coach's answer (`demo` on the message) that came without a
 * show_exercise action, when the question asked how to do one; null otherwise, and for a question
 * about how to train for a sport, which no single exercise answers. `already`: a
 * demonstration was shown for this question, by the coach who answered first when both answer,
 * so the second does not repeat it.
 */
export function demoFor(question, reply, custom = [], already = false) {
  if (already || splitActions(reply).actions.some(isShown)) return null
  // A question about training for a sport is caught before the exercise search, which would read
  // "how do I train for football" as the cross trainer.
  if (askedSportTraining(question)) return null
  return askedExercise(question, custom)
}
