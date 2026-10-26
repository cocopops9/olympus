// Olympus: coaches of your own, beside Hercules and Athena: a name, a portrait and an AI model
// you bring yourself (components/OwnCoach.jsx sets one up). The app talks to that model directly
// from this device with your key: the key and the conversations never go to the Olympus server,
// and there is no daily limit (your provider bills you, or a model on your own computer runs for
// free). They get the same instructions and the same summary of your training as Hercules.
//
// Two ways of talking cover the providers:
//   openai     the OpenAI chat completions API, which most providers also speak (OpenAI, Groq,
//              Google Gemini, OpenRouter, Mistral, DeepSeek, xAI, Together, and Ollama or LM Studio
//              on your own computer), at the provider's base URL;
//   anthropic  Anthropic's Messages API (Claude).
// In the phone app the calls go through native HTTP (lib/capacitor-fetch.js), so a provider that
// does not allow browser calls still answers.
import { nativeFetch } from './capacitor-fetch.js'
import { getLang } from './i18n.js'
import { useStore } from '../store/useStore.js'
import { herculesContext } from './hercules-context.js'
import { systemPrompt, cleanChat, withoutThinking, LIMITS } from '../../../api/hercules.js'

export const PROVIDERS = [
  { id: 'openai', name: 'OpenAI', api: 'openai', baseUrl: 'https://api.openai.com/v1', key: true, keyUrl: 'platform.openai.com/api-keys' },
  { id: 'anthropic', name: 'Anthropic (Claude)', api: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', key: true, keyUrl: 'console.anthropic.com' },
  { id: 'gemini', name: 'Google Gemini', api: 'openai', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', key: true, keyUrl: 'aistudio.google.com/apikey' },
  { id: 'groq', name: 'Groq', api: 'openai', baseUrl: 'https://api.groq.com/openai/v1', key: true, keyUrl: 'console.groq.com/keys' },
  { id: 'openrouter', name: 'OpenRouter', api: 'openai', baseUrl: 'https://openrouter.ai/api/v1', key: true, keyUrl: 'openrouter.ai/keys' },
  { id: 'mistral', name: 'Mistral', api: 'openai', baseUrl: 'https://api.mistral.ai/v1', key: true, keyUrl: 'console.mistral.ai' },
  { id: 'deepseek', name: 'DeepSeek', api: 'openai', baseUrl: 'https://api.deepseek.com/v1', key: true, keyUrl: 'platform.deepseek.com' },
  { id: 'xai', name: 'xAI (Grok)', api: 'openai', baseUrl: 'https://api.x.ai/v1', key: true, keyUrl: 'console.x.ai' },
  { id: 'ollama', name: 'Ollama (your computer)', api: 'openai', baseUrl: 'http://localhost:11434/v1', key: false, local: true },
  { id: 'lmstudio', name: 'LM Studio (your computer)', api: 'openai', baseUrl: 'http://localhost:1234/v1', key: false, local: true },
  { id: 'custom', name: 'Other (OpenAI-compatible)', api: 'openai', baseUrl: '', key: false },
]
export const providerOf = id => PROVIDERS.find(p => p.id === id) || PROVIDERS[PROVIDERS.length - 1]

const PREFIX = 'own_'
export const isOwn = id => typeof id === 'string' && /^own_[a-z0-9]+$/.test(id)
const keyOf = uid => 'olympus_own_coaches_' + (uid || 'local')

/** The coaches of your own on this device: [{ id, name, avatar, style, provider, baseUrl, model, key }]. */
export function loadOwnCoaches(uid) {
  try {
    const v = JSON.parse(localStorage.getItem(keyOf(uid)) || '[]')
    return Array.isArray(v) ? v.filter(c => c && isOwn(c.id) && c.name) : []
  } catch { return [] }
}
function saveAll(uid, list) {
  try { localStorage.setItem(keyOf(uid), JSON.stringify(list)) } catch { /* a convenience */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('olympus:own-coaches'))
}
export const ownCoach = (uid, id) => loadOwnCoaches(uid).find(c => c.id === id) || null

/** What is wrong with a coach about to be saved, as a code, or null. */
export function problemOf(c) {
  if (!String(c?.name || '').trim()) return 'name'
  const p = providerOf(c.provider)
  if (!String(c.baseUrl || '').trim() || !/^https?:\/\//i.test(String(c.baseUrl).trim())) return 'url'
  if (!String(c.model || '').trim()) return 'model'
  if (p.key && !String(c.key || '').trim()) return 'key'
  return null
}

/** Saves `c` (a new one gets an id); returns it. */
export function saveOwnCoach(uid, c) {
  const list = loadOwnCoaches(uid)
  const id = c.id && isOwn(c.id) ? c.id : PREFIX + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  const clean = {
    id, name: String(c.name).trim().slice(0, 30), avatar: c.avatar || null, style: String(c.style || '').trim().slice(0, 300),
    provider: providerOf(c.provider).id, baseUrl: String(c.baseUrl || '').trim().replace(/\/+$/, ''),
    model: String(c.model || '').trim(), key: String(c.key || '').trim(),
  }
  const i = list.findIndex(x => x.id === id)
  if (i >= 0) list[i] = clean; else list.push(clean)
  saveAll(uid, list)
  return clean
}
export function deleteOwnCoach(uid, id) {
  saveAll(uid, loadOwnCoaches(uid).filter(c => c.id !== id))
  try { localStorage.removeItem('olympus_' + id + '_chats_' + (uid || 'local')) } catch { /* nothing kept */ }
}

const TIMEOUT_MS = 90000
async function call(url, init, fetchImpl) {
  const ctl = new AbortController()
  const tm = setTimeout(() => ctl.abort(), TIMEOUT_MS)
  try {
    const res = await fetchImpl(url, { ...init, signal: ctl.signal })
    let body = null
    try { body = await res.json() } catch { body = null }
    if (!res.ok) {
      const msg = body?.error?.message || body?.message || (typeof body?.error === 'string' ? body.error : '') || ('HTTP ' + res.status)
      throw Object.assign(new Error(msg), { status: res.status, data: { code: res.status === 401 || res.status === 403 ? 'own-key' : res.status === 429 ? 'own-limit' : 'own-failed', message: msg } })
    }
    return body
  } catch (e) {
    if (e?.name === 'AbortError') throw Object.assign(new Error('timeout'), { code: 'timeout' })
    if (e?.data) throw e
    throw Object.assign(new Error(e?.message || 'network'), { data: { code: 'own-network', message: e?.message || '' } })
  } finally { clearTimeout(tm) }
}

const headersFor = (c, p) => (p.api === 'anthropic'
  ? { 'Content-Type': 'application/json', 'x-api-key': c.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }
  : { 'Content-Type': 'application/json', ...(c.key ? { Authorization: 'Bearer ' + c.key } : {}) })

/**
 * One answer from coach `c` to the conversation `list` (ending with the person's message), with
 * the same instructions and training summary as Hercules. Resolves with { reply }.
 */
export async function askOwnCoach(c, list, { fetchImpl = nativeFetch, S = useStore.getState().S, name = useStore.getState().user?.name } = {}) {
  const p = providerOf(c.provider)
  const messages = cleanChat(list.map(m => ({ role: m.role, content: m.content })))
  const system = systemPrompt({ name, lang: getLang(), context: String(herculesContext(S) || '').slice(0, LIMITS.context), persona: { name: c.name, style: c.style } })
  const base = String(c.baseUrl).replace(/\/+$/, '')
  if (p.api === 'anthropic') {
    const body = await call(base + '/messages', {
      method: 'POST', headers: headersFor(c, p),
      body: JSON.stringify({ model: c.model, system, messages, max_tokens: LIMITS.replyTokens, temperature: 0.6 }),
    }, fetchImpl)
    const text = (body?.content || []).filter(x => x?.type === 'text').map(x => x.text).join('\n').trim()
    if (!text) throw Object.assign(new Error('empty'), { data: { code: 'own-failed', message: 'empty answer' } })
    return { reply: text }
  }
  const body = await call(base + '/chat/completions', {
    method: 'POST', headers: headersFor(c, p),
    body: JSON.stringify({ model: c.model, messages: [{ role: 'system', content: system }, ...messages], max_tokens: LIMITS.replyTokens, temperature: 0.6 }),
  }, fetchImpl)
  const text = withoutThinking(body?.choices?.[0]?.message?.content || '')
  if (!text) throw Object.assign(new Error('empty'), { data: { code: 'own-failed', message: 'empty answer' } })
  return { reply: text }
}

/** The models the provider offers with this key, for the picker: ['model-id', ...]. */
export async function listModels(c, { fetchImpl = nativeFetch } = {}) {
  const p = providerOf(c.provider)
  const body = await call(String(c.baseUrl).replace(/\/+$/, '') + '/models', { method: 'GET', headers: headersFor(c, p) }, fetchImpl)
  const items = Array.isArray(body?.data) ? body.data : Array.isArray(body?.models) ? body.models : []
  return [...new Set(items.map(m => String(m?.id || m?.name || '').replace(/^models\//, '')).filter(Boolean))].sort()
}
