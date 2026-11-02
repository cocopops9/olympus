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
export const availableVoice = key => (key && manifest?.voices?.[key]) || null
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
export async function speakLocal(text, { key, speed = 1, onStart } = {}) {
  const v = availableVoice(key)
  const { p } = await plugin()
  let sub = null
  try {
    if (onStart) sub = await p.addListener('start', () => { const f = onStart; onStart = null; f?.() })
    await p.speak({ lang: key, text, sid: Number(v?.sid) || 0, speed })
  } finally {
    try { await sub?.remove() } catch { /* gone */ }
  }
}

export async function stopLocal() {
  if (!localVoicesOn()) return
  try { const { p } = await plugin(); await p.stop() } catch { /* nothing playing */ }
}

// Whether the first-start setup (or the offer for a language picked later) was answered.
const askedKey = key => 'olympus_voice_asked_' + key
export const voiceAsked = key => { try { return localStorage.getItem(askedKey(key)) === '1' } catch { return true } }
export const markVoiceAsked = key => { try { localStorage.setItem(askedKey(key), '1') } catch { /* asked again */ } }

export const _resetLocalVoices = () => { manifest = null; installed = null; installing.clear() }
export const _setLocalVoices = (m, inst) => { manifest = m; installed = new Set(inst || []) }
