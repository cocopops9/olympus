// Olympus: what the person told their coaches they are going after, read as numbers. The words
// come from two places on the device: the goals they wrote in "What you train for"
// (lib/coach-profile.js) and the notes the coaches keep about them (lib/coach-memory.js), which
// the coaches write in the person's own language. This finds, in that text, targets the medals
// can follow:
//   - a weight on a lift ("bench 100 kg", "panca 100", "squat 1.5x bodyweight"),
//   - reps of an exercise with no added weight ("20 pull-ups", "trazioni 15"),
//   - a pace ("run at 12 km/h"),
//   - how often they want to train ("4 times a week", "3 volte a settimana").
// It is a reader of patterns, not of meaning: it knows the exercises that have a strength level
// (lib/strength-level.js) by their name in the app's language, by their English name and by the
// common words for them in English, Italian, Spanish, French, German and Portuguese. A sentence
// it cannot place is left alone, never guessed at; what it misses the person can still say in
// "What you train for" as a plain target.
import { EXIDX } from './exercises.js'
import { exerciseNameFor, getLang } from './i18n.js'
import { METRICS } from './strength-level.js'

const LB = 0.45359237

/** Lower case, no accents, hyphens and underscores as spaces, one space between words. */
export const norm = s => String(s || '')
  .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss')
  .replace(/[-_]/g, ' ').replace(/[ \t]+/g, ' ').trim()

// Common words for each exercise, by key (lib/strength-level.js). Already in the normalised form.
const WORDS = {
  squat: ['squat', 'back squat', 'accosciata', 'sentadilla', 'agachamento', 'agachamento livre', 'kniebeuge'],
  bench: ['bench', 'bench press', 'panca', 'panca piana', 'press banca', 'press de banca', 'banca', 'developpe couche', 'bankdrucken', 'supino', 'supino reto'],
  deadlift: ['deadlift', 'stacco', 'stacco da terra', 'peso muerto', 'souleve de terre', 'kreuzheben', 'levantamento terra'],
  ohp: ['overhead press', 'military press', 'shoulder press', 'ohp', 'lento avanti', 'press militar', 'developpe militaire', 'schulterdrucken', 'desenvolvimento'],
  row: ['barbell row', 'bent over row', 'rematore', 'remo con barra', 'rowing barre', 'langhantelrudern', 'remada curvada'],
  'front-squat': ['front squat', 'squat frontale', 'sentadilla frontal', 'squat avant', 'frontkniebeuge'],
  incline: ['incline bench', 'incline press', 'panca inclinata', 'press inclinado', 'developpe incline', 'schragbankdrucken'],
  sumo: ['sumo deadlift', 'stacco sumo', 'peso muerto sumo'],
  rdl: ['romanian deadlift', 'rdl', 'stacco rumeno', 'peso muerto rumano', 'souleve de terre roumain'],
  'hip-thrust': ['hip thrust', 'spinta d anca', 'puente de gluteo', 'elevacion de cadera'],
  'leg-press': ['leg press', 'pressa', 'prensa de piernas', 'presse a cuisses', 'beinpresse'],
  pulldown: ['lat pulldown', 'pulldown', 'lat machine', 'jalon al pecho', 'tirage vertical', 'latzug'],
  curl: ['barbell curl', 'curl bilanciere', 'curl con barra', 'curl barre'],
  'push-up': ['push up', 'pushup', 'flessioni', 'flexiones', 'pompes', 'liegestutze', 'flexoes'],
  'pull-up': ['pull up', 'pullup', 'trazioni', 'dominadas', 'tractions', 'klimmzuge', 'barra fixa'],
  'chin-up': ['chin up', 'chinup', 'trazioni supine'],
  dip: ['dip', 'dips', 'parallele', 'fondos', 'barrenstutz'],
  burpee: ['burpee', 'burpees'],
  run: ['run', 'running', 'corsa', 'correre', 'carrera', 'correr', 'course a pied', 'laufen'],
  rowing: ['rowing machine', 'rower', 'vogatore', 'remo', 'rameur', 'rudergerat'],
}

const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const isAscii = s => /^[\x20-\x7e]+$/.test(s)

// Every exercise with a level, with the regular expressions that find it in normalised text. Built on
// first use (the app's language is known by then) and rebuilt if the language changes.
let index = null, indexLang = ''
function names() {
  const lang = getLang()
  if (index && lang === indexLang) return index
  index = METRICS.map(m => {
    const ex = EXIDX[m.id]
    const words = new Set(WORDS[m.key] || [])
    if (ex) { words.add(norm(ex.n)); words.add(norm(exerciseNameFor(ex))) }
    // The shortest words first would let "dip" win over "dips": the longest are tried first.
    const list = [...words].filter(w => w.length >= 3).sort((a, b) => b.length - a.length)
    const rx = list.map(w => (isAscii(w) ? new RegExp('(?:^|[^a-z0-9])(' + escape(w) + '(?:s|es)?)(?=$|[^a-z0-9])', 'g') : new RegExp('(' + escape(w) + ')', 'g')))
    return { m, rx }
  })
  indexLang = lang
  return index
}

const num = s => Number(String(s).replace(',', '.'))
const WORD_LB = /^(lbs?|pounds?|libras?|livres?)$/
const WORD_KG = /^(kg|kgs|kilos?|chili|chilos?|kilogramm|kilogrammi|quilos?)$/
const WORD_REPS = /^(reps?|ripetizioni|repeticiones|repetitions|wiederholungen|repeticoes)$/
const WORD_SPEED = /^(km\/h|kmh|kph|km h)$/

/** The numbers of a clause with what follows each: [{ at, end, v, unit }], sets such as 5x5 left out. */
function numbersOf(clause) {
  const out = []
  const rx = /(\d{1,4}(?:[.,]\d{1,2})?)\s*(km\/h|km h|kmh|kph|kgs?|kilogrammi|kilogramm|kilos?|chili|chilos?|quilos?|lbs?|pounds?|libras?|livres?|reps?|ripetizioni|repeticiones|repetitions|wiederholungen|repeticoes|x|×)?/g
  let m
  while ((m = rx.exec(clause))) {
    const unit = m[2] || ''
    // "5x5", "3 x 10": a scheme of sets, not a weight.
    if ((unit === 'x' || unit === '×') && /^\s*\d/.test(clause.slice(rx.lastIndex))) { rx.lastIndex += (clause.slice(rx.lastIndex).match(/^\s*\d+/) || [''])[0].length; continue }
    out.push({ at: m.index, end: m.index + m[0].length, v: num(m[1]), unit })
  }
  return out
}

const BW = /(\d(?:[.,]\d+)?)\s*(?:x|×|volte|veces|fois|times)?\s*(?:my |the |il |mio |el |mi |le |mon |mein |meu )?(?:bw|body ?weight|bodyweight|peso corporeo|peso corporal|poids du corps|korpergewicht)/g

/** A number that can be a target for a metric of this kind, or null. `unit` is the person's. */
function targetFrom(kind, n, unit) {
  const u = n.unit
  if (kind === 'speed') return WORD_SPEED.test(u) && n.v >= 4 && n.v <= 30 ? { v: n.v } : null
  if (kind === 'reps') {
    if (WORD_KG.test(u) || WORD_LB.test(u) || WORD_SPEED.test(u)) return null
    return n.v >= 1 && n.v <= 200 && Number.isInteger(n.v) ? { v: n.v } : null
  }
  // A weight on the bar: with its unit, or a bare number that can only be one.
  if (WORD_REPS.test(u) || WORD_SPEED.test(u) || u === 'x' || u === '×') return null
  const kg = WORD_KG.test(u), lb = WORD_LB.test(u)
  if (!kg && !lb && !(n.v >= 20 && n.v <= 500)) return null
  const asKg = lb ? n.v * LB : kg ? n.v : (unit === 'lb' ? n.v * LB : n.v)
  if (asKg < 10 || asKg > 600) return null
  return { v: unit === 'lb' ? asKg / LB : asKg }
}

/**
 * The targets in `texts` (an array of strings), for a person who weighs in `unit` ('kg' or 'lb') with
 * body weight `bw` (in `unit`, 0 when unknown):
 *   { targets: [{ key, kind, value, from }], perWeek }
 * `value` is in `unit` for a lift, in reps for reps and in km/h for a pace; `from` is the index of
 * the text it was found in. When a text names a target twice, the highest is kept.
 */
export function parseGoals(texts, { unit = 'kg', bw = 0 } = {}) {
  const found = new Map()
  let perWeek = 0
  const idx = names()
  ;(texts || []).forEach((raw, from) => {
    const text = norm(raw)
    // Clauses: a sentence, a line, or the two halves of "A, B" only when each has its own number.
    for (const clause of text.split(/[;!?\n]+|\.(?=\s|$)/)) {
      if (!clause.trim()) continue
      // How often they want to train.
      const f = clause.match(/(?:^|[^\d.,])(\d)(?![\d.,]?\d)\s*(?:x|times?|volte|veces|fois|mal|vezes|workouts?|sessions?|allenamenti|sedute|entrenamientos|seances|treinos|trainings?|einheiten)?\s*(?:\/|a|an|per|each|every|alla|la|por|par|pro|ogni|cada|chaque|je)?\s*(?:week|weekly|settimana|settimanali|semana|semanales|semaine|woche|wochen)\b/)
      if (f && Number(f[1]) >= 1 && Number(f[1]) <= 7) perWeek = Math.max(perWeek, Number(f[1]))
      const nums = numbersOf(clause)
      // Multiples of body weight: "squat 1.5x bodyweight".
      const mult = []
      let b
      BW.lastIndex = 0
      while ((b = BW.exec(clause))) mult.push({ at: b.index, end: b.index + b[0].length, x: num(b[1]) })
      for (const { m, rx } of idx) {
        const kind = m.type || 'load'
        for (const r of rx) {
          r.lastIndex = 0
          let hit
          while ((hit = r.exec(clause))) {
            const start = hit.index + hit[0].indexOf(hit[1]), end = start + hit[1].length
            let best = null
            // A number with a unit may be a few words away; a bare one has to stand next to the name
            // ("panca 100", "bench of 100"), or any number in the sentence would be a target.
            const take = (v, at, to, bare) => {
              const d = at >= end ? at - end : start - to
              if (d < 0 || d > (bare ? 6 : 40)) return
              if (!best || d < best.d) best = { v, d }
            }
            if (kind === 'load' && bw > 0) for (const x of mult) if (x.x > 0 && x.x <= 6) take(x.x * bw, x.at, x.end)
            for (const n of nums) {
              if (mult.some(x => n.at >= x.at && n.at < x.end)) continue   // the 1.5 of "1.5x bodyweight"
              const t = targetFrom(kind, n, unit)
              if (t) take(t.v, n.at, n.end, !n.unit)
            }
            if (best) {
              const v = kind === 'load' ? Math.round(best.v * 2) / 2 : best.v
              const old = found.get(m.key)
              if (!old || v > old.value) found.set(m.key, { key: m.key, kind, value: v, from })
            }
          }
        }
      }
    }
  })
  return { targets: [...found.values()], perWeek }
}
