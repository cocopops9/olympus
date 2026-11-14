// Olympus: Calliope, the guide, on screen (lib/calliope.js has what she says and knows).
//   <CalliopeTour>  the welcome: she stands on the screen, asks how much help the person wants,
//                   and shows a newcomer around, pointing at the real buttons one at a time
//   calliopeSheet() "ask Calliope": a question about the app, answered in her bubble and aloud
//   <CalliopeFace>  her portrait, for the tips and for the button that opens her
// She talks in a speech bubble, written out as she says it, with her own voice (lib/voice.js),
// which one tap switches off. Every bubble has a way out: nobody is kept in a tutorial.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { create } from 'zustand'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { socialReady } from '../lib/social.js'
import { withGuideLevel, withTipSeen } from '../lib/guide.js'
import { backTrap } from '../lib/back.js'
import { speak, stopSpeaking, preloadVoice, warmVoice } from '../lib/voice.js'
import { GUIDE, askCalliope, askErrorText, greeting, starterQuestions, tourSteps, voiceOn, withVoice } from '../lib/calliope.js'
import { MicButton } from './Voice.jsx'
import { Button } from './ui.jsx'
import Icon from './Icon.jsx'
import portrait from '../assets/calliope.webp'
import figure from '../assets/calliope-full.webp'
import mouth from '../assets/calliope-mouth.webp'
import '../calliope.css'

/** The tour on screen: null, or { then } (run once it is finished or skipped). */
export const useCalliope = create(() => ({ tour: null }))

/** Starts the tour. `then` runs when it ends, however it ends. */
export function startTour(then) {
  warmVoice()
  useCalliope.setState({ tour: { then: typeof then === 'function' ? then : null, key: Date.now() } })
}

const calm = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Her portrait, round. */
export function CalliopeFace({ size = 32, className = '' }) {
  return <span className={'cal-face ' + className} style={{ width: size, height: size }} aria-hidden="true"><img src={portrait} alt="" draggable="false" /></span>
}

/**
 * Calliope, standing. While `talking` her mouth moves: the open mouth is a small drawing of its
 * own laid over the figure (the same picture with the lips parted), shown and hidden at the pace
 * of speech. Still for whoever asked for less motion.
 */
export function CalliopeFigure({ talking = false, className = '' }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!talking || calm()) { setOpen(false); return }
    let tm
    const flap = () => { setOpen(o => !o); tm = setTimeout(flap, 90 + Math.random() * 150) }
    flap()
    return () => clearTimeout(tm)
  }, [talking])
  return <div className={'cal-fig ' + className + (talking ? ' talking' : '')} aria-hidden="true">
    <img className="cal-fig-body" src={figure} alt="" draggable="false" />
    <img className="cal-fig-mouth" src={mouth} alt="" draggable="false" style={{ opacity: open ? 1 : 0 }} />
  </div>
}

/** `text` written out a few letters at a time: [shown, done, finish]. All at once with less motion. */
export function useTyped(text) {
  const full = String(text || '')
  const [n, setN] = useState(() => (calm() ? full.length : 0))
  useEffect(() => {
    if (calm()) { setN(full.length); return }
    setN(0)
    let at = 0
    const tm = setInterval(() => {
      at = Math.min(full.length, at + 2)
      setN(at)
      if (at >= full.length) clearInterval(tm)
    }, 34)
    return () => clearInterval(tm)
  }, [full])
  return [full.slice(0, n), n >= full.length, () => setN(full.length)]
}

/**
 * Her voice: { on, talking, say, hush, toggle }. `say` reads a line when her voice is on, or
 * whatever the switch says with `force` (a tap on "Listen" is the asking); `talking` is true
 * while it sounds. Switching her off stops her at once and is remembered.
 */
export function useCalliopeVoice() {
  const on = useStore(s => voiceOn(s.S))
  const update = useStore(s => s.update)
  const [talking, setTalking] = useState(false)
  const run = useRef(0)
  const hush = useCallback(() => { run.current++; setTalking(false); stopSpeaking() }, [])
  const say = useCallback((text, { keep = false, force = false } = {}) => {
    const id = ++run.current
    setTalking(false)
    if ((!force && !voiceOn(useStore.getState().S)) || !text) { stopSpeaking(); return }
    speak(text, { who: GUIDE, keep, onStart: () => { if (run.current === id) setTalking(true) } })
      .catch(() => {})
      .finally(() => { if (run.current === id) setTalking(false) })
  }, [])
  const toggle = useCallback(() => {
    const was = voiceOn(useStore.getState().S)
    update(s => { s.hints = withVoice(s.hints, !was) })
    if (was) hush()
  }, [update, hush])
  useEffect(() => () => { run.current++; stopSpeaking() }, [])
  return { on, talking, say, hush, toggle }
}

/** The switch for her voice, in a corner of the bubble. */
function VoiceToggle({ voice }) {
  return <button type="button" className={'cal-voice' + (voice.on ? '' : ' off')} onClick={voice.toggle}
    aria-pressed={voice.on} aria-label={voice.on ? t('Turn Calliope’s voice off') : t('Turn Calliope’s voice on')}
    title={voice.on ? t('Turn Calliope’s voice off') : t('Turn Calliope’s voice on')}>
    <Icon name="speaker" />
  </button>
}

// A set being logged, drawn small: the numbers, then the tick, then the rest timer starting.
function SetDemo() {
  return <div className="cal-demo" aria-hidden="true">
    <span className="cal-demo-n">1</span>
    <span className="cal-demo-v">60 <i>kg</i></span>
    <span className="cal-demo-x">×</span>
    <span className="cal-demo-v">8</span>
    <span className="cal-demo-c"><Icon name="check" /></span>
    <span className="cal-demo-t"><Icon name="timer" /> 1:30</span>
  </div>
}

// Where the thing she points at is on the screen: { x, y, w, h } with some air around it, or null.
function useSpot(selector) {
  const [rect, setRect] = useState(null)
  useLayoutEffect(() => {
    if (!selector) { setRect(null); return }
    const measure = () => {
      const el = document.querySelector(selector)
      const r = el?.getBoundingClientRect?.()
      if (!r || !(r.width > 0) || !(r.height > 0)) { setRect(null); return }
      const pad = 6
      setRect({ x: r.left - pad, y: r.top - pad, w: r.width + pad * 2, h: r.height + pad * 2 })
    }
    measure()
    const tm = setTimeout(measure, 260)   // once the screen has settled
    window.addEventListener('resize', measure)
    return () => { clearTimeout(tm); window.removeEventListener('resize', measure) }
  }, [selector])
  return rect
}

const LEVELS = () => [
  { value: 'new', icon: 'lightbulb', title: t('I’m new to this'), sub: t('Show me around, with tips along the way.') },
  { value: 'some', icon: 'dumbbell', title: t('I’ve used apps like this'), sub: t('Only explain the charts and the numbers.') },
  { value: 'off', icon: 'rocket', title: t('I know my way around'), sub: t('No tips. You can turn them on in Settings.') },
]

/**
 * The welcome and the tour, over the app. First the question (how much help), then, for a
 * newcomer, the steps of lib/calliope.js tourSteps, each with a spotlight on what it is about.
 * `onPick` opens the ready-made routines at the end. Mounted by App while useCalliope has a tour.
 */
export function CalliopeTour({ onPick }) {
  const tour = useCalliope(s => s.tour)
  if (!tour) return null
  return <Tour key={tour.key} then={tour.then} onPick={onPick} />
}

function Tour({ then, onPick }) {
  const update = useStore(s => s.update)
  const user = useStore(s => s.user)
  const voice = useCalliopeVoice()
  const [steps, setSteps] = useState(null)   // null: the question; then the steps to tell
  const [at, setAt] = useState(0)
  const step = steps ? steps[at] : null
  const text = step ? step.text : greeting()
  const [shown, typed, finishTyping] = useTyped(text)
  const spot = useSpot(step?.target)

  const hush = voice.hush
  const end = useCallback(after => {
    hush()
    useCalliope.setState({ tour: null })
    after?.()
    then?.()
  }, [then, hush])

  // Each bubble is read as it appears, and the next one is asked for ahead so it starts at once.
  useEffect(() => {
    voice.say(text, { keep: true })
    const next = steps && steps[at + 1]
    if (next && voiceOn(useStore.getState().S)) preloadVoice(next.text, { who: GUIDE, keep: true })
  }, [text])   // eslint-disable-line react-hooks/exhaustive-deps

  // The phone's back button leaves the tour instead of the app.
  useEffect(() => backTrap(() => { end(); return true }), [end])

  const choose = level => {
    // The tour says what Home's own tip says (the three buttons at the bottom): told once is enough.
    update(s => { s.hints = level === 'new' ? withTipSeen(withGuideLevel(s.hints, level), 'feed') : withGuideLevel(s.hints, level) })
    if (level === 'off') { end(); return }
    const all = tourSteps({ coach: socialReady(user) && !!document.querySelector('.hc-fab') })
    // Someone who knows apps like this is told one thing only: where to find her.
    setSteps(level === 'new' ? all : all.filter(s => s.id === 'me').map(s => ({ ...s, last: true, only: true })))
    setAt(0)
  }
  const next = () => { if (!typed) { finishTyping(); return } if (at < steps.length - 1) setAt(at + 1) }
  const last = !!step?.last

  return <div className="cal-tour" role="dialog" aria-modal="true" aria-label={t('Calliope, your guide')} data-step={step ? step.id : 'ask'}>
    {spot
      ? <div className="cal-spot" style={{ left: spot.x, top: spot.y, width: spot.w, height: spot.h }} />
      : <div className="cal-dim" />}
    <div className="cal-stage">
      <div className="cal-bubble">
        <div className="cal-bubble-h">
          <b>Calliope</b>
          <VoiceToggle voice={voice} />
          <span className="cal-gap" />
          {steps && !last && <button type="button" className="cal-skip" onClick={() => end()}>{t('Skip the tour')}</button>}
        </div>
        <p className="cal-say" onClick={finishTyping}>
          <span aria-hidden="true">{shown}</span>
          <span className="cal-sr" aria-live="polite">{text}</span>
        </p>
        {step?.demo === 'set' && <SetDemo />}
        {!steps && <div className="cal-levels" role="list">
          {LEVELS().map(l => <button key={l.value} role="listitem" className="cal-level" data-level={l.value} onClick={() => choose(l.value)}>
            <span className="cal-level-i" aria-hidden="true"><Icon name={l.icon} /></span>
            <span className="grow"><b>{l.title}</b><span className="small muted">{l.sub}</span></span>
            <Icon name="chevronRight" className="dim" />
          </button>)}
        </div>}
        {steps && !last && <div className="cal-nav">
          {at > 0 ? <button type="button" className="cal-back" onClick={() => setAt(at - 1)} aria-label={t('Back')}><Icon name="chevronLeft" /></button> : <span className="cal-back-gap" />}
          <div className="cal-dots" aria-label={t('Step {0} of {1}', at + 1, steps.length)}>
            {steps.map((s, i) => <i key={s.id} className={i === at ? 'on' : ''} />)}
          </div>
          <Button size="sm" variant="primary" trailingIcon="chevronRight" onClick={next}>{t('Next')}</Button>
        </div>}
        {steps && last && (step.only
          ? <div className="cal-end"><Button variant="primary" onClick={() => end()}>{t('Got it')}</Button></div>
          : <div className="cal-end">
            <Button variant="primary" icon="magnifier" onClick={() => end(onPick)}>{t('Pick a ready-made routine')}</Button>
            <Button onClick={() => end()}>{t('I’ll look around myself')}</Button>
          </div>)}
      </div>
      <CalliopeFigure talking={voice.talking || (!typed && !voice.on)} className="cal-stage-fig" />
    </div>
  </div>
}

// ---- Ask Calliope -------------------------------------------------------------------------------

function AskSheet({ close, question }) {
  const voice = useCalliopeVoice()
  const [log, setLog] = useState([])          // { role, content, go }
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const end = useRef(null)
  const hello = t('Ask me how anything in the app works. For training itself, ask Hercules and Athena.')

  const send = async said => {
    const q = String(said ?? draft).trim()
    if (!q || busy) return
    const asked = [...log, { role: 'user', content: q }]
    setLog(asked); setDraft(''); setErr(''); setBusy(true)
    voice.hush()
    try {
      const st = useStore.getState()
      const path = String(window.location.hash || '').replace(/^#/, '').split('?')[0]
      const r = await askCalliope(asked, { S: st.S, path })
      const answer = r.text || t('I could not answer just now. Check the connection and ask me again.')
      setLog([...asked, { role: 'assistant', content: answer, go: r.go }])
      voice.say(answer)
    } catch (e) {
      setErr(askErrorText(e))
    } finally { setBusy(false) }
  }

  useEffect(() => { warmVoice(); if (question) send(question) }, [])   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { end.current?.scrollIntoView?.({ block: 'end' }) }, [log.length, busy, err])

  const go = route => { voice.hush(); close(); window.location.hash = '#' + route }
  const tour = () => { voice.hush(); close(); window.location.hash = '#/home'; setTimeout(() => startTour(), 350) }

  return <div className="cal-ask">
    <div className="cal-ask-h">
      <CalliopeFace size={46} className={voice.talking ? 'talking' : ''} />
      <div className="grow"><b>Calliope</b><div className="small muted">{t('Your guide to the app')}</div></div>
      <VoiceToggle voice={voice} />
    </div>
    <div className="cal-ask-log" data-nodrag>
      <div className="cal-m her">{hello}</div>
      {log.map((m, i) => <div key={i} className={'cal-m ' + (m.role === 'user' ? 'me' : 'her')}>
        {m.content}
        {m.go && <div className="cal-m-go"><Button size="sm" variant="tinted" trailingIcon="chevronRight" onClick={() => go(m.go)}>{t('Take me there')}</Button></div>}
      </div>)}
      {busy && <div className="cal-m her cal-typing" aria-label={t('Calliope is thinking')}><i /><i /><i /></div>}
      {err && <div className="cal-m her cal-err" role="alert">{err}</div>}
      <div ref={end} />
    </div>
    {log.length === 0 && !busy && <div className="cal-chips">
      {starterQuestions().map(q => <button key={q} type="button" className="chip" onClick={() => send(q)}>{q}</button>)}
    </div>}
    <form className="cal-in" onSubmit={e => { e.preventDefault(); send() }}>
      <textarea rows={1} value={draft} onChange={e => setDraft(e.target.value)} placeholder={t('Ask about the app…')} maxLength={500}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} aria-label={t('Ask about the app…')} />
      <MicButton onText={setDraft} onFinal={text => send(text)} disabled={busy} />
      <button type="submit" className="cal-send" disabled={busy || !draft.trim()} aria-label={t('Send')}><Icon name="arrowUp" /></button>
    </form>
    <button type="button" className="cal-again" onClick={tour}><Icon name="sparkles" /> {t('Show me around again')}</button>
  </div>
}

/** Opens Calliope to ask her about the app. With `question`, asks it at once. */
export function calliopeSheet(question) {
  useUI.getState().openSheet(close => <AskSheet close={close} question={typeof question === 'string' ? question : ''} />)
}

/** The button that opens her: her face, at the top of Home. */
export function CalliopeButton() {
  return <button type="button" className="iconbtn cal-help" onClick={() => calliopeSheet()} aria-label={t('Ask Calliope, your guide')} title={t('Ask Calliope, your guide')}>
    <CalliopeFace size={30} />
  </button>
}
