// Olympus: the coaches' offline voices. A man's Piper voice per language, read on the phone by
// the native LocalVoice plugin (android/.../LocalVoicePlugin.java, sherpa-onnx): no quota, no
// connection, no wait. The voices are published on the "voices" release of this app's repository
// (.github/workflows/voices.yml) with voices.json, which says which voice each language has, its
// size and its checksum. The app downloads the one for its language on the first start
// (components/VoiceSetup.jsx), and offers the one for a language picked later.
//
// Chiron and Hercules speak with it; Athena, a woman, keeps the server's or the phone's voice.
import { MOBILE } from './mobile.js'
import { UPDATE_REPO } from './app-info.js'
import { getLang } from './i18n.js'

const MANIFEST_URL = UPDATE_REPO ? `https://github.com/${UPDATE_REPO}/releases/download/voices/voices.json` : ''
export const voiceFileUrl = file => (UPDATE_REPO ? `https://github.com/${UPDATE_REPO}/releases/download/voices/${file}` : '')

// A Capacitor plugin answers every property, `then` included: handed over inside an object.
let pluginP = null
const plugin = () => (pluginP ||= import('@capacitor/core').then(m => ({ p: m.registerPlugin('LocalVoice') })))

/** The voice a language uses: its own, or its base language's (de-CH reads with German). */
export function voiceKey(lang = getLang()) {
  const l = String(lang || 'en')
  if (l === 'pt-BR' || l === 'pt') return l
  if (l === 'zh-TW') return null   // the Mandarin voice reads simplified Chinese
  return l.split('-')[0]
}

let manifest = null      // { voices: { key: { file, name, sid, bytes, sha256 } } } once read
let installed = null     // Set of keys on this phone
const listeners = new Set()
const emit = () => listeners.forEach(f => { try { f() } catch { /* a listener's own problem */ } })
export const onLocalVoices = f => { listeners.add(f); return () => listeners.delete(f) }

/** Whether this app can have offline voices at all (the Android app with a releases repository). */
export const localVoicesOn = () => MOBILE && !!MANIFEST_URL

/** The voices on this phone (refreshed from the plugin) and the published list (once per start). */
export async function refreshLocalVoices() {
  if (!localVoicesOn()) return { installed: new Set(), manifest: null }
  try {
    const { p } = await plugin()
    const r = await p.list()
    installed = new Set(r?.langs || [])
  } catch { installed = new Set() }
  if (!manifest) {
    try {
      const { p } = await plugin()
      const r = await p.get({ url: MANIFEST_URL })
      const j = JSON.parse(r?.text || 'null')
      if (j && j.voices && typeof j.voices === 'object') manifest = j
    } catch { /* offline: asked again next start */ }
  }
  emit()
  return { installed, manifest }
}

/** The published voice for `key`, or null. */
// Olympus: the coaches' own Piper voices of a language (manifest.coaches, .github/voices/coach-pack.py),
// for the languages Kokoro does not speak: Hercules, Athena and Calliope each with a voice of their
// own where a free one is good enough. Some are in a pack of their own, voice-coaches-<lang>.zip,
// key "coaches-<lang>"; some are another speaker of the language's own voice.
const COACHES = 'coaches-'
/** The coaches' own voices for `lang`: { hercules: { model, sid } , athena: { own: true, sid } }, or null. */
export const coachVoices = (lang = getLang()) => { const k = voiceKey(lang); return (k && manifest?.coaches?.[k]?.who) || null }
/** The key of the coaches pack of `lang`, or null when it has none to download. */
export const coachesKey = (lang = getLang()) => { const k = voiceKey(lang); return k && manifest?.coaches?.[k]?.file ? COACHES + k : null }
export const availableVoice = key => {
  if (!key) return null
  if (key.startsWith(COACHES)) { const c = manifest?.coaches?.[key.slice(COACHES.length)]; return c?.file ? c : null }
  return manifest?.voices?.[key] || null
}
/** Whether the voice for `key` is on this phone. */
export const hasLocalVoice = key => !!(key && installed?.has(key))

const installing = new Map()   // key -> promise
/** Downloads and installs the voice for `key`; `onProgress(received, total)`. */
export function installLocalVoice(key, onProgress) {
  if (installing.has(key)) return installing.get(key)
  const v = availableVoice(key)
  if (!v) return Promise.reject(new Error('no voice for this language'))
  const job = (async () => {
    const { p } = await plugin()
    let sub = null
    try {
      sub = await p.addListener('progress', e => { if (e?.lang === key) onProgress?.(Number(e.received) || 0, Number(e.total) || v.bytes || 0) })
      await p.install({ lang: key, url: voiceFileUrl(v.file), sha256: v.sha256 || '' })
      ;(installed ||= new Set()).add(key)
      emit()
    } finally {
      try { await sub?.remove() } catch { /* gone */ }
      installing.delete(key)
    }
  })()
  installing.set(key, job)
  return job
}
export const installingVoice = key => installing.has(key)

export async function removeLocalVoice(key) {
  const { p } = await plugin()
  await p.remove({ lang: key })
  installed?.delete(key)
  emit()
}

/**
 * Reads `text` with the offline voice of `key`; resolves when it has been heard. `onStart` when the
 * sound begins. Rejects when there is no voice or the engine failed (the caller then uses another).
 */
// `sid`, `accent`: a Kokoro speaker and the language it reads with (lib/voice-cast.js); a Piper
// voice has its own speaker in the manifest. `pitch` plays it lower or higher, the pace kept.
// `model`: which voice of a coaches pack ("m1", "m2"…).
// `parts`: the pieces to read and the pause after each (lib/speech-text.js); the plugin cuts the
// text itself when there are none. Resolves with what the plugin measured ({ firstMs, rtf, … }).
export async function speakLocal(text, { key, speed = 1, sid = null, accent = '', pitch = 1, model = '', parts = null, onStart } = {}) {
  const v = availableVoice(key)
  const { p } = await plugin()
  let sub = null
  try {
    if (onStart) sub = await p.addListener('start', () => { const f = onStart; onStart = null; f?.() })
    return await p.speak({ lang: key, text, sid: sid ?? (Number(v?.sid) || 0), speed, pitch, accent, ...(model ? { model } : {}), ...(parts?.length ? { parts } : {}) })
  } finally {
    try { await sub?.remove() } catch { /* gone */ }
  }
}

/**
 * Makes the offline voice of `key` ready ahead of its first line (LocalVoicePlugin.warm): the
 * model read and run once, which otherwise holds up the first answer by seconds. Asked once per
 * voice per start of the app; quietly nothing when it cannot.
 */
// With `parts` (the first pieces of a line about to be said, at the `speed` and `pitch` it will be
// said with), those are made now too, and speak plays them at once: Chiron's greeting while he
// gets up. That is asked each time; the engine alone once per voice per start of the app.
const warmed = new Map()   // voice -> promise
// With `measure`, a line of about 2 s is made as well, to measure how fast this phone makes the
// voice ({ rtf, measured } in the result); also asked each time.
export function warmLocal({ key, sid = null, accent = '', model = '', speed = 1, pitch = 1, parts = null, measure = false } = {}) {
  if (!localVoicesOn() || !hasLocalVoice(key)) return Promise.resolve(null)
  const v = availableVoice(key)
  const args = { lang: key, sid: sid ?? (Number(v?.sid) || 0), accent, speed, pitch, ...(model ? { model } : {}) }
  if (parts?.length || measure) return plugin().then(({ p }) => p.warm({ ...args, ...(parts?.length ? { parts } : {}), ...(measure ? { measure: true } : {}) })).catch(() => null)
  const id = key + '|' + accent + '|' + model
  if (!warmed.has(id)) {
    const job = plugin().then(({ p }) => p.warm(args)).catch(() => { warmed.delete(id); return null })
    warmed.set(id, job)
  }
  return warmed.get(id)
}

export async function stopLocal() {
  if (!localVoicesOn()) return
  try { const { p } = await plugin(); await p.stop() } catch { /* nothing playing */ }
}

// Whether the first-start setup (or the offer for a language picked later) was answered.
const askedKey = key => 'olympus_voice_asked_' + key
export const voiceAsked = key => { try { return localStorage.getItem(askedKey(key)) === '1' } catch { return true } }
export const markVoiceAsked = key => { try { localStorage.setItem(askedKey(key), '1') } catch { /* asked again */ } }

export const _resetLocalVoices = () => { manifest = null; installed = null; installing.clear(); warmed.clear() }
export const _setLocalVoices = (m, inst) => { manifest = m; installed = new Set(inst || []) }

/**
 * The phone's audio back out of "call" mode once the microphone is closed (LocalVoicePlugin
 * audioNormal): music playing meanwhile otherwise keeps a heavy echo for a while. Asked a few times
 * over a second and a half, since the WebView can put the mode back once more while it finishes
 * closing. Nothing on the web, nor on an app too old to have it.
 */
let normalTimers = []
export function audioNormal() {
  if (!MOBILE) return
  normalTimers.forEach(clearTimeout)
  const ask = () => plugin().then(({ p }) => p.audioNormal()).catch(() => {})
  normalTimers = [0, 400, 1500].map(ms => setTimeout(ask, ms))
}
