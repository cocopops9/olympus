// Olympus: talking to the AI coaches. Dictation (speech to text) for the message, and a voice mode
// where the coach's answers are read aloud and, once one has been read, the microphone listens
// for the next question. In the app, what is said is recorded here and written out on the server
// (Whisper); answers are read by the server's natural voices when it has them, by the phone's own
// voices (Capacitor text-to-speech) otherwise. In a browser with the Web Speech API, the browser's
// own recogniser and voices. The models only ever see text.
import { MOBILE } from './mobile.js'
import { getLang } from './i18n.js'
import { localVoicesOn, hasLocalVoice, speakLocal, stopLocal, warmLocal, voiceKey, audioNormal, coachVoices, coachesKey } from './local-voice.js'
import { speechParts } from './speech-text.js'
import { castVoice, KOKORO, PIPER } from './voice-cast.js'
import { api } from './api.js'
import { clipOf } from './wav.js'
import { textLang } from './text-lang.js'

// BCP 47 tags for the app's languages: recognisers want a region.
const TAGS = {
  en: 'en-US', it: 'it-IT', es: 'es-ES', fr: 'fr-FR', de: 'de-DE', pt: 'pt-PT', 'pt-BR': 'pt-BR', ru: 'ru-RU', uk: 'uk-UA',
  pl: 'pl-PL', tr: 'tr-TR', hu: 'hu-HU', ar: 'ar-SA', bn: 'bn-IN', hi: 'hi-IN', ko: 'ko-KR', th: 'th-TH', zh: 'zh-CN', 'zh-TW': 'zh-TW',
}
export const voiceTag = (lang = getLang()) => TAGS[lang] || TAGS[String(lang).split('-')[0]] || 'en-US'
// The language a line is read in: the one it is written in (lib/text-lang.js), the app's when that
// is unclear. A coach answers in the language the person spoke, which need not be the app's.
export const lineLang = text => textLang(text, getLang())

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
//
// specMs and sentenceMs are set from how people pause: inside a spoken turn most pauses are under
// half a second, and voice assistants end a turn after about 0.5 to 0.8 s of silence. A first
// transcription after 0.7 s, and the end of the wait 1 s into the silence when that text is a
// finished sentence, end a whole question about a second after the last word (it was 2 s or more);
// a sentence left open still waits for the long pause, so a slow speaker is not cut short.
//
// The room's noise is measured all along, not only in the first moments: the quietest level of the
// last `floorMs` (the noise between words; a "minimum statistics" floor). The phone's automatic gain
// raises the noise while nobody speaks, and against a floor taken once at the start that louder
// noise counted as speech: Chiron stayed on "listening" for 25 s after the question ended
// (2026-11-22, the first clip reached the server 40 s after he was opened). 3 s holds several
// pauses between words, so speech itself never becomes the floor.
// heardMs: the silence after which a question whose early transcript is back (two words at least)
// is taken as finished, punctuation or not. Whisper often leaves a spoken question unpunctuated, and
// it then waited for pauseMs (3.2 s, 4.2 s for a short one): in the function's log (2026-11-27) the
// question went to Chiron 1.7 s and 2.9 s after its transcript was back. Pauses inside a turn are
// mostly well under a second; 1.5 s is the assumption that keeps most of them.
export const LISTEN = { pauseMs: 3200, earlyPauseMs: 4200, earlyMs: 2500, nothingMs: 9000, maxMs: 45000, calibrateMs: 350, specMs: 700, sentenceMs: 1000, heardMs: 1500, specMax: 3, floorMs: 3000 }

/** The voice threshold over a room whose noise changes: `hear(level, now)` says whether it is voice. */
export function voiceGate({ calibrateMs = LISTEN.calibrateMs, floorMs = LISTEN.floorMs, ratio = 2.2, least = 0.008, t0 = 0 } = {}) {
  let floor = null     // the room measured in the first moments
  const recent = []   // [time, level] of the last floorMs
  return {
    hear(level, now) {
      recent.push([now, level])
      while (recent.length && now - recent[0][0] > floorMs) recent.shift()
      if (now - t0 < calibrateMs) { floor = floor == null ? level : (floor + level) / 2; return false }
      let quietest = Infinity
      for (const [, v] of recent) if (v < quietest) quietest = v
      return level > Math.max(least, Math.max(floor || 0, quietest) * ratio)
    },
  }
}
/** Whether a transcript reads as a finished sentence: at least three words, closed by . ? or ! */
/** Whether an early transcript says enough to end the question on a pause (LISTEN.heardMs). */
export const saysEnough = text => /\S+\s+\S+/.test(String(text || '').trim())
export const endsSentence = text => /\S+\s+\S+\s+\S+/.test(String(text || '').trim()) && /[.?!…]["')\]]*$/.test(String(text || '').trim())

/**
 * One question, recorded and written out. Speech is told from silence by the loudness of the
 * microphone against the room's own noise, measured in the first moments. The stop it returns
 * sends what was said so far; stop({ cancel: true }) throws it away. `onHeard()` is called when
 * the recording ends with something said and is being written out, so the screen can say so.
 */
// The microphone stays open for a few seconds after a question, so the next one (voice mode
// listens again right after the answer) starts recording at once: opening it again took long
// enough on Android to lose the first words. The phone's noise suppression is off: it mangles
// speech more than the gym's noise troubles Whisper.
//
// While the microphone is open, Android keeps the phone's audio in "call" mode, and music playing
// meanwhile sounds thin and odd: so it is closed as soon as voice mode stops listening
// (releaseMic), and never kept by a request that was still opening it when voice mode closed.
let held = null   // { stream, timer }
let micEpoch = 0  // counts releaseMic(): a microphone that opens after one is closed at once
async function micStream() {
  if (held && held.stream.getTracks().every(x => x.readyState === 'live')) { clearTimeout(held.timer); return held.stream }
  held = null
  const epoch = micEpoch
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true, channelCount: 1 } })
  if (epoch !== micEpoch) {
    stream.getTracks().forEach(x => x.stop())
    throw Object.assign(new Error('closed'), { name: 'AbortError' })
  }
  held = { stream, timer: null }
  return stream
}
function micLater(stream) {
  if (!held || held.stream !== stream) { stream.getTracks().forEach(x => x.stop()); audioNormal(); return }
  clearTimeout(held.timer)
  held.timer = setTimeout(releaseMic, 15000)
}
/** Closes the microphone now (voice mode over). */
export function releaseMic() {
  micEpoch++
  if (!held) return
  clearTimeout(held.timer)
  held.stream.getTracks().forEach(x => x.stop())
  held = null
  audioNormal()
}

// The app in the background never keeps the microphone (nor the phone in call mode).
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') releaseMic() })

async function recordAndWrite({ onText, onEnd, onReady, onHeard, lang }) {
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
  let spoke = !analyser, lastVoice = t0, firstVoice = t0, cancelled = false, finished = false, sent = false
  const gate = voiceGate({ t0 })
  const loud = () => { analyser.getFloatTimeDomainData(buf); let sum = 0; for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]; return Math.sqrt(sum / buf.length) }
  // `said`: the language the server heard it in (api/voice.js transcribeWithLang), '' when unknown.
  const done = (text, error, said = '') => { if (finished) return; finished = true; onText?.(text || '', true, said || ''); onEnd?.(error || null) }
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
    return { text: r?.text || '', lang: r?.lang || '' }
  }
  // The early transcription: { at: the lastVoice it covers, text: null until it is back, promise }.
  let spec = null, specs = 0
  const startSpec = () => {
    const blob = clipNow()
    if (!blob) return
    specs++
    const mine = { at: lastVoice, text: null, promise: null }
    mine.promise = transcribe(blob).then(r => { mine.text = r.text; return r })
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
    try { onHeard?.() } catch { /* the caller's own */ }
    try {
      // A failed early request is simply made again, as a normal one.
      const again = () => { const b = clipNow(); return b ? transcribe(b) : { text: '', lang: '' } }
      const r = early ? await early.promise.catch(again) : await transcribe(blob)
      done(cancelled ? '' : r.text, null, cancelled ? '' : r.lang)
    } catch (e) { done('', cancelled ? null : e?.message || 'transcription failed') }
  }
  const stop = () => { if (rec.state !== 'inactive') { try { rec.stop() } catch { send() } } else send() }
  rec.onstop = send
  const tick = setInterval(() => {
    const now = Date.now()
    if (analyser) {
      const voice = gate.hear(loud(), now)
      if (now - t0 < LISTEN.calibrateMs) return
      if (voice) { if (!spoke) { spoke = true; firstVoice = now } lastVoice = now }
      const pause = spoke && lastVoice - firstVoice < LISTEN.earlyMs ? LISTEN.earlyPauseMs : LISTEN.pauseMs
      if (spoke && now - lastVoice > pause) return stop()
      const quiet = now - lastVoice
      if (spoke && !finished && !sent && quiet > LISTEN.specMs && specs < LISTEN.specMax && (!spec || spec.at !== lastVoice) && !specBusy()) startSpec()
      if (spoke && spec && spec.at === lastVoice && spec.text != null && ((quiet > LISTEN.sentenceMs && endsSentence(spec.text)) || (quiet > LISTEN.heardMs && saysEnough(spec.text)))) return stop()
      if (!spoke && now - t0 > LISTEN.nothingMs) return stop()
    } else if (now - t0 > 7000) return stop()
    if (now - t0 > LISTEN.maxMs) stop()
  }, 50)
  rec.start(250)
  try { onReady?.() } catch { /* the caller's own */ }
  return ({ cancel = false } = {}) => { if (cancel) cancelled = true; else spoke = spoke || chunks.length > 0; stop() }
}

/**
 * Listens once. `onText(text, final, lang)` gets what was understood (on the web as it is said; on
 * the phone once, at the end, with the language the server heard it in, '' when unknown), `onHeard()` once the person has finished and it is being written out,
 * `onEnd(error)` when it stops: by itself after a pause, by the returned
 * stop(), or with `error` (a short reason, for a message) when the recogniser failed. Rejects with
 * { code: 'permission' | 'unavailable' } when it cannot start.
 */
export async function listen({ onText, onEnd, onReady, onHeard, lang = voiceTag() } = {}) {
  if (useRecorder()) return recordAndWrite({ onText, onEnd, onReady, onHeard, lang })
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
    rec.onspeechend = () => { if (text) try { onHeard?.() } catch { /* the caller's own */ } }
    rec.onend = () => { onText?.(text, true); onEnd?.() }
    rec.onstart = () => { try { onReady?.() } catch { /* the caller's own */ } resolve(() => rec.stop()) }
    try { rec.start() } catch (e) { reject(Object.assign(e, { code: 'unavailable' })) }
  })
}

/**
 * How long after its sound began a line may take before the one waiting on it gives up and goes on
 * (Chiron listens again). A browser's own voice can fail to say it has finished, so there the wait
 * is about the time the words take: 90 ms a character, slower than the 45 to 60 ms measured for
 * the voices. The phone's voices always say when they have finished, but the offline one is made
 * while it plays and may pause between sentences on a slow phone (making a sentence can take
 * longer than saying it), so there the wait is only a safety: three times as long, and 10 s more.
 */
export function speechGuardMs(text, { reportsEnd = MOBILE } = {}) {
  const n = String(text || '').length
  return reportsEnd ? 10000 + n * 270 : 3000 + n * 90
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
// Hercules a man's voice; Athena a woman's; Calliope, the guide (lib/calliope.js), a warm woman's
// voice of her own. The server reads with a natural voice of that kind when
// it has one (api/voice.js); otherwise a voice of the right kind is picked from the phone's own
// ones for the language when one can be told apart by its name (Google's voices are named
// it-it-x-itd-local and so on, a code per speaker). The pitch is left alone: lowered, the phone's
// voices sound like a robot.
export const VOICES = {
  chiron: { male: true, rate: 0.95 },
  hercules: { male: true, rate: 1 },
  athena: { male: false, rate: 1 },
  calliope: { male: false, rate: 1 },
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
// Whose voices the server has. A server from before the guide has the three coaches only, and
// would read her lines in Hercules's voice: until it says it has hers, the phone's voice reads them.
const FIRST_SPEAKERS = ['chiron', 'hercules', 'athena']
let serverWho = FIRST_SPEAKERS
const onServer = who => serverVoice === true && serverWho.includes(who)
let playing = null   // { audio, stop } of what the server's voice is reading now
let speakRun = 0
let voiceFails = 0

// Short pieces, a sentence or a few: the first is heard while the next is being made.
// Each piece must be made by the server while the one before it plays, or the voice stops and
// waits. Sent as one request, everything after the first sentence took 22 s to come back after a
// 1-second title (function log, 2026-11-22: Athena "read the title, then waited"). So the pieces
// grow: the second at most twice the first (at least `start` characters), each next one twice the
// one before. Doubling assumes the server makes speech at least twice as fast as it is heard,
// less its fixed cost per request; at most `most` requests are spent on one answer (the server's
// voice has a quota per request), the last taking what is left.
// The first piece is also short: a server voice takes longer for a longer piece (function log,
// 2026-11-27: 1.1 s for one of Chiron's first sentences, 3.6 s for another), and nothing is heard
// until it is back. A first sentence longer than `first` characters is cut at its first clause
// (a comma, semicolon or colon) between 20 and `first` characters, where a reader pauses anyway.
export function opening(sentence, first = 60) {
  if (sentence.length <= first) return [sentence]
  const re = /[,;:](?=\s)/g
  let at = -1, m
  while ((m = re.exec(sentence)) && m.index < first) if (m.index >= 20) { at = m.index; break }
  if (at < 0) return [sentence]
  return [sentence.slice(0, at + 1).trim(), sentence.slice(at + 1).trim()].filter(Boolean)
}
export function pieces(text, max = 800, { start = 100, most = 4, first = 60 } = {}) {
  const sentences = String(text).match(/[^.!?…\n]+[.!?…]*[\s\n]*/g) || [String(text)]
  const clean = sentences.map(x => x.trim()).filter(Boolean)
  const cut = x => (x.length > max ? x.match(new RegExp('.{1,' + max + '}', 'g')) : [x])
  if (!clean.length) return []
  const [head, ...tail] = opening(clean[0], first)
  const rest = [...tail, ...clean.slice(1)]
  if (!rest.length) return cut(head)
  const out = [head]
  let budget = Math.max(start, 2 * head.length)
  let cur = ''
  for (const x of rest) {
    cur = cur ? cur + ' ' + x : x
    const last = out.length === most - 1
    if (!last && cur.length >= budget) { out.push(cur); cur = ''; budget *= 2 }
  }
  if (cur) out.push(cur)
  return [...cut(out[0]), ...out.slice(1).flatMap(cut)]
}

// Lines asked for ahead of time (preloadVoice): the answer waits here until the line is spoken,
// so the guide's next bubble starts talking at once. A handful at most; a failed one is dropped.
const ahead = new Map()
const aheadKey = (piece, lang, who) => who + '|' + lang + '|' + piece
// `keep`: a fixed line of the app (the guide's tour and tips), which the server may keep and
// serve to everyone who hears it after the first (api/voice.js synthesizeCached).
const askServer = (piece, lang, who, keep) => api('/api/voice/speak', { method: 'POST', body: JSON.stringify({ text: piece, lang, who, ...(keep ? { keep: true } : {}) }), timeout: 25000 })

/**
 * Asks the server for `text` read by `who` before it is needed. Nothing is played. Only when the
 * server has a voice; quietly nothing otherwise.
 */
export function preloadVoice(text, { lang, who, keep = false } = {}) {
  if (!onServer(who)) return
  const say = speakable(text)
  if (!say) return
  lang = lang || voiceTag(lineLang(say))
  for (const piece of pieces(say)) {
    const k = aheadKey(piece, lang, who)
    if (ahead.has(k)) continue
    if (ahead.size >= 12) ahead.delete(ahead.keys().next().value)
    const p = askServer(piece, lang, who, keep)
    p.catch(() => { if (ahead.get(k) === p) ahead.delete(k) })
    ahead.set(k, p)
  }
}

async function speakOnServer(say, lang, who, run, onStart, keep) {
  // One more try when a piece fails: a cold start or a busy moment is not a reason for the phone's voice.
  const once = piece => {
    const k = aheadKey(piece, lang, who)
    const had = ahead.get(k)
    if (had) { ahead.delete(k); return had }
    return askServer(piece, lang, who, keep)
  }
  const ask = piece => once(piece).catch(e => ([501, 404, 401, 429].includes(e?.status) ? Promise.reject(e) : once(piece)))
  const parts = pieces(say)
  // The first two pieces are asked for together: the first is short (opening), so the second has
  // less time to be made while it plays. Each next one is asked for when the one before arrives.
  let next = ask(parts[0])
  let then = parts.length > 1 ? ask(parts[1]) : null
  then?.catch(() => {})
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
    next = then
    then = i + 2 < parts.length ? ask(parts[i + 2]) : null
    then?.catch(() => {})
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

// Olympus: how fast this phone makes each offline voice, kept between starts of the app:
// { [key]: { rtf, at } }, rtf the seconds taken to make one second of speech (LocalVoicePlugin).
// A voice is made one piece at a time while the piece before it plays, so a voice slower than real
// time stops between its pieces however the start is timed (SpeechPacing.java): the "few words, a
// silence of seconds, a few words" heard with Kokoro on a mid-range phone (Build 97, 2026-11-22).
// Such a voice is left out for answers, and the next voice is used: Piper (measured 0.035 to 0.048
// against Kokoro's 0.92 to 1.07 on the same 4-core Xeon, 2026-11-22, about 25 times faster), the
// server's voice, or the phone's own, which all keep up.
const SPEED_KEY = 'olympus_voice_speed'
/**
 * The slowest a voice may be and still be used for answers: 0.8, below real time with a margin
 * for a busy phone and for the spread between one measurement and the next (an assumption).
 */
export const FAST_RTF = 0.8
/** A measurement older than this is taken again (the app, the voice or the phone may change). */
const SPEED_DAYS = 7
let speeds = null
const knownSpeeds = () => {
  if (!speeds) { try { speeds = JSON.parse(localStorage.getItem(SPEED_KEY) || '{}') || {} } catch { speeds = {} } }
  return speeds
}
/** Keeps what the plugin measured for voice `key` (its result of speak or warm). */
export function noteVoiceSpeed(key, result) {
  const rtf = Number(result?.rtf)
  if (!key || !result?.measured || !(rtf > 0)) return
  knownSpeeds()[key] = { rtf, at: Date.now() }
  try { localStorage.setItem(SPEED_KEY, JSON.stringify(speeds)) } catch { /* measured again next time */ }
}
/** What is known of how fast this phone makes voice `key`: { rtf, at } or null. */
export const voiceSpeed = key => knownSpeeds()[key] || null
/**
 * Whether voice `key` keeps up with its own speech on this phone. Kokoro (82M parameters) is used
 * only once measured fast enough: on the phones it is too slow for, the first answer stopped
 * after every few words. Piper (a few M) is taken to keep up until a measurement says otherwise.
 */
export function keepsUp(key) {
  const m = voiceSpeed(key)
  if (key === KOKORO) return !!m && m.rtf <= FAST_RTF
  return !m || m.rtf <= FAST_RTF
}
const stale = m => !m || Date.now() - m.at > SPEED_DAYS * 86400000
let measuring = null
export const _resetVoiceSpeeds = () => { speeds = null; measuring = null }
/**
 * Measures Kokoro on this phone when that is not known (or is old), so that it is used where it
 * keeps up. It takes the voice engine for a few seconds (a 2 s line, made at the phone's pace),
 * so it is asked a little after the app opens, when no coach is talking (App.jsx).
 */
export function measureVoices(who = 'athena') {
  if (measuring || !localVoicesOn() || !hasLocalVoice(KOKORO) || !stale(voiceSpeed(KOKORO)) || speaker) return measuring
  const cast = castVoice(who, getLang(), coachVoices())
  if (cast?.engine !== KOKORO) return null
  measuring = warmLocal({ key: KOKORO, sid: cast.sid, accent: cast.accent, measure: true })
    .then(r => { noteVoiceSpeed(KOKORO, r); return r })
    .finally(() => { measuring = null })
  return measuring
}

// Olympus: how the natural voices are offered (components/VoiceSetup.jsx registers it).
let naturalOffer = null
export const setNaturalVoiceOffer = fn => { naturalOffer = typeof fn === 'function' ? fn : null }

/**
 * The phone's offline voices that can read for `who`, best first: { key, sid, accent, model, speed,
 * pitch, scaled }, `scaled` when the caller's rate applies. Kokoro where it speaks the language and
 * has a voice of this coach's own (lib/voice-cast.js); a coach's own Piper voice where Kokoro does
 * not speak it (from the coaches pack, or another speaker of the language's own voice); then, for
 * Chiron and Hercules, the man's Piper voice of the language. With `offer`, a missing download is
 * offered (once, components/VoiceSetup.jsx).
 */
export function localVoices(who, cast = null, { offer = false, lang = getLang() } = {}) {
  const kind = VOICES[who]
  if (!kind || !localVoicesOn()) return []
  cast = cast || castVoice(who, lang, coachVoices(lang))
  const out = []
  // The download offered is the app language's (VoiceSetup.jsx): never for a line in another one.
  const ask = () => { if (offer && lang === getLang()) { try { naturalOffer?.() } catch { /* the offer is a convenience */ } } }
  if (cast?.engine === KOKORO) {
    if (!hasLocalVoice(KOKORO)) ask()
    else if (keepsUp(KOKORO)) out.push({ key: KOKORO, sid: cast.sid, accent: cast.accent, model: '', speed: cast.speed, pitch: cast.pitch, scaled: true })
  }
  if (cast?.engine === PIPER) {
    const pack = cast.model ? coachesKey(lang) : voiceKey(lang)
    if (cast.model && pack && !hasLocalVoice(pack)) ask()
    if (pack && hasLocalVoice(pack) && keepsUp(pack)) out.push({ key: pack, sid: cast.sid, accent: '', model: cast.model, speed: cast.speed, pitch: cast.pitch, scaled: true })
  }
  // A man's offline voice on the phone: then for Chiron and Hercules, with no quota and no wait;
  // Chiron's lower than Hercules's (voice-cast.js), so the two are told apart.
  const key = voiceKey(lang)
  if (kind.male && hasLocalVoice(key) && keepsUp(key)) out.push({ key, sid: null, accent: '', model: '', speed: cast?.speed ?? (who === 'chiron' ? 0.92 : 1), pitch: cast?.pitch ?? 1, scaled: false })
  return out
}

/**
 * Makes the voice `who` will speak with ready before the first line (lib/local-voice.js warmLocal):
 * reading the model and running it once take seconds on a phone, and came before the first word.
 * Called when a coach is about to talk: Chiron getting up, voice mode turned on.
 */
// With `text`, a line about to be said: its first two pieces are made ahead as well.
export function warmCoachVoice(who, text = '') {
  const say = text ? speakable(text) : ''
  const v = localVoices(who, null, { lang: say ? lineLang(say) : getLang() })[0]
  if (!v) return Promise.resolve(null)
  const parts = say ? speechParts(say).slice(0, 2) : null
  return warmLocal({ ...v, ...(parts?.length ? { parts } : {}) })
}

let nativeVoiceList = null
let nativeBusy = false   // the phone's own voice is reading something
let webUtterance = null
/** Reads `text` aloud as `who` (VOICES); resolves when it is done (or stopped). */
export function speak(text, opts = {}) {
  const before = speakRun
  const job = speakNow(text, opts)
  // Whose line is being read, so that one coach's stop (stopSpeaking({ who })) leaves another's alone.
  if (speakRun !== before) {
    const mine = speakRun
    speaker = opts.who || null
    job.finally(() => { if (speakRun === mine) speaker = null }).catch(() => {})
  }
  return job
}
let speaker = null

/**
 * What the offline voice measured the last time each coach spoke on this phone: { firstMs: from
 * the call to the first sound, rtf: seconds taken to make one second of speech }. Shown under the
 * voices in Settings (components/VoiceSetup.jsx), so how fast this phone is can be read off it.
 */
export const voiceStats = {}

async function speakNow(text, { lang, rate, who, onStart, keep = false } = {}) {
  // onStart: called once, when the sound really begins (the server's voice can take a few seconds).
  let started = false
  const begin = () => { if (!started) { started = true; onStart?.() } }
  const say = speakable(text)
  if (!say) return
  // Read in the language it is written in: every voice below (offline, server, the phone's) is
  // chosen for that language, not for the app's.
  const spoken = lineLang(say)
  lang = lang || voiceTag(spoken)
  const run = ++speakRun
  // One voice at a time: what was being read stops now, not when its sentence ends. Without this,
  // skipping through Calliope's tour quickly kept the last line going over the new one while the
  // new one's sound was still on its way from the server.
  playing?.stop()
  stopLocal()
  if (!MOBILE && canSpeak()) window.speechSynthesis.cancel()
  if (MOBILE && nativeBusy) nativeTTS().then(({ p }) => p.stop()).catch(() => {})
  const kind = VOICES[who] || null
  const pace = rate ?? kind?.rate ?? 1
  // Olympus: the most natural voice first: the phone's offline voices (localVoices), in order.
  const cast = kind ? castVoice(who, spoken, coachVoices(spoken)) : null
  const parts = kind ? speechParts(say) : null
  for (const v of kind ? localVoices(who, cast, { offer: true, lang: spoken }) : []) {
    try {
      const stats = await speakLocal(say, { ...v, speed: v.speed * (v.scaled ? (rate ?? 1) : 1), parts, onStart: begin })
      noteVoiceSpeed(v.key, stats)
      if (stats && typeof console !== 'undefined') console.info('[voice]', who, v.key, JSON.stringify(stats))
      if (stats && who) voiceStats[who] = { firstMs: Number(stats.firstMs), rtf: Number(stats.rtf), at: Date.now() }
      return
    } catch (e) {
      if (typeof console !== 'undefined') console.warn('[voice]', who, v.key, String(e?.message || e))
    }
    if (run !== speakRun) return
  }
  if (kind && serverVoice === null && warming) await Promise.race([warming, new Promise(r => setTimeout(r, 6000))])
  if (kind && onServer(who)) {
    try { if (await speakOnServer(say, lang, who, run, begin, keep)) return } catch { /* the phone's voice instead */ }
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
      // Two coaches on the phone's voices are kept apart by how high they are read (voice-cast.js).
      const pitch = (kind?.male && voice < 0 ? 0.78 : 1) * (cast?.engine === 'before' ? cast.pitch : 1)
      if (run !== speakRun) return
      nativeBusy = true
      try { await TTS.speak({ text: say, lang, rate: pace, pitch, ...(voice >= 0 ? { voice } : {}) }) } finally { if (run === speakRun) nativeBusy = false }
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
  warming = api('/api/voice').then(r => { serverVoice = !!r?.speak; serverWho = Array.isArray(r?.who) ? r.who : FIRST_SPEAKERS }, () => {}).finally(() => { warming = null })
  return warming
}
/**
 * Stops what is being read. With `who`, only a line of theirs: Calliope's tips stop her own voice
 * when they close, never a coach's answer that started meanwhile.
 */
export async function stopSpeaking({ who } = {}) {
  if (who && speaker !== who) return
  speaker = null
  speakRun++
  playing?.stop()
  stopLocal()
  if (MOBILE) { try { const { p: TTS } = await nativeTTS(); await TTS.stop() } catch { /* nothing playing */ } return }
  if (canSpeak()) window.speechSynthesis.cancel()
  webUtterance = null
}
