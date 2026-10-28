// Olympus: the welcome on a new profile (lib/guide.js needsWelcome). One question first — how
// much help do you want — so someone who has used a training app before is out in one tap, and
// someone who has not gets a short tour of the four things the app is about. The answer sets how
// many tips the screens show afterwards; Settings → About & updates changes it and replays this.
import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { socialReady } from '../lib/social.js'
import { needsWelcome, withGuideLevel, withWelcomed } from '../lib/guide.js'
import { aboutYouSheet } from './AboutYou.jsx'
import { exploreSheet } from '../views/WorkoutStart.jsx'
import { Button } from './ui.jsx'
import Icon from './Icon.jsx'
import '../guide.css'

const LEVELS = () => [
  { value: 'new', icon: 'lightbulb', title: t('I’m new to this'), sub: t('Show me around, with tips along the way.') },
  { value: 'some', icon: 'dumbbell', title: t('I’ve used apps like this'), sub: t('Only explain the charts and the numbers.') },
  { value: 'off', icon: 'rocket', title: t('I know my way around'), sub: t('No tips. You can turn them on in Settings.') },
]

// The tour, one card per thing to know. The coach card only where there is a coach to ask.
const steps = coach => [
  { icon: 'play', title: t('Start a workout'), text: t('The round button in the middle of the bar at the bottom starts a workout. Pick a routine, or start an empty workout and add exercises as you go.') },
  { icon: 'check', title: t('Log every set'), text: t('Type the weight and the reps, then tick the set when it is done. The rest timer starts by itself, and next time Olympus suggests what to lift.') },
  { icon: 'calendar', title: t('Plan your week'), text: t('A routine is a list of exercises you repeat, like “Push day”. Put your routines on weekdays in Plan, and each day’s workout is ready when you open the app.') },
  { icon: 'chartLine', title: t('Watch your progress'), text: t('Profile has your week, your charts and your settings. Stats starts simple; switch to Detailed whenever you want every number.') },
  ...(coach ? [{ icon: 'sparkles', title: t('Ask the coach'), text: t('The round face on the screen is your AI coach. Ask it about training, technique or food. Drag it aside if it is in the way.') }] : []),
]

function WelcomeSheet({ close, then }) {
  const update = useStore(s => s.update)
  const user = useStore(s => s.user)
  const [step, setStep] = useState(-1)   // -1: the question; 0…: the tour
  const tour = steps(socialReady(user))
  const finish = () => { close(); then?.() }
  const choose = level => {
    update(s => { s.hints = withGuideLevel(s.hints, level) })
    if (level === 'new') setStep(0); else finish()
  }

  if (step < 0) return <div className="guide-welcome">
    <div className="guide-welcome-i" aria-hidden="true"><Icon name="sparkles" /></div>
    <h3>{t('Welcome to Olympus')}</h3>
    <p className="muted">{t('One question, so the app helps you the right amount.')}</p>
    <div className="guide-levels" role="list">
      {LEVELS().map(l => <button key={l.value} role="listitem" className="guide-level" data-level={l.value} onClick={() => choose(l.value)}>
        <span className="guide-level-i" aria-hidden="true"><Icon name={l.icon} /></span>
        <span className="grow"><b>{l.title}</b><span className="small muted">{l.sub}</span></span>
        <Icon name="chevronRight" className="dim" />
      </button>)}
    </div>
  </div>

  const s = tour[step]
  const last = step === tour.length - 1
  return <div className="guide-welcome" data-step={step}>
    <div className="guide-welcome-i" aria-hidden="true"><Icon name={s.icon} /></div>
    <h3>{s.title}</h3>
    <p>{s.text}</p>
    <div className="guide-dots" aria-label={t('Step {0} of {1}', step + 1, tour.length)}>
      {tour.map((_, i) => <i key={i} className={i === step ? 'on' : ''} />)}
    </div>
    {last ? <>
      <Button variant="primary" icon="magnifier" onClick={() => { finish(); exploreSheet() }}>{t('Pick a ready-made routine')}</Button>
      <div style={{ height: 8 }} />
      <Button onClick={finish}>{t('I’ll look around myself')}</Button>
    </> : <>
      <Button variant="primary" trailingIcon="chevronRight" onClick={() => setStep(step + 1)}>{t('Next')}</Button>
      <div className="guide-welcome-a">
        {step > 0 ? <Button size="sm" variant="ghost" icon="chevronLeft" onClick={() => setStep(step - 1)}>{t('Back')}</Button> : <span />}
        <Button size="sm" variant="ghost" className="dim" onClick={finish}>{t('Skip the tour')}</Button>
      </div>
    </>}
  </div>
}

/** Opens the welcome. `then` runs once it is finished or skipped (not when swiped away). */
export function welcomeSheet(then) {
  useUI.getState().openSheet(close => <WelcomeSheet close={close} then={then} />)
}

/**
 * Opens the welcome once, a moment after a new profile is ready and nothing else is on screen.
 * It counts as shown from the moment it opens, so swiping it away does not bring it back. The
 * About you question (components/AboutYou.jsx) waits for a screen with no sheet on it, so a
 * signed-in profile is asked it straight after.
 */
export function useWelcome({ ready, blocked }) {
  const S = useStore(s => s.S)
  const user = useStore(s => s.user)
  const show = ready && !blocked && !S.active && needsWelcome(S) && import.meta.env?.MODE !== 'test'
  useEffect(() => {
    if (!show) return
    const tm = setTimeout(() => {
      const st = useStore.getState()
      if (useUI.getState().sheets.length || !needsWelcome(st.S)) return
      st.update(s => { s.hints = withWelcomed(s.hints) })
      welcomeSheet(() => {
        const now = useStore.getState()
        if (now.user && !now.S.aboutAsked && !now.S.birth) aboutYouSheet()
      })
    }, 900)
    return () => clearTimeout(tm)
  }, [show, user?.id])
}
