// Olympus: talking to Hercules (api/hercules.js), and the conversation kept on this device.
//
// The conversation is not part of the training document: it stays on the device, per profile,
// the last MAX_KEPT messages, so it is there when the chat is opened again.
import { api } from './api.js'
import { getLang } from './i18n.js'
import { useStore } from '../store/useStore.js'
import { herculesContext } from './hercules-context.js'

const MAX_KEPT = 40
const ANSWER_MS = 75000   // the model, and its fallback when the first is busy

const keyOf = uid => 'olympus_hercules_' + (uid || 'local')

export function loadChat(uid) {
  try {
    const v = JSON.parse(localStorage.getItem(keyOf(uid)) || '[]')
    return Array.isArray(v) ? v.filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string') : []
  } catch { return [] }
}
export function saveChat(uid, list) {
  try { localStorage.setItem(keyOf(uid), JSON.stringify(list.slice(-MAX_KEPT))) } catch { /* the chat is a convenience */ }
}
export function clearChat(uid) {
  try { localStorage.removeItem(keyOf(uid)) } catch { /* nothing to clear */ }
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
