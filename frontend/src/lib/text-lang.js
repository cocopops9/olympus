// Olympus: the language a piece of text is written in, so that a coach's answer is read by a voice
// of that language. The app's language is not enough: a person with the app in English who speaks
// Italian gets Italian answers, which an English voice read (reported 2026-11-22).
//
// The app's languages only (lib/voice.js TAGS). Scripts that belong to one language settle it at
// once; Latin-script languages are told apart by their commonest short words and by letters only
// they use. When the text gives too little to go on (a few words, exercise names, numbers), or two
// languages score the same, the caller's fallback (the app's language) is kept: a wrong switch is
// worse than no switch.

const SCRIPTS = [
  [/[가-힯]/g, 'ko'],
  [/[฀-๿]/g, 'th'],
  [/[ঀ-৿]/g, 'bn'],
  [/[ऀ-ॿ]/g, 'hi'],
  [/[؀-ۿ]/g, 'ar'],
  [/[一-鿿]/g, 'zh'],
  [/[Ѐ-ӿ]/g, 'cyr'],
]

// Short, frequent words of each language. A word that belongs to several counts for each of them:
// what tells the languages apart is how many of a text's words each list holds.
const WORDS = {
  en: 'the and is are you your to of with for this that it on be have do not what how can will my it\'s don\'t i\'m sets reps weight',
  it: 'il lo la gli le di che è per con non un una sono hai del della dei delle nel nella questo questa come più anche ma ti mi molto ogni oggi sei tuo tua tuoi bene serie ripetizioni allenamento peso',
  es: 'el los las que y es en por para con una no tu muy pero más del esta este como tus hoy bien eres estás series repeticiones entrenamiento peso',
  fr: 'le les des est et une pour avec pas vous tu je ce cette dans du au aux sur mais très ton ta tes qui que bien séries répétitions entraînement poids',
  de: 'der die das und ist nicht mit für du ich ein eine zu den dem auf sie es auch wie sehr dein deine heute gut sätze wiederholungen training gewicht',
  pt: 'o os as que não um uma com para é e do da dos das você seu sua mais muito mas isso está hoje bem séries repetições treino peso',
  pl: 'i w na nie się to jest z do że jak co ale czy po dla mnie twój twoja dziś dobrze serie powtórzenia trening',
  tr: 've bir bu için ile de da çok ne gibi daha ama sen ben var yok bugün iyi set tekrar antrenman ağırlık',
  hu: 'a az és egy hogy nem is van meg de csak ez már még ki mi mint ma jól sorozat ismétlés edzés súly',
}
const LISTS = Object.fromEntries(Object.entries(WORDS).map(([l, w]) => [l, new Set(w.split(' '))]))

// Letters that only one (or nearly only one) of the Latin-script languages uses; each one found
// counts as two words.
const LETTERS = {
  es: /[ñ¿¡]/g,
  de: /[ß]/g,
  pt: /[ãõ]/g,
  pl: /[ąęłśźżń]/g,
  tr: /[şğı]/g,
  hu: /[őű]/g,
  fr: /[êëîœ]/g,
}

/** The language (an app language code) `text` is written in, or `fallback` when that is unclear. */
export function textLang(text, fallback = 'en') {
  const s = String(text || '')
  const base = String(fallback || 'en').split('-')[0]
  // Whole scripts: the one with the most letters, when it has a few.
  let script = null, most = 0
  for (const [re, l] of SCRIPTS) {
    const n = (s.match(re) || []).length
    if (n > most) { most = n; script = l }
  }
  const latin = (s.match(/[a-zà-ÿąćęłńśźżőűşğı]/gi) || []).length
  if (script && most >= 2 && most >= latin / 2) {
    if (script === 'cyr') return /[іїєґ]/i.test(s) ? 'uk' : 'ru'
    if (script === 'zh') return base === 'zh' ? fallback : 'zh'
    return script
  }
  const words = s.toLowerCase().match(/[\p{L}']+/gu) || []
  const score = {}
  for (const l of Object.keys(LISTS)) {
    let n = 0
    for (const w of words) if (LISTS[l].has(w)) n++
    const marks = LETTERS[l] ? (s.toLowerCase().match(LETTERS[l]) || []).length : 0
    score[l] = n + 2 * marks
  }
  const ranked = Object.entries(score).sort((a, b) => b[1] - a[1])
  const [best, top] = ranked[0]
  const second = ranked[1][1]
  // Too little to go on, or no clear winner: the fallback stays.
  if (top < 2 || top === second) return fallback
  // The fallback is as likely as the winner within one word: keep it (no switch on a near tie).
  if (best !== base && (score[base] ?? -1) >= top - 1 && top < 4) return fallback
  if (best === base) return fallback   // keeps a region (pt-BR, zh-TW) the app was set to
  return best
}

/** The language a question is written in, or '' when the text does not settle it. */
export function questionLang(text) {
  const l = textLang(text, 'xx')
  return l === 'xx' ? '' : l
}
