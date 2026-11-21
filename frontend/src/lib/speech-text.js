// Olympus: a coach's answer cut into the pieces the offline voice reads (LocalVoicePlugin.speak
// `parts`), each with the silence that follows it.
//
// The voice (Kokoro or Piper, through sherpa-onnx) reads one piece at a time and makes the next
// while the one before it plays. Within a piece the model follows the punctuation by itself:
// measured on the Kokoro pack (2026-11-21), it paused 180 to 340 ms at a full stop and 70 to
// 120 ms at a comma when it read two sentences together. What it does not see is the layout: a
// list item or a heading with no full stop ran on into the next line with no pause at all, since
// the old cut joined the lines. And what it is given in pieces it reads with the edges of each
// piece only: about 50 ms of quiet before a piece and 40 to 160 ms after it. So:
//
// - every line (a list item, a heading, a paragraph) is a sentence of its own, closed with a full
//   stop when it has none, so it ends with a falling voice;
// - Markdown and symbols that are read as noise or as words ("→", "|", "**") are taken out;
// - the silence added after a piece makes up the pause it should have: PAUSE below.
//
// The first piece is kept short, since nothing is heard until it has been made: making it takes
// about as long as saying it on a mid-range phone. A long first sentence is cut at its first comma,
// colon or semicolon, where the voice would pause anyway.

/**
 * Milliseconds of silence added after a piece, on top of the edges of the sound (about 150 ms).
 * sentence: to about 300 ms, the middle of the full-stop pauses measured. clause: none, the
 * edges alone match the comma pauses measured. block (the end of a line, list item or paragraph):
 * to about 500 ms, longer than between sentences (an assumption: a new line is a new thought).
 */
export const PAUSE = { clause: 0, sentence: 150, block: 350 }

/**
 * first: the longest first piece, in characters (about 2.6 s of speech at the measured 0.045 s per
 * character). max: the longest piece; a longer sentence is cut at a clause. Shorter pieces start
 * sooner and are stopped sooner (a piece being made cannot be interrupted), longer ones keep more
 * of a sentence's intonation together.
 */
export const LIMITS = { first: 55, max: 140, minClause: 15 }

// Abbreviations that end with a full stop but not a sentence (lower case, without the stop).
const ABBREV = new Set(['e.g', 'i.e', 'etc', 'vs', 'approx', 'min', 'max', 'sec', 'dr', 'mr', 'mrs', 'ms', 'st', 'no',
  'es', 'ecc', 'pag', 'sig', 'dott', 'prof', 'p.es', 'ca', 'z.b', 'bzw', 'usw', 'ggf', 'p.ej', 'aprox', 'sr', 'sra', 'env', 'cf'])

const SENTENCE_END = /[.!?…。！？]$/
const CLOSED = /[.!?…:;。！？：；]$/
const CLAUSE = /[,;:，、；：]/

/** One line of Markdown as plain words, or '' when nothing in it is read. */
export function cleanLine(line) {
  let s = String(line || '')
  // A table: its rule is dropped, its cells read as a list.
  if (/^\s*\|/.test(s)) {
    if (/^\s*\|?[\s:|-]+\|?\s*$/.test(s)) return ''
    s = s.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(x => x.trim()).filter(Boolean).join(', ')
  }
  s = s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')         // pictures
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')       // links: their words
    .replace(/<[^>]+>/g, ' ')                       // html tags
    .replace(/^\s*(?:#{1,6}|>+)\s*/, '')            // heading, quote
    .replace(/^\s*(?:[-*•+▪◦]|\d{1,2}[.)])\s+/, '') // list mark
    .replace(/(\*\*|__|~~|`+)/g, '')
    .replace(/(^|[\s(])[*_]([^*_\n]+)[*_](?=[\s).,;:!?]|$)/g, '$1$2')   // *emphasis*, _emphasis_
    .replace(/[*#|`]/g, ' ')
    .replace(/\s*(?:→|->|=>|⇒|➜|⟶)\s*/g, ', ')
    .replace(/\s+[–—-]\s+/g, ', ')                  // a dash between words: a pause
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{20E3}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?…])/g, '$1')
    .replace(/([,;:])(?:\s*[,;:])+/g, '$1')
    .trim()
    .replace(/^[,.;:]+\s*/, '')
  return /[\p{L}\p{N}]/u.test(s) ? s : ''
}

// Whether the full stop ending `piece` closes an abbreviation or a lone number, not a sentence.
function notAnEnd(piece) {
  const m = piece.match(/(\S+)\.$/)
  if (!m) return false
  const word = m[1].toLowerCase().replace(/^[("'«“]+/, '')
  return ABBREV.has(word) || /^\p{L}$/u.test(word) || /^\d{1,2}$/.test(word)
}

/** The sentences of one clean line. */
export function sentencesOf(line) {
  const raw = line.split(/(?<=[.!?…])\s+|(?<=[。！？])/u).filter(x => x.trim())
  const out = []
  for (const piece of raw) {
    if (out.length && notAnEnd(out[out.length - 1])) out[out.length - 1] += ' ' + piece
    else out.push(piece.trim())
  }
  return out
}

// `sentence` cut so that no piece is longer than `max`: at the last clause mark before it with at
// least `min` characters in front, else at the last space, else hard.
function cutLong(sentence, max, min = 30) {
  const out = []
  let rest = sentence
  while (rest.length > max) {
    let cut = -1
    for (let i = max - 1; i >= min; i--) if (CLAUSE.test(rest[i])) { cut = i + 1; break }
    if (cut < 0) { const sp = rest.lastIndexOf(' ', max); cut = sp >= min ? sp : max }
    out.push(rest.slice(0, cut).trim())
    rest = rest.slice(cut).trim()
  }
  if (rest) out.push(rest)
  return out
}

// The first sentence cut at its first clause mark, when it is too long to be heard soon.
function cutFirst(sentence, first, minClause) {
  if (sentence.length <= first) return [sentence]
  for (let i = minClause; i < Math.min(sentence.length - minClause, first); i++) {
    if (CLAUSE.test(sentence[i]) && /\s/.test(sentence[i + 1] || ' ')) return [sentence.slice(0, i + 1).trim(), sentence.slice(i + 1).trim()]
  }
  return [sentence]
}

/**
 * The pieces of `text` for the offline voice: [{ text, pause }], `pause` the milliseconds of
 * silence after the piece (0 after the last). Empty when nothing in it is read.
 */
export function speechParts(text, { limits = LIMITS, pause = PAUSE } = {}) {
  const src = String(text || '').replace(/```[\s\S]*?```/g, '\n').replace(/\r\n?/g, '\n')
  const parts = []
  for (const rawLine of src.split('\n')) {
    let line = cleanLine(rawLine)
    if (!line) continue
    if (/[,]$/.test(line)) line = line.slice(0, -1)
    if (!CLOSED.test(line)) line += /[　-鿿]$/u.test(line) ? '。' : '.'
    const sentences = sentencesOf(line)
    sentences.forEach((sentence, si) => {
      const firstOfAll = !parts.length && si === 0
      const pieces = (firstOfAll ? cutFirst(sentence, limits.first, limits.minClause) : [sentence]).flatMap(p => cutLong(p, limits.max))
      pieces.forEach((p, pi) => {
        const endOfSentence = pi === pieces.length - 1
        const endOfLine = endOfSentence && si === sentences.length - 1
        parts.push({ text: p, pause: endOfLine ? pause.block : endOfSentence && SENTENCE_END.test(p) ? pause.sentence : pause.clause })
      })
    })
  }
  if (parts.length) parts[parts.length - 1].pause = 0
  return parts
}
