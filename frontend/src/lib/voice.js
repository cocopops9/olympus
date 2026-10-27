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
const nativeSR = () => import('@capacitor-community/speech-recognition').then(m => m.SpeechRecognition)
const nativeTTS = () => import('@capacitor-community/text-to-speech').then(m => m.TextToSpeech)

/** Whether dictation can work here at all (the answer may still be no permission). */
export async function canListen() {
  if (MOBILE) {
    try { return !!(await (await nativeSR()).available()).available } catch { return false }
  }
  return !!WebRecognition()
}
export const canSpeak = () => MOBILE || (typeof window !== 'undefined' && 'speechSynthesis' in window)

/**
 * Listens once. `onText(text, final)` gets what was understood so far, `onEnd()` when it stops
 * (by itself after a pause, or by the returned stop()). Rejects with { code: 'permission' |
 * 'unavailable' } when it cannot start.
 */
export async function listen({ onText, onEnd, lang = voiceTag() } = {}) {
  if (MOBILE) {
    const SR = await nativeSR()
    if (!(await SR.available()).available) throw Object.assign(new Error('unavailable'), { code: 'unavailable' })
    let perm = await SR.checkPermissions()
    if (perm.speechRecognition !== 'granted') perm = await SR.requestPermissions()
    if (perm.speechRecognition !== 'granted') throw Object.assign(new Error('permission'), { code: 'permission' })
    let last = ''
    let done = false
    const finish = () => { if (done) return; done = true; subs.forEach(s => s.then(h => h.remove())); onText?.(last, true); onEnd?.() }
    const subs = [
      SR.addListener('partialResults', d => { last = d?.matches?.[0] || last; onText?.(last, false) }),
      SR.addListener('listeningState', d => { if (d?.status === 'stopped') finish() }),
    ]
    await SR.start({ language: lang, partialResults: true, popup: false, maxResults: 1 })
    return () => { SR.stop().catch(() => {}).finally(finish) }
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

let webUtterance = null
/** Reads `text` aloud; resolves when it is done (or stopped). */
export async function speak(text, { lang = voiceTag(), rate = 1 } = {}) {
  const say = speakable(text)
  if (!say) return
  if (MOBILE) {
    try { await (await nativeTTS()).speak({ text: say, lang, rate }) } catch { /* no voice installed */ }
    return
  }
  if (!canSpeak()) return
  window.speechSynthesis.cancel()
  await new Promise(resolve => {
    const u = new SpeechSynthesisUtterance(say)
    u.lang = lang
    u.rate = rate
    u.onend = u.onerror = () => resolve()
    webUtterance = u
    window.speechSynthesis.speak(u)
  })
}
export async function stopSpeaking() {
  if (MOBILE) { try { await (await nativeTTS()).stop() } catch { /* nothing playing */ } return }
  if (canSpeak()) window.speechSynthesis.cancel()
  webUtterance = null
}
