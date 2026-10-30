// Olympus: a new install or an update of the app asks for the sign-in again. The installed
// version is kept on the device; when the app starts as a different version (or as the first
// version that keeps it) with a session, the session is closed the way a sign-out closes it:
// signOut({ force: true }) keeps any change the server has not seen aside for this account,
// and it comes back with the next sign-in. Only the installed app: the web app changes version
// whenever the site does, and would ask for a sign-in on every visit.
const KEY = 'olympus_installed_version'

/** Whether the app now running is another version than the one that ran last. */
export function versionChanged(stored, current) {
  return !stored || String(stored) !== String(current)
}

export function readInstalled() { try { return localStorage.getItem(KEY) } catch { return null } }
export function markInstalled(v) { try { localStorage.setItem(KEY, String(v)) } catch { /* asked again next start */ } }

/**
 * Once per start: signs out when the version changed and someone is signed in, then remembers
 * this version. `signOut` is the store's; returns true when it signed out.
 */
export async function reloginOnNewVersion({ current, signedIn, signOut }) {
  const changed = versionChanged(readInstalled(), current)
  if (!changed) return false
  if (signedIn) {
    const r = await signOut({ force: true }).catch(() => null)
    // A sign-out that could not keep the owed changes aside leaves the session as it is: the
    // version is not marked, so it is tried again next start rather than losing anything.
    if (!r || (r.owed && r.stashed === false)) return false
  }
  markInstalled(current)
  return !!signedIn
}
