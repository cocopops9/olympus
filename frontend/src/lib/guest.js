/**
 * Whether "Continue without account" may be offered, given the public config from /api/config.
 *
 * Guest mode is allowed unless the server has *positively* said otherwise. That asymmetry is the
 * whole point: a config we could not fetch — offline, server restarting, request failed — is not
 * the same answer as `allow_guest: false`, and treating it as one would lock people out of an
 * instance whose admin never disabled anything. An instance that really did disable guests says
 * so on the next successful boot, and the session is ended then (see useStore.boot).
 *
 * Older servers predate the flag and send no `allow_guest` at all; they mean "allowed".
 *
 * @param {{allow_guest?: boolean}|null|undefined} config Parsed /api/config body, or null.
 * @returns {boolean} true when the guest entrance may be shown and used.
 */
export const guestAllowed = config => !(config && config.allow_guest === false)

/**
 * Whether someone without an account may use the app at all on this build.
 *
 * The Olympus phone app ships with its own server (DEFAULT_SERVER): there, an account is
 * required, so a local-only guest profile is not a way in. A phone that was already used
 * without an account goes back to the welcome screen; what it logged stays on the phone and
 * comes along when that person signs in or creates an account (adoptProfile).
 * Builds without a default server (self-hosted phone app, the web app) keep their own rules.
 *
 * @param {{mobile: boolean, defaultServer: string}} build
 * @returns {boolean} false when only a signed-in account may get past the welcome screen.
 */
export const guestEntryAllowed = ({ mobile, defaultServer }) => !(mobile && defaultServer)
