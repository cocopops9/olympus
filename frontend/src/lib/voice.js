// Olympus: talking to the AI coaches. Dictation (speech to text) for the message, and a voice mode
// where the coach's answers are read aloud and, once one has been read, the microphone listens
// for the next question. In the app, what is said is recorded here and written out on the server
// (Whisper); answers are read by the server's natural voices when it has them, by the phone's own
// voices (Capacitor text-to-speech) otherwise. In a browser with the Web Speech API, the browser's
// own recogniser and voices. The models only ever see text.
import { MOBILE } from './mobile.js'
import { getLang } from './i18n.js'
import { localVoicesOn, hasLocalVoice, speakLocal, stopLocal, voiceKey } from './local-voice.js'
import { api } from './api.js'
import { clipOf } from './wav.js'

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
const nativeTTS = () => import('@capacitor-community/text-to-speech').then(m => ({ p: m.TextToSpeech }))

// The app's own recorder (getUserMedia and MediaRecorder): what is said is recorded here and written
// out on the server (api/voice.js, Whisper). On the phone this replaces Android's recogniser, which
// on many phones answered every start with "client side error".
export const canRecord = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof window !== 'undefined' && typeof window.MediaRecorder === 'function'
const useRecorder = () => canRecord() && (MOBILE || !WebRecognition())

/** Whether dictation can work here at all (the answer may still be no permission). */
export async function canListen() {
  if (useRecorder()) return true
  return !MOBILE && !!WebRecognition()
}
export const canSpeak = () => MOBILE || (typeof window !== 'undefined' && 'speechSynthesis' in window)

const RECORD_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']
const blobToBase64 = blob => new Promise((resolve, reject) => {
  const r = new FileReader()
  r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ''))
  r.onerror = () => reject(r.error)
  r.readAsDataURL(blob)
})

// The person's own exercise names, asked for at each recording: set once by the app (App.jsx).
let hintOf = null
export const setVoiceHint = fn => { hintOf = typeof fn === 'function' ? fn : null }

// When to stop on its own: a pause after speaking, nothing said at all, or a long talk.
// A question is rarely said in one breath: the stop waits for a long pause (longer still before the
// first words are well under way), and a long talk is allowed.
// Waiting for that long pause costs more than the recogniser does, so the clip goes to the server
// early: after `specMs` of silence a first transcription starts while the wait goes on, and if
// nothing more is said the answer is already there when the pause ends. When that early text is a
// finished sentence (it ends in . ? or !) and the silence has lasted `sentenceMs`, the wait ends
// there instead of at the long pause. `specMax` caps the early requests of one question.
export const LISTEN = { pauseMs: 3200, earlyPauseMs: 4200, earlyMs: 2500, nothingMs: 9000, maxMs: 45000, calibrateMs: 350, specMs: 1100, sentenceMs: 2000, specMax: 3 }
/** Whether a transcript reads as a finished sentence: at least three words, closed by . ? or ! */
export const endsSentence = text => /\S+\s+\S+\s+\S+/.test(String(text || '').trim()) && /[.?!…]["')\]]*$/.test(String(text || '').trim())

/**
 * One question, recorded and written out. Speech is told from silence by the loudness of the
 * microphone against the room's own noise, measured in the first moments. The stop it returns
 * sends what was said so far; stop({ cancel: true }) throws it away.
 */
// The microphone stays open for a few seconds after a question, so the next one (voice mode
// listens again right after the answer) starts recording at once: opening it again took long
// enough on Android to lose the first words. The phone's noise suppression is off: it mangles
// speech more than the gym's noise troubles Whisper.
let held = null   // { stream, timer }
async function micStream() {
  if (held && held.stream.getTracks().every(x => x.readyState === 'live')) { clearTimeout(held.timer); return held.stream }
  held = null
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true, channelCount: 1 } })
  held = { stream, timer: null }
  return stream
}
function micLater(stream) {
  if (!held || held.stream !== stream) { stream.getTracks().forEach(x => x.stop()); return }
  clearTimeout(held.timer)
  held.timer = setTimeout(releaseMic, 15000)
}
/** Closes the microphone now (voice mode over). */
export function releaseMic() {
  if (!held) return
  clearTimeout(held.timer)
  held.stream.getTracks().forEach(x => x.stop())
  held = null
}

async function recordAndWrite({ onText, onEnd, onReady, lang }) {
  let stream
  try {
    stream = await micStream()
  } catch (e) {
    throw Object.assign(new Error(e?.name || 'unavailable'), { code: e?.name === 'NotAllowedError' || e?.name === 'SecurityError' ? 'permission' : 'unavailable' })
  }
  const type = RECORD_TYPES.find(m => window.MediaRecorder.isTypeSupported?.(m)) || ''
  let rec
  try { rec = new window.MediaRecorder(stream, type ? { mimeType: type, audioBitsPerSecond: 48000 } : undefined) } catch (e) {
    releaseMic()
    throw Object.assign(new Error('unavailable'), { code: 'unavailable' })
  }
  const chunks = []
  rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data) }
  const AC = window.AudioContext || window.webkitAudioContext
  let ac = null, analyser = null, buf = null, proc = null
  const pcm = []
  try {
    ac = new AC()
    analyser = ac.createAnalyser()
    analyser.fftSize = 1024
    buf = new Float32Array(analyser.fftSize)
    const src = ac.createMediaStreamSource(stream)
    src.connect(analyser)
    // The raw samples too: sent as an uncompressed 16 kHz clip (lib/wav.js), which the recognisers
    // hear better than a 48 kbps compressed one. The recorder stays as the fallback.
    try {
      proc = ac.createScriptProcessor(4096, 1, 1)
      proc.onaudioprocess = e => { if (!finished) pcm.push(new Float32Array(e.inputBuffer.getChannelData(0))) }
      src.connect(proc)
      proc.connect(ac.destination)
    } catch { proc = null }
    try { await ac.resume?.() } catch { /* the first sound resumes it */ }
  } catch { analyser = null; proc = null }
  const t0 = Date.now()
  let spoke = !analyser, lastVoice = t0, firstVoice = t0, floor = null, cancelled = false, finished = false, sent = false
  const loud = () => { analyser.getFloatTimeDomainData(buf); let sum = 0; for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]; return Math.sqrt(sum / buf.length) }
  const done = (text, error) => { if (finished) return; finished = true; onText?.(text || '', true); onEnd?.(error || null) }
  const release = () => { clearInterval(tick); micLater(stream); try { proc?.disconnect() } catch { /* gone */ } try { ac?.close() } catch { /* closed */ } }
  // The clip of what was said up to the last voice, or null when there is too little to send.
  const clipNow = () => {
    const rate = ac?.sampleRate || 48000
    const wav = proc && pcm.length ? clipOf(pcm, rate, lastVoice > t0 ? { fromMs: firstVoice - t0, toMs: lastVoice - t0 } : {}) : null
    const blob = wav || new Blob(chunks, { type: rec.mimeType || type || 'audio/webm' })
    return blob.size < 1200 ? null : blob
  }
  const transcribe = async blob => {
    const data = await blobToBase64(blob)
    const r = await api('/api/voice/transcribe', { method: 'POST', body: JSON.stringify({ data, type: blob.type, lang, hint: (() => { try { return hintOf?.() || '' } catch { return '' } })() }), timeout: 25000 })
    return r?.text || ''
  }
  // The early transcription: { at: the lastVoice it covers, text: null until it is back, promise }.
  let spec = null, specs = 0
  const startSpec = () => {
    const blob = clipNow()
    if (!blob) return
    specs++
    const mine = { at: lastVoice, text: null, promise: null }
    mine.promise = transcribe(blob).then(text => { mine.text = text; return text })
    mine.promise.catch(() => { if (spec === mine) spec = null })
    spec = mine
  }
  const specBusy = () => !!spec && spec.text == null
  const send = async () => {
    if (sent) return
    sent = true
    release()
    if (cancelled || !spoke) return done('')
    // Nothing more was said since the early request went out: its text is the answer.
    const early = spec && spec.at === lastVoice ? spec : null
    const blob = early ? null : clipNow()
    if (!early && !blob) return done('')
    try {
      // A failed early request is simply made again, as a normal one.
      const again = () => { const b = clipNow(); return b ? transcribe(b) : '' }
      const text = early ? await early.promise.catch(again) : await transcribe(blob)
      done(cancelled ? '' : text)
    } catch (e) { done('', cancelled ? null : e?.message || 'transcription failed') }
  }
  const stop = () => { if (rec.state !== 'inactive') { try { rec.stop() } catch { send() } } else send() }
  rec.onstop = send
  const tick = setInterval(() => {
    const now = Date.now()
    if (analyser) {
      const v = loud()
      if (now - t0 < LISTEN.calibrateMs) { floor = floor == null ? v : (floor + v) / 2; return }
      const threshold = Math.max(0.008, (floor || 0) * 2.2)
      if (v > threshold) { if (!spoke) { spoke = true; firstVoice = now } lastVoice = now }
      const pause = spoke && lastVoice - firstVoice < LISTEN.earlyMs ? LISTEN.earlyPauseMs : LISTEN.pauseMs
      if (spoke && now - lastVoice > pause) return stop()
      const quiet = now - lastVoice
      if (spoke && !finished && !sent && quiet > LISTEN.specMs && specs < LISTEN.specMax && (!spec || spec.at !== lastVoice) && !specBusy()) startSpec()
      if (spoke && spec && spec.at === lastVoice && spec.text != null && quiet > LISTEN.sentenceMs && endsSentence(spec.text)) return stop()
      if (!spoke && now - t0 > LISTEN.nothingMs) return stop()
    } else if (now - t0 > 7000) return stop()
    if (now - t0 > LISTEN.maxMs) stop()
  }, 50)
  rec.start(250)
  try { onReady?.() } catch { /* the caller's own */ }
  return ({ cancel = false } = {}) => { if (cancel) cancelled = true; else spoke = spoke || chunks.length > 0; stop() }
}

/**
 * Listens once. `onText(text, final)` gets what was understood (on the web as it is said; on the
 * phone once, at the end), `onEnd(error)` when it stops: by itself after a pause, by the returned
 * stop(), or with `error` (a short reason, for a message) when the recogniser failed. Rejects with
 * { code: 'permission' | 'unavailable' } when it cannot start.
 */
export async function listen({ onText, onEnd, onReady, lang = voiceTag() } = {}) {
  if (useRecorder()) return recordAndWrite({ onText, onEnd, onReady, lang })
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
    rec.onstart = () => { try { onReady?.() } catch { /* the caller's own */ } resolve(() => rec.stop()) }
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
// Hercules a man's voice; Athena a woman's. The server reads with a natural voice of that kind when
// it has one (api/voice.js); otherwise a voice of the right kind is picked from the phone's own
// ones for the language when one can be told apart by its name (Google's voices are named
// it-it-x-itd-local and so on, a code per speaker). The pitch is left alone: lowered, the phone's
// voices sound like a robot.
export const VOICES = {
  chiron: { male: true, rate: 0.95 },
  hercules: { male: true, rate: 1 },
  athena: { male: false, rate: 1 },
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

// The server's voice: unknown until asked, then on or off for the rest of the session.
let serverVoice = null
let playing = null   // { audio, stop } of what the server's voice is reading now
let speakRun = 0
let voiceFails = 0

// Short pieces, a sentence or a few: the first is heard while the next is being made.
export function pieces(text, max = 800) {
  const sentences = String(text).match(/[^.!?…\n]+[.!?…]*[\s\n]*/g) || [String(text)]
  const clean = sentences.map(x => x.trim()).filter(Boolean)
  if (clean.length <= 1) return clean.flatMap(x => x.length > max ? x.match(new RegExp('.{1,' + max + '}', 'g')) : [x])
  // The first sentence alone, so it is heard soon; the rest in one request, so the server's quota
  // is spent twice at most on an answer.
  const rest = clean.slice(1).join(' ')
  return [clean[0], ...(rest.length > max ? rest.match(new RegExp('.{1,' + max + '}', 'g')) : [rest])]
}

async function speakOnServer(say, lang, who, run, onStart) {
  // One more try when a piece fails: a cold start or a busy moment is not a reason for the phone's voice.
  const once = piece => api('/api/voice/speak', { method: 'POST', body: JSON.stringify({ text: piece, lang, who }), timeout: 25000 })
  const ask = piece => once(piece).catch(e => ([501, 404, 401, 429].includes(e?.status) ? Promise.reject(e) : once(piece)))
  const parts = pieces(say)
  let next = ask(parts[0])
  for (let i = 0; i < parts.length; i++) {
    let r
    try { r = await next } catch (e) {
      if (e?.status === 501 || e?.status === 404 || e?.status === 401) serverVoice = false
      // No quota left (429): the phone's voice at once, and the server's is not asked again for a while.
      else if (e?.status === 429) { serverVoice = false; setTimeout(() => { serverVoice = null; voiceFails = 0 }, 5 * 60 * 1000) }
      // A voice that fails twice in a row (a quota used up, no connection) rests for ten minutes.
      else if (i === 0 && ++voiceFails >= 3) { serverVoice = false; setTimeout(() => { serverVoice = null; voiceFails = 0 }, 2 * 60 * 1000) }
      if (i === 0) return false
      return true
    }
    voiceFails = 0
    if (run !== speakRun) return true
    serverVoice = true
    next = i + 1 < parts.length ? ask(parts[i + 1]) : null
    next?.catch(() => {})
    await new Promise(resolve => {
      const audio = new Audio('data:' + (r.type || 'audio/mpeg') + ';base64,' + r.audio)
      const end = () => { if (playing?.audio === audio) playing = null; resolve() }
      playing = { audio, stop: () => { audio.pause(); end() } }
      audio.onended = audio.onerror = end
      audio.onplaying = () => { if (onStart) { const f = onStart; onStart = null; f() } }
      audio.play().catch(end)
    })
    if (run !== speakRun) return true
  }
  return true
}

let nativeVoiceList = null
let webUtterance = null
/** Reads `text` aloud as `who` (VOICES); resolves when it is done (or stopped). */
export async function speak(text, { lang = voiceTag(), rate, who, onStart } = {}) {
  // onStart: called once, when the sound really begins (the server's voice can take a few seconds).
  let started = false
  const begin = () => { if (!started) { started = true; onStart?.() } }
  const say = speakable(text)
  if (!say) return
  const run = ++speakRun
  const kind = VOICES[who] || null
  const pace = rate ?? kind?.rate ?? 1
  // A man's offline voice on the phone (lib/local-voice.js): first for Chiron and Hercules, with no
  // quota and no wait.
  const key = voiceKey()
  if (kind?.male && localVoicesOn() && hasLocalVoice(key)) {
    try { await speakLocal(say, { key, speed: who === 'chiron' ? 0.92 : 1, onStart: begin }); return } catch { /* the next voice */ }
    if (run !== speakRun) return
  }
  if (kind && serverVoice === null && warming) await Promise.race([warming, new Promise(r => setTimeout(r, 6000))])
  if (kind && serverVoice === true) {
    try { if (await speakOnServer(say, lang, who, run, begin)) return } catch { /* the phone's voice instead */ }
    if (run !== speakRun) return
  }
  if (MOBILE) {
    try {
      const { p: TTS } = await nativeTTS()
      let voice = -1
      if (kind) {
        if (!nativeVoiceList) { try { nativeVoiceList = (await TTS.getSupportedVoices()).voices || [] } catch { nativeVoiceList = [] } }
        voice = pickVoice(nativeVoiceList, lang, kind.male)
      }
      begin()
      // No man's voice installed for the language: the default one (a woman's on most phones) read
      // lower, so Chiron and Hercules still sound like men.
      const pitch = kind?.male && voice < 0 ? 0.78 : 1
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
    }
    u.onstart = begin
    u.onend = u.onerror = () => resolve()
    webUtterance = u
    window.speechSynthesis.speak(u)
  })
}
/** Asks the server once whether it has a voice, so the first answer is not kept waiting. */
let warming = null
export function warmVoice() {
  if (serverVoice !== null || warming) return warming
  warming = api('/api/voice').then(r => { serverVoice = !!r?.speak }, () => {}).finally(() => { warming = null })
  return warming
}
export async function stopSpeaking() {
  speakRun++
  playing?.stop()
  stopLocal()
  if (MOBILE) { try { const { p: TTS } = await nativeTTS(); await TTS.stop() } catch { /* nothing playing */ } return }
  if (canSpeak()) window.speechSynthesis.cancel()
  webUtterance = null
}
