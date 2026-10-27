// Olympus: "Continue with Google" in the Android app. The phone's own Google account picker
// (Credential Manager, through @capgo/capacitor-social-login) hands back an ID token; the server
// checks it with Google and signs in, links or creates the account (api/accounts.js).
//
// The client ID is the server's (GET /api/config google_client_id), so turning Google on is a
// server setting, not a new build. Without one, or off the phone, the button is not shown.
import { MOBILE } from './mobile.js'

let ready = null   // the client ID the plugin was initialised with

/** Whether Google sign-in can be offered: the app build, and a client ID from the server. */
export const googleAvailable = clientId => MOBILE && typeof clientId === 'string' && clientId.length > 10

/** The ID token of the Google account the person picks. Rejects with { code: 'cancelled' } when they close the picker. */
export async function googleIdToken(clientId) {
  const { SocialLogin } = await import('@capgo/capacitor-social-login')
  if (ready !== clientId) {
    await SocialLogin.initialize({ google: { webClientId: clientId, mode: 'online' } })
    ready = clientId
  }
  let res
  try {
    // No `scopes`: the plugin asks for e-mail and profile by itself, and custom scopes need a changed MainActivity.
    res = await SocialLogin.login({ provider: 'google', options: { filterByAuthorizedAccounts: false } })
  } catch (e) {
    const msg = String(e?.message || e || '')
    if (/cancel/i.test(msg)) throw Object.assign(new Error('cancelled'), { code: 'cancelled' })
    if (/no credential|no account/i.test(msg)) throw Object.assign(new Error(msg), { code: 'no-account' })
    throw Object.assign(new Error(msg || 'Google sign-in failed'), { code: 'google-failed' })
  }
  const token = res?.result?.idToken
  if (!token) throw Object.assign(new Error('Google did not return an ID token'), { code: 'google-failed' })
  return token
}
