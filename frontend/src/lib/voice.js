// Olympus: talking to the AI coaches. Dictation (speech to text) for the message, and a voice mode
// where the coach's answers are read aloud and, once one has been read, the microphone listens
// for the next question. Done on the device: the phone's own speech recogniser and voice
// (Capacitor plugins @capacitor-community/speech-recognition and text-to-speech) in the app, the
// browser's Web Speech API on the web. The models only ever see text.
import { MOBILE } from './mobile.js'
import { getLang } from './i18n.js'

// BCP 47 tags for the app's languages: recognisers want a region.
const TAGS = {
  en: 'en-US', it: 'it-IT', es: 'es-ES', fr: 'fr-FR', de: 'de-DE', pt: 'pt-PT', 'pt-BR': 'pt-BR', ru: 'ru-RU', uk: 'uk-UA',
  pl: 'pl-PL', tr: 'tr-TR', hu: 'hu-HU', ar: 'ar-SA', bn: 'bn-IN', hi: 'hi-IN', ko: 'ko-KR', th: 'th-TH', zh: 'zh-CN', 'zh-TW': 'zh-TW',
}
export const voiceTag = (lang = getLang()) => TAGS[lang] || TAGS[String(lang).split('-')[0]] || 'en-US'

const WebRecognition = () => (typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null)
// A Capacitor plugin is a proxy that answers every property, `then` included, with a call to the
// native side. Handed back from a promise as it is, the promise takes it for a promise of its own
// and waits on that `then` forever: every voice feature hung without an error. So the plugins are
// handed over inside an object ({ p }), never returned from an async function or a then() by
// themselves, and only ever awaited through their methods.
const nativeSR = () => import('@capacitor-community/speech-recognition').then(m => ({ p: m.SpeechRecognition }))
const nativeTTS = () => import('@capacitor-community/text-to-speech').then(m => ({ p: m.TextToSpeech }))

/** Whether dictation can work here at all (the answer may still be no permission). */
export async function canListen() {
  if (MOBILE) {
    try { const { p: SR } = await nativeSR(); return !!(await SR.available()).available } catch { return false }
  }
  return !!WebRecognition()
}
export const canSpeak = () => MOBILE || (typeof window !== 'undefined' && 'speechSynthesis' in window)

/**
 * Listens once. `onText(text, final)` gets what was understood (on the web as it is said; on the
 * phone once, at the end), `onEnd(error)` when it stops: by itself after a pause, by the returned
 * stop(), or with `error` (a short reason, for a message) when the recogniser failed. Rejects with
 * { code: 'permission' | 'unavailable' } when it cannot start.
 */
export async function listen({ onText, onEnd, lang = voiceTag() } = {}) {
  if (MOBILE) {
    const { p: SR } = await nativeSR()
    if (!(await SR.available()).available) throw Object.assign(new Error('unavailable'), { code: 'unavailable' })
    let perm = await SR.checkPermissions()
    if (perm.speechRecognition !== 'granted') perm = await SR.requestPermissions()
    if (perm.speechRecognition !== 'granted') throw Object.assign(new Error('permission'), { code: 'permission' })
    // Without partial results the plugin answers start() itself, once: with what was said, or
    // with the recogniser's error ("No match" when nothing was said). With them, start() returns
    // at once and an error after that never reaches the app, so a pause or a silence left the
    // microphone "on" for ever: the reason voice mode seemed dead.
    let done = false
    const finish = (text, error) => {
      if (done) return
      done = true
      clearTimeout(guard)
      onText?.(text || '', true)
      onEnd?.(error || null)
    }
    const guard = setTimeout(() => { SR.stop().catch(() => {}); finish('') }, 30000)
    SR.start({ language: lang, partialResults: false, popup: false, maxResults: 1 }).then(
      r => finish(r?.matches?.[0] || ''),
      e => {
        const why = String(e?.message || e || '')
        // Nothing said, or said too softly: a silence, not a failure.
        finish('', /no match|no speech|timeout/i.test(why) ? null : why)
      })
    // Stopped by hand: what was said so far comes as the result; if the recogniser never answers,
    // the stop still ends it.
    return () => { SR.stop().catch(() => {}); setTimeout(() => finish(''), 2500) }
  }
  const R = WebRecognition()
  if (!R) throw Object.assign(new Error('unavailable'), { code: 'unavailable' })
  const rec = new R()
  rec.lang = lang
  rec.interimResults = true
  rec.continuous = false
  let text = ''
  rec.onresult = e => {
    text = [...e.results].map(r => r[0]?.transcript || '').join(' ').trim()
    onText?.(text, e.results[e.results.length - 1]?.isFinal)
  }
  return new Promise((resolve, reject) => {
    rec.onerror = e => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') reject(Object.assign(new Error('permission'), { code: 'permission' })) }
    rec.onend = () => { onText?.(text, true); onEnd?.() }
    rec.onstart = () => resolve(() => rec.stop())
    try { rec.start() } catch (e) { reject(Object.assign(e, { code: 'unavailable' })) }
  })
}

/** The answer as it should be heard: no Markdown marks, no action blocks, no links. */
export function speakable(text) {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_#>`]+/g, '')
    .replace(/^\s*[-•]\s+/gm, '')
    .replace(/\s+\n/g, '\n')
    .trim()
}

// Who is talking: Chiron, an old giant of a centaur, has a deep man's voice in every language;
// Hercules a man's voice; Athena a woman's. A voice of the right kind is picked from the ones the
// phone has for the language when one can be told apart by its name (Google's voices are named
// it-it-x-itd-local and so on, a code per speaker), and the pitch does the rest.
export const VOICES = {
  chiron: { male: true, pitch: 0.72, rate: 0.93 },
  hercules: { male: true, pitch: 0.88, rate: 1 },
  athena: { male: false, pitch: 1.05, rate: 1 },
}
// Speakers of Google's voices known to be men, by the code in the voice's name.
const MALE_CODES = ['iol', 'iom', 'tpd', 'rjs', 'gbd', 'aud', 'itd', 'itc', 'eed', 'esd', 'frd', 'frb', 'deg', 'ptd', 'pmj', 'jmn', 'rud', 'ruf']
const FEMALE_CODES = ['sfg', 'tpf', 'tpc', 'gba', 'gbc', 'itb', 'kda', 'eea', 'eec', 'eef', 'esc', 'esf', 'fra', 'frc', 'vlf', 'dea', 'deb', 'nfh', 'afs', 'ptb', 'dfc']
const codeOf = name => (String(name || '').toLowerCase().match(/-x-([a-z]{3})(?:-|$)/) || [])[1] || null
const WEB_MALE = /\b(male|david|mark|george|daniel|diego|pablo|jorge|cosimo|luca|paul|thomas|stefan|hans|pavel|yuri|alex|fred)\b/i
const WEB_FEMALE = /\b(female|zira|susan|hazel|helena|elsa|laura|paulina|lucia|julie|hortense|katja|irina|samantha|victoria|karen|moira|tessa)\b/i

/** Of `voices` ({ name, lang }), the index of one for `lang` of the kind `male`, or -1. */
export function pickVoice(voices, lang, male) {
  const base = String(lang || '').slice(0, 2).toLowerCase()
  const fits = (voices || []).map((v, i) => ({ v, i })).filter(({ v }) => String(v?.lang || '').toLowerCase().replace('_', '-').startsWith(base))
  const is = v => {
    const code = codeOf(v.name || v.voiceURI)
    if (code) return MALE_CODES.includes(code) ? 'm' : FEMALE_CODES.includes(code) ? 'f' : null
    const n = String(v.name || '')
    return WEB_FEMALE.test(n) || /female/i.test(n) ? 'f' : WEB_MALE.test(n) ? 'm' : null
  }
  const want = male ? 'm' : 'f'
  const exact = fits.filter(({ v }) => is(v) === want)
  // The phone's own voice for the language region first, then one that works offline.
  const tag = String(lang || '').toLowerCase()
  exact.sort((a, b) => (String(b.v.lang).toLowerCase().replace('_', '-') === tag) - (String(a.v.lang).toLowerCase().replace('_', '-') === tag)
    || (/-local$/.test(b.v.name || '') - /-local$/.test(a.v.name || '')))
  return exact.length ? exact[0].i : -1
}

let nativeVoiceList = null
let webUtterance = null
/** Reads `text` aloud as `who` (VOICES); resolves when it is done (or stopped). */
export async function speak(text, { lang = voiceTag(), rate, who } = {}) {
  const say = speakable(text)
  if (!say) return
  const kind = VOICES[who] || null
  const pace = rate ?? kind?.rate ?? 1
  if (MOBILE) {
    try {
      const { p: TTS } = await nativeTTS()
      let voice = -1
      if (kind) {
        if (!nativeVoiceList) { try { nativeVoiceList = (await TTS.getSupportedVoices()).voices || [] } catch { nativeVoiceList = [] } }
        voice = pickVoice(nativeVoiceList, lang, kind.male)
      }
      // A man's voice found: a little lower still. None: the pitch alone makes it deeper.
      const pitch = kind ? (voice >= 0 ? Math.min(1, kind.pitch + 0.12) : kind.pitch) : 1
      await TTS.speak({ text: say, lang, rate: pace, pitch, ...(voice >= 0 ? { voice } : {}) })
    } catch { /* no voice installed */ }
    return
  }
  if (!canSpeak()) return
  window.speechSynthesis.cancel()
  await new Promise(resolve => {
    const u = new SpeechSynthesisUtterance(say)
    u.lang = lang
    u.rate = pace
    if (kind) {
      const list = window.speechSynthesis.getVoices?.() || []
      const i = pickVoice(list, lang, kind.male)
      if (i >= 0) u.voice = list[i]
      u.pitch = i >= 0 ? Math.min(1, kind.pitch + 0.12) : kind.pitch
    }
    u.onend = u.onerror = () => resolve()
    webUtterance = u
    window.speechSynthesis.speak(u)
  })
}
export async function stopSpeaking() {
  if (MOBILE) { try { const { p: TTS } = await nativeTTS(); await TTS.stop() } catch { /* nothing playing */ } return }
  if (canSpeak()) window.speechSynthesis.cancel()
  webUtterance = null
}
