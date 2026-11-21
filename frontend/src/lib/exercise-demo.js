// Olympus: which exercise a question to a coach asks to be shown. "Come si fa lo squat?", "How do
// I do a bench press?", asked to Chiron, Hercules or Athena, gets the exercise's own animation from
// the library beside the spoken and written answer (components/ExerciseDemo.jsx). Pure: the list of
// exercises and how to name them are handed in, so this is tested without the catalogue.

// Words in the app's languages that ask how an exercise is done, on text without accents.
const HOW_TO = new RegExp('\\b(?:' + [
  // Italian
  'come (?:si )?(?:fa|fanno|faccio|fare|eseguo|esegue|eseguire|esegu\\w*|svolg\\w*|imposta\\w*)',
  'esecuzion\\w*', 'tecnica', 'fammi vedere', 'mostrami', 'fammelo vedere',
  // English
  'how (?:do|to|should|can|would) (?:i |you |we )?(?:do|perform|execute|make)', 'how is (?:a |an |the )?\\w+(?: \\w+){0,3} done',
  'proper form', 'technique', 'show me', 'form (?:on|for) ',
  // Spanish and Portuguese
  'como (?:se )?(?:hace|hago|hacer|realiz\\w*|ejecut\\w*|faz|faco|fazer|execut\\w*)', 'muestrame', 'mostra(?:-me| me)?', 'mostre',
  // French
  'comment (?:faire|on fait|je fais|realiser|executer|faut il)', 'montre moi',
  // German
  'wie (?:mache|macht|fuhre|fuhrt|geht)', 'technik', 'ausfuhrung', 'zeig mir',
].join('|') + ')\\b')

// Words of such a question that are not part of an exercise's name.
const FILLER = new Set(`
come si fa fanno faccio fare eseguo esegue eseguire esecuzione esecuzioni correttamente corretta corretto tecnica fammi fammelo
vedere mostrami mostra spiega spiegami posso devo bene giusta giusto esercizio questo questa quest la il lo l i gli le un una uno
di del della dello dei degli delle per con a al alla allo ai agli alle in nel nella mi me ti ci e o chirone ercole atena calliope
how do does did i you we to perform execute make the a an properly correctly correct proper form technique show me explain should
can would is it this that exercise with good right way on for of my please chiron hercules athena
como se hace hago hacer realiza realizar ejecuta ejecutar el los las de del tecnica correcta correctamente muestrame explicame
ejercicio este esta por favor faz faco fazer executa executar execucao os as um uma do da dos das tecnico mostre explica exercicio
comment faire fait fais on je le les une du des correctement montre moi explique exercice executer realiser cet cette
wie mache macht man ich die der das den dem ein eine einen richtig technik ausfuhrung zeig mir erklar erklare ubung diese dieses
`.trim().split(/\s+/))

/** Text in lower case without accents or punctuation, words one space apart. */
export const plain = s => String(s || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

/** Whether `text` asks how an exercise is done. */
export const asksHowTo = text => HOW_TO.test(plain(text))

/**
 * The exercise `text` names, of `list`, or null. `nameOf(e)` gives the names to look for (the one
 * in the app's language and the English one). A name written whole wins, the longest first
 * ("stacco rumeno" over "stacco"); otherwise the exercise whose name holds every other word of the
 * question: one with an animation, the person's own (`prefer`, ids), the barbell, body-weight or
 * dumbbell form, and the shortest English name without its equipment, in that order.
 */
export function exerciseIn(text, list, nameOf, prefer = new Set()) {
  const hay = ' ' + plain(text) + ' '
  const names = e => [...new Set((nameOf(e) || []).map(plain).filter(n => n.length >= 3))]
  let best = null, bestLen = 0
  for (const e of list || []) {
    for (const n of names(e)) {
      if (!hay.includes(' ' + n + ' ')) continue
      const better = n.length > bestLen || (n.length === bestLen && (rank(e, prefer) < rank(best, prefer)))
      if (better) { best = e; bestLen = n.length }
    }
  }
  if (best) return best
  const words = ownWords(text)
  if (!words.length || words.length > 5 || !words.some(w => w.length >= 4)) return null
  let pick = null, pickKey = null
  for (const e of list || []) {
    for (const n of names(e)) {
      const own = ' ' + n + ' '
      if (!words.every(w => own.includes(' ' + w + ' ') || (w.length >= 5 && own.includes(' ' + w)))) continue
      // An animation first (it is what is shown), then the person's own exercise, then the plain
      // free-weight form (a lift asked about without its equipment is, in a gym, the barbell one;
      // "stacco da terra" is not the cable deadlift), then the shortest name.
      const key = [e.gif ? 0 : 1, prefer.has(e.id) ? 0 : 1, EQUIPMENT.indexOf(e.eq) < 0 ? EQUIPMENT.length : EQUIPMENT.indexOf(e.eq), bareLength(e)]
      if (less(key, pickKey)) { pick = e; pickKey = key }
    }
  }
  return pick
}
const EQUIPMENT = ['barbell', 'body weight', 'dumbbell', 'cable', 'leverage machine']
// The length of the English name without its equipment: in every language, "barbell deadlift" is
// the plain deadlift and "strongman deadlift" a variant of it.
const bareLength = e => plain(e.n).replace(plain(e.eq), ' ').replace(/\s+/g, ' ').trim().length
const less = (a, b) => { if (!b) return true; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i]; return false }
// The words of a question left once the asking is taken away.
const ownWords = text => plain(text).split(' ').filter(w => w && !FILLER.has(w))
const rank = (e, prefer) => (e ? (prefer.has(e.id) ? 0 : 2) + (e.gif ? 0 : 1) : 9)

/**
 * The exercise to show for a question to a coach, or null when it does not ask how one is done.
 * `current` is the exercise being trained, for "how do I do this one?" (a question with nothing
 * else in it: "come si fa a perdere peso?" shows nothing).
 */
export function demoExercise(text, { list, nameOf, prefer, current } = {}) {
  if (!asksHowTo(text)) return null
  return exerciseIn(text, list, nameOf, prefer) || (current && !ownWords(text).length ? current : null)
}
