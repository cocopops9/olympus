// Olympus: talking to Hercules (api/hercules.js), and the conversations kept on this device.
//
// Conversations are not part of the training document: they stay on the device, per profile,
// up to MAX_CHATS of them with the last MAX_KEPT messages each, so they are there when the chat
// is opened again. Stored as { current: id, chats: [{ id, title, ts, messages }] }, newest first.
// The single conversation older versions kept (olympus_hercules_<uid>) becomes the first one.
import { api } from './api.js'
import { getLang } from './i18n.js'
import { useStore } from '../store/useStore.js'
import { herculesContext } from './hercules-context.js'

const MAX_KEPT = 40
const MAX_CHATS = 20
const TITLE_LEN = 48
const ANSWER_MS = 75000   // the model, and its fallback when the first is busy

const oldKeyOf = uid => 'olympus_hercules_' + (uid || 'local')
const keyOf = uid => 'olympus_hercules_chats_' + (uid || 'local')

const cleanMessages = v => (Array.isArray(v)
  ? v.filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
  : [])

/** The title of a conversation: its first question, cut short. */
export function chatTitle(messages) {
  const first = messages.find(m => m.role === 'user')
  const text = String(first?.content || '').replace(/\s+/g, ' ').trim()
  return text.length > TITLE_LEN ? text.slice(0, TITLE_LEN - 1).trimEnd() + '\u2026' : text
}

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7)

/** All the conversations of profile `uid`: { current, chats }. */
export function loadChats(uid) {
  let data = null
  try { data = JSON.parse(localStorage.getItem(keyOf(uid)) || 'null') } catch { data = null }
  let chats = Array.isArray(data?.chats)
    ? data.chats.filter(c => c && typeof c.id === 'string').map(c => ({
      id: c.id, ts: Number(c.ts) || 0, messages: cleanMessages(c.messages), title: String(c.title || ''),
    }))
    : []
  if (!data) {
    // The one conversation an older version kept.
    let old = []
    try { old = cleanMessages(JSON.parse(localStorage.getItem(oldKeyOf(uid)) || '[]')) } catch { old = [] }
    if (old.length) chats = [{ id: newId(), ts: old.at(-1)?.ts || Date.now(), messages: old, title: chatTitle(old) }]
  }
  const current = chats.some(c => c.id === data?.current) ? data.current : (chats[0]?.id || null)
  return { current, chats }
}

export function saveChats(uid, data) {
  const chats = data.chats
    .filter(c => c.messages.length)
    .sort((a, b) => b.ts - a.ts)
    .slice(0, MAX_CHATS)
    .map(c => ({ ...c, messages: c.messages.slice(-MAX_KEPT) }))
  try {
    localStorage.setItem(keyOf(uid), JSON.stringify({ current: data.current, chats }))
    localStorage.removeItem(oldKeyOf(uid))
  } catch { /* the conversations are a convenience */ }
}

/** `data` with the conversation `id` holding `messages` (a new one when `id` is null). */
export function putChat(data, id, messages) {
  const cid = id || newId()
  const rest = data.chats.filter(c => c.id !== cid)
  const chat = { id: cid, ts: Date.now(), messages, title: chatTitle(messages) }
  return { current: cid, chats: [chat, ...rest] }
}

/** `data` without the conversation `id`. */
export function dropChat(data, id) {
  const chats = data.chats.filter(c => c.id !== id)
  return { current: data.current === id ? null : data.current, chats }
}

/** { on, perDay, left } */
export const herculesStatus = () => api('/api/hercules')

/** Sends the conversation (ending with the new message); resolves with { reply, left, perDay }. */
export function askHercules(list) {
  const S = useStore.getState().S
  const messages = list.map(m => ({ role: m.role, content: m.content }))
  return api('/api/hercules', {
    method: 'POST',
    timeout: ANSWER_MS,
    body: JSON.stringify({ messages, lang: getLang(), context: herculesContext(S) }),
  })
}
