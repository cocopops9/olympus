// Who this build is and where it comes from. Olympus is a fork of openGym (AGPL-3.0): the
// upstream link stays in About as attribution; the other two are yours to fill in.
//
// UPDATE_REPO — "<github-user>/<repo>" whose GitHub releases the Android app checks for a newer
//   APK (lib/update.js). Empty switches the updater off, which is right until you publish
//   signed releases of your own: an upstream openGym APK is a different app.
// SOURCE_URL  — where the source of THIS version can be read. AGPL §13 asks anyone who lets
//   other people use a modified version over a network (a server your friends sign in to) to
//   offer them its source; point this at your public repository before you do.
export const UPDATE_REPO = ''
export const SOURCE_URL = 'https://github.com/cocopops9/olympus'
export const UPSTREAM_URL = 'https://github.com/DuarteSantos8/openGym'

// DEFAULT_SERVER — the Olympus server this app joins on its own: Home offers "Create profile" and
//   "Sign in" against it, with no address or pairing code to type. Set at build time with the
//   VITE_OLYMPUS_SERVER variable (the APK workflow reads the repository variable OLYMPUS_SERVER).
//   Empty keeps the original choice: this phone only, or a self-hosted server paired by hand.
export const DEFAULT_SERVER = String((import.meta.env && import.meta.env.VITE_OLYMPUS_SERVER) || "").trim().replace(/\/+$/, "")
