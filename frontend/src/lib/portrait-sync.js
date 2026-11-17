// Olympus: tells the server which portrait this profile shows while it has no picture of its own
// (api/social.js setProfile, `portrait`). The portrait is chosen on this device from the sex given
// in About you (lib/god-avatars.js portraitSexOf), because the server never learns the sex itself:
// other people only get the portrait, which is why it has to be sent.
//
// Sent when it differs from the last one sent for this profile (kept on this device), so a
// session that changes nothing makes no request.
import { godFor, portraitSexOf } from './god-avatars.js'

const KEY = 'olympus_portrait_sent'

const sentFor = id => { try { return JSON.parse(localStorage.getItem(KEY))?.[id] ?? null } catch { return null } }
const remember = (id, portrait) => { try { localStorage.setItem(KEY, JSON.stringify({ ...JSON.parse(localStorage.getItem(KEY) || '{}'), [id]: portrait })) } catch { /* sent again next time */ } }

/** The portrait id this profile should show without a picture of its own. */
export const portraitIdFor = (userId, S) => godFor(userId, portraitSexOf(S)).id

/** Sends the portrait when it changed. `save` is lib/social.js saveProfile. Resolves to whether it sent. */
export async function syncPortrait(user, S, save) {
  if (!user?.id) return false
  const portrait = portraitIdFor(user.id, S)
  if (sentFor(user.id) === portrait) return false
  try { await save({ portrait }) } catch { return false }
  remember(user.id, portrait)
  return true
}
