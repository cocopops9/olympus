// Olympus: the welcome on a new profile (lib/guide.js needsWelcome). Calliope, the guide
// (components/Calliope.jsx), stands on the screen and asks one question first: how much help do
// you want. Someone who has used a training app before is out in one tap, and someone who has
// not is shown around: the real buttons, one at a time, in under a minute. The answer sets how
// many tips the screens show afterwards; Settings → About & updates changes it and replays this.
import { useEffect } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { needsWelcome, withWelcomed } from '../lib/guide.js'
import { warmVoice } from '../lib/voice.js'
import { aboutYouSheet } from './AboutYou.jsx'
import { exploreSheet } from '../views/WorkoutStart.jsx'
import { CalliopeTour, startTour, useCalliope } from './Calliope.jsx'
import '../guide.css'

/** Opens the welcome. `then` runs once it is finished or skipped. */
export function welcomeSheet(then) {
  startTour(then)
}

/** Whether the welcome is on screen now. */
export const useTouring = () => useCalliope(s => !!s.tour)

/** The welcome itself, mounted once by the app: nothing until it is opened. */
export function WelcomeTour() {
  return <CalliopeTour onPick={() => exploreSheet()} />
}

/**
 * Opens the welcome once, a moment after a new profile is ready and nothing else is on screen
 * (a sheet that is open is waited for, not talked over). It counts as shown from the moment it
 * opens, so leaving it does not bring it back. The About you question (components/AboutYou.jsx)
 * follows it for a signed-in profile.
 */
export function useWelcome({ ready, blocked }) {
  const S = useStore(s => s.S)
  const user = useStore(s => s.user)
  const show = ready && !blocked && !S.active && needsWelcome(S) && import.meta.env?.MODE !== 'test'
  useEffect(() => {
    if (!show) return
    warmVoice()   // so her first words are not kept waiting for the server to say it has a voice
    let tm
    const open = () => {
      const st = useStore.getState()
      if (!needsWelcome(st.S) || st.S.active) return
      if (useUI.getState().sheets.length) { tm = setTimeout(open, 1200); return }
      st.update(s => { s.hints = withWelcomed(s.hints) })
      welcomeSheet(() => {
        const now = useStore.getState()
        if (now.user && !now.S.aboutAsked && !now.S.birth) aboutYouSheet()
      })
    }
    tm = setTimeout(open, 900)
    return () => clearTimeout(tm)
  }, [show, user?.id])
}
