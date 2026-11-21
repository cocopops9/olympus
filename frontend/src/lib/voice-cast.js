// Olympus: who speaks with which voice, in each language of the app.
//
// Kokoro (hexgrad/Kokoro-82M v1.0, Apache-2.0, read on the phone by sherpa-onnx, the "kokoro"
// pack of the voices release) is the more natural voice, for the languages it has: English,
// Spanish, French, Italian, Hindi, Brazilian Portuguese (also read for Portugal's Portuguese)
// and Mandarin. Speaker ids are those of sherpa-onnx's kokoro-multi-lang-v1_0 (its documentation,
// "sid -> name"). Each coach gets a voice of their own: Chiron the deepest man's voice, Hercules
// another man's, Athena a woman's, Calliope another woman's. Where Kokoro has no distinct voice of
// the right kind for a language (French has one woman's voice only), that coach keeps the voice
// the app had before (lib/voice.js: the Piper voice for the men, the server's or the phone's for
// the women), and `pitch` keeps two coaches on one model apart.
//
// `accent`: the espeak-ng language Kokoro reads the text with; empty for English and Chinese,
// which it reads with its own lexicons.
export const KOKORO = 'kokoro'

const K = (sid, speed = 1, pitch = 1) => ({ engine: KOKORO, sid, speed, pitch })
const CAST = {
  en: { accent: '', chiron: K(17, 0.92, 0.94), hercules: K(16), athena: K(3), calliope: K(21) },        // am_onyx, am_michael, af_heart, bf_emma
  es: { accent: 'es', chiron: K(53, 0.92, 0.94), hercules: K(29), athena: K(28), calliope: null },     // em_santa, em_alex, ef_dora
  fr: { accent: 'fr-fr', chiron: null, hercules: null, athena: K(30), calliope: null },               // ff_siwis
  it: { accent: 'it', chiron: K(36, 0.9, 0.9), hercules: null, athena: K(35), calliope: null },       // im_nicola, if_sara
  hi: { accent: 'hi', chiron: K(33, 0.92, 0.94), hercules: K(34), athena: K(31), calliope: K(32) },   // hm_omega, hm_psi, hf_alpha, hf_beta
  pt: { accent: 'pt-br', chiron: K(44, 0.92, 0.94), hercules: K(43), athena: K(42), calliope: null }, // pm_santa, pm_alex, pf_dora
  zh: { accent: '', chiron: K(49, 0.92, 0.94), hercules: K(50), athena: K(47), calliope: K(48) },     // zm_yunjian, zm_yunxi, zf_xiaoxiao, zf_xiaoyi
}

// The voice a coach has where Kokoro gives them none: the app's earlier voices, kept apart.
// Chiron reads the Piper man's voice lower and slower than Hercules does; Calliope's woman's
// voice is set a little higher than Athena's.
const BEFORE = {
  chiron: { engine: 'before', speed: 0.9, pitch: 0.86 },
  hercules: { engine: 'before', speed: 1, pitch: 1.04 },
  athena: { engine: 'before', speed: 1, pitch: 1 },
  calliope: { engine: 'before', speed: 1, pitch: 1.1 },
}

/** The Kokoro languages of the app, by the app's language code. */
export const kokoroLang = lang => {
  const base = String(lang || '').split('-')[0]
  return CAST[base] ? base : null
}

export const PIPER = 'piper'

/**
 * The voice `who` speaks with in `lang` (the app's language code): { engine: 'kokoro', sid,
 * speed, pitch, accent }, { engine: 'piper', model, sid, speed, pitch } (a coach's own Piper
 * voice), or { engine: 'before', speed, pitch } (the app's earlier voices).
 *
 * `own`: the coaches' own Piper voices of the language, as the voices list publishes them
 * (manifest.coaches[lang].who, .github/voices/coach-pack.py): { hercules: { model: 'm1', sid } }
 * for a model of the coaches pack, { athena: { own: true, sid: 2 } } for another speaker of the
 * language's own voice. They come after Kokoro and before the earlier voices.
 */
export function castVoice(who, lang, own = null) {
  const base = kokoroLang(lang)
  const k = base && CAST[base][who]
  if (k) return { ...k, accent: CAST[base].accent }
  const p = own?.[who]
  if (p && Number.isInteger(p.sid) && p.sid >= 0 && (p.own === true || /^m[1-9]$/.test(String(p.model || '')))) {
    return { engine: PIPER, model: p.own === true ? '' : p.model, sid: p.sid, speed: Number(p.speed) > 0 ? Number(p.speed) : 1, pitch: Number(p.pitch) > 0 ? Number(p.pitch) : 1 }
  }
  return { ...(BEFORE[who] || BEFORE.hercules) }
}

/** What tells two voices apart: the model and speaker, and how high they are played. */
export const voiceIdentity = v => (v.engine === KOKORO ? `kokoro:${v.sid}` : v.engine === PIPER ? `piper:${v.model || 'own'}:${v.sid}` : 'before') + '@' + v.pitch
