// Olympus: the launch splash. index.html carries it (#splash), so it is on screen from the first
// paint; this takes it away once the app is ready for use, never sooner than MIN_MS after the page
// started (a splash that flashes by looks like a glitch), and never later than MAX_MS (a server
// that does not answer must not keep the person out of the app: the app opens on its own copy).
// "Ready" is the store's `ready` flag, which boot() sets once it has asked the server who this is
// and pulled the latest data, or has given up on it.
export const MIN_MS = 2500
export const MAX_MS = 12000
export const FADE_MS = 500

/**
 * @param store   the Zustand store (getState, subscribe)
 * @param opts    now: milliseconds since the page started (performance.now); doc: the document
 * @returns a function that ends the splash at once
 */
export function startSplash(store, { now = () => performance.now(), doc = document } = {}) {
  const el = doc.getElementById('splash')
  if (!el) return () => {}
  let done = false
  let unsub = () => {}
  const timers = []
  const hide = () => {
    if (done) return
    done = true
    unsub()
    timers.forEach(clearTimeout)
    el.classList.add('out')
    setTimeout(() => el.remove(), FADE_MS + 100)
  }
  const check = () => {
    if (done || !store.getState().ready) return
    unsub()
    const wait = MIN_MS - now()
    if (wait <= 0) hide(); else timers.push(setTimeout(hide, wait))
  }
  timers.push(setTimeout(hide, Math.max(0, MAX_MS - now())))
  unsub = store.subscribe(check)
  check()
  return hide
}
