/* Which profile the tools read. Two sources fill it:
     - the stdio server's file reader (state.js), which registers itself here when it loads;
     - one request of the remote connector (remote.js), which hands over the document it read
       from the server's store for the length of one synchronous tool call.
   Every tool handler is synchronous, so a profile set by withProfile() cannot leak into another
   request: nothing else runs between setting it and taking it back. This module has no Node
   imports on purpose, so the remote connector can load the tools in an Edge Function too. */

let reader = null
let current = null

// The file reader's registration (state.js). A profile set with withProfile() wins over it.
export function setReader(r) { reader = r }

export function getState() {
  if (current) return current.state
  if (!reader) throw new Error('no profile to read: neither the data folder nor a connector request is set')
  return reader.getState()
}

export function getUser() {
  if (current) return current.user
  if (!reader) throw new Error('no profile to read: neither the data folder nor a connector request is set')
  return reader.getUser()
}

// Runs fn with this profile's document (null for a profile that never synced) and user record.
export function withProfile(state, user, fn) {
  const before = current
  current = { state: state == null ? null : Object.assign({}, defaultsShape(), state), user }
  try { return fn() } finally { current = before }
}

// The shape the frontend builds on pullState: defaults merged under the stored document, so a
// field the app added since the document was last saved reads as its default, not undefined.
export function defaultsShape() {
  return {
    unit: 'kg', restSec: 90, sound: true, lang: 'en',
    theme: 'dark', accent: 'lime', body: 'male', targetW: null,
    bodyweight: [], routines: [], week: {}, dayPlan: {},
    exWeights: {}, workouts: [], customEx: [], gifSize: 'full',
    reminder: { on: false, time: '08:00', tz: null }
  }
}
