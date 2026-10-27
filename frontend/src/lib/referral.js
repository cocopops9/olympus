// Olympus: invites. Every profile has an invite code (the server makes it, api/insights.js); a
// friend who signs up with it is recorded as invited by that profile, and the server's owner
// sees who brought whom (views/Owner.jsx).
//
// There is no landing page for a link to open, so an invite is a short text: where to get the
// app, and the code to type when creating the account. A web link carrying ?ref=CODE is caught
// at start (captureInvite) and fills the sign-up field by itself.
import { api } from './api.js'
import { t } from './i18n.js'

export const APK_URL = 'https://github.com/cocopops9/olympus/releases/latest/download/olympus.apk'
const KEY = 'olympus_invite'

/** Codes are letters and digits; whatever else a person types or pastes is dropped. */
export const cleanCode = v => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20)

function readStore() { try { return localStorage.getItem(KEY) || '' } catch { return '' } }
function writeStore(v) { try { if (v) localStorage.setItem(KEY, v); else localStorage.removeItem(KEY) } catch { /* private window */ } }

/** The ?ref= of the address, in the search or after the hash route. */
export function refFromLocation(loc = typeof location !== 'undefined' ? location : null) {
  if (!loc) return ''
  const fromSearch = new URLSearchParams(loc.search || '').get('ref')
  const hashQuery = String(loc.hash || '').split('?')[1] || ''
  const fromHash = new URLSearchParams(hashQuery).get('ref')
  return cleanCode(fromSearch || fromHash || '')
}

/** Called once at start: an invite in the address is kept until the account is made. */
export function captureInvite(loc) {
  const code = refFromLocation(loc)
  if (code) writeStore(code)
  return code
}

export const pendingInvite = () => cleanCode(readStore())
export const clearPendingInvite = () => writeStore('')

/** The text a person sends a friend. */
export function inviteShareText(code) {
  return t('Train with me on Olympus. Get the app: {0} and use my invite code {1} when you create your account.', APK_URL, code)
}

/** { code, invited } for the signed-in profile. */
export const fetchReferral = () => api('/api/referral')

/** Shares the invite through the OS share sheet, the browser's, or the clipboard. Resolves to how. */
export async function shareInvite(code, { mobile = false } = {}) {
  const text = inviteShareText(code)
  if (mobile) {
    try {
      const { Share } = await import('@capacitor/share')
      await Share.share({ title: 'Olympus', text, dialogTitle: t('Invite friends') })
      return 'shared'
    } catch (e) {
      if (/cancel/i.test(String(e?.message || e))) return 'cancelled'
    }
  }
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try { await navigator.share({ title: 'Olympus', text }); return 'shared' } catch (e) { if (e?.name === 'AbortError') return 'cancelled' }
  }
  try { await navigator.clipboard.writeText(text); return 'copied' } catch { return 'failed' }
}
