// Olympus: Calliope, the guide, on screen (lib/calliope.js has what she says and knows).
//   <CalliopeTour>  she stands on the screen and talks: the welcome (how much help do you want)
//                   and, the first time each screen opens, a few bubbles about that screen only,
//                   pointing at the real buttons one at a time (useScreenTour)
//   calliopeSheet() "ask Calliope": a question about the app, answered in her bubble and aloud
//   <CalliopeFace>  her portrait, for the tips and for the button that opens her
// She talks in a speech bubble, written out as she says it, with her own voice (lib/voice.js),
// which one tap switches off. Every bubble has a way out: nobody is kept in a tutorial.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { create } from 'zustand'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { tourDue, withGuideLevel, withTourSeen, withToursReset } from '../lib/guide.js'
import { backTrap } from '../lib/back.js'
import { speak, stopSpeaking, preloadVoice, warmVoice } from '../lib/voice.js'
import { GUIDE, SCREEN_TOURS, setGuideOpener, calledByName, askCalliope, askErrorText, greeting, introStep, starterQuestions, tourFor, voiceOn, whereStep, withVoice } from '../lib/calliope.js'
import { MicButton } from './Voice.jsx'
import { Button } from './ui.jsx'
import Icon from './Icon.jsx'
import portrait from '../assets/calliope.webp'
import figure from '../assets/calliope-full.webp'
import mouth from '../assets/calliope-mouth.webp'
import '../calliope.css'

/**
 * What she is doing on screen: `tour` is null, or { id, steps, then, key }: `steps` null for the
 * welcome (the question comes first), `id` the screen a screen tour is about, `then` run once it
 * ends, however it ends. `inTests` lets the screens start their tours under a test runner.
 */
export const useCalliope = create(() => ({ tour: null, inTests: false }))

/** Starts the welcome. `then` runs when it ends, however it ends. */
export function startTour(then) {
  warmVoice()
  useCalliope.setState({ tour: { id: 'welcome', steps: null, then: typeof then === 'function' ? then : null, key: Date.now() } })
}

/** Starts the tour of screen `id` with `steps` (lib/calliope.js tourFor). */
export function startScreenTour(id, steps) {
  if (!steps?.length) return
  warmVoice()
  useCalliope.setState({ tour: { id, steps, then: null, key: Date.now() } })
}

/**
 * The tour of screen `id`, the first time it is open: a moment after the screen has settled,
 * when nothing else is on it (no sheet, no other tour), and only for someone it is due to
 * (lib/guide.js tourDue). It counts as shown from the moment it starts, so leaving it does not
 * bring it back. `ready` false holds it back (a workout with no exercise in it yet). Leaving the
 * screen ends it.
 */
export function useScreenTour(id, ready = true) {
  const kind = SCREEN_TOURS[id]?.kind || 'basic'
  const due = useStore(s => tourDue(s.S, id, kind))
  useEffect(() => {
    if (!due || !ready) return
    if (import.meta.env?.MODE === 'test' && !useCalliope.getState().inTests) return
    let tm
    let tries = 0
    const go = () => {
      const st = useStore.getState()
      if (!tourDue(st.S, id, kind)) return
      if (useCalliope.getState().tour || useUI.getState().sheets.length) { if (++tries < 40) tm = setTimeout(go, 1500); return }
      const steps = tourFor(id)
      if (!steps.length) { if (++tries < 6) tm = setTimeout(go, 1500); return }
      st.update(s => { s.hints = withTourSeen(s.hints, id) })
      startScreenTour(id, steps)
    }
    tm = setTimeout(go, 900)
    return () => clearTimeout(tm)
  }, [id, kind, due, ready])
  useEffect(() => () => { if (useCalliope.getState().tour?.id === id) useCalliope.setState({ tour: null }) }, [id])
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
  const timer = useRef(null)
  const stop = () => { clearInterval(timer.current); timer.current = null }
  useEffect(() => {
    stop()
    if (calm()) { setN(full.length); return }
    setN(0)
    let at = 0
    timer.current = setInterval(() => {
      at = Math.min(full.length, at + 2)
      setN(at)
      if (at >= full.length) stop()
    }, 34)
    return stop
  }, [full])
  // Finishing stops the writing too: the timer would otherwise take the line back to where it was.
  const finish = useCallback(() => { stop(); setN(full.length) }, [full])
  return [full.slice(0, n), n >= full.length, finish]
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

// Where the thing she points at is on the screen: { x, y, w, h } with some air around it, or null.
// With `scroll`, the thing is brought to the middle of the screen first.
function useSpot(selector, scroll) {
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
    if (scroll) document.querySelector(selector)?.scrollIntoView?.({ block: 'center' })
    measure()
    const tm = setTimeout(measure, 260)   // once the screen has settled
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => { clearTimeout(tm); window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true) }
  }, [selector, scroll])
  return rect
}

const LEVELS = () => [
  { value: 'new', icon: 'lightbulb', title: t('I’m new to this'), sub: t('Show me around, with tips along the way.') },
  { value: 'some', icon: 'dumbbell', title: t('I’ve used apps like this'), sub: t('Only explain the charts and the numbers.') },
  { value: 'off', icon: 'rocket', title: t('I know my way around'), sub: t('No tips. You can turn them on in Settings.') },
]

/**
 * Calliope on screen, over the app: the welcome, or the tour of a screen. Mounted once by App;
 * nothing until useCalliope has a tour.
 */
export function CalliopeTour() {
  const tour = useCalliope(s => s.tour)
  if (!tour) return null
  return <Tour key={tour.key} tour={tour} />
}

function Tour({ tour }) {
  const update = useStore(s => s.update)
  const voice = useCalliopeVoice()
  const [steps, setSteps] = useState(tour.steps)   // null: the welcome's question; then the steps to tell
  const [at, setAt] = useState(0)
  const step = steps ? steps[at] : null
  const text = step ? step.text : greeting()
  const [shown, typed, finishTyping] = useTyped(text)
  const spot = useSpot(step?.target, !!step?.scroll)
  const stage = useRef(null)
  // Where she stands: at the bottom, unless what she points at is down there, then at the top.
  const [top, setTop] = useState(false)
  useLayoutEffect(() => { setTop(false) }, [at])
  useLayoutEffect(() => {
    if (top || !spot || !stage.current) return
    const r = stage.current.getBoundingClientRect()
    if (spot.y + spot.h > r.top && spot.y < r.bottom) setTop(true)
  }, [spot, top])

  const hush = voice.hush
  const { then } = tour
  const end = useCallback(() => {
    hush()
    useCalliope.setState({ tour: null })
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
    update(s => { s.hints = withGuideLevel(s.hints, level) })
    if (level === 'off') { end(); return }
    if (level === 'some') { setSteps([whereStep()]); setAt(0); return }
    // A newcomer: how she will help from now on, then this screen (Home), which counts as shown.
    update(s => { s.hints = withTourSeen(s.hints, 'home') })
    setSteps([introStep(), ...tourFor('home')])
    setAt(0)
  }
  const last = !!steps && at === steps.length - 1
  const next = () => { if (!typed) { finishTyping(); return } if (last) end(); else setAt(at + 1) }

  return <div className="cal-tour" role="dialog" aria-modal="true" aria-label={t('Calliope, your guide')} data-step={step ? step.id : 'ask'} data-tour-of={tour.id}>
    {spot
      ? <div className="cal-spot" style={{ left: spot.x, top: spot.y, width: spot.w, height: spot.h }} />
      : <div className="cal-dim" />}
    <div className={'cal-stage' + (top ? ' top' : '')} ref={stage}>
      <div className="cal-bubble">
        <div className="cal-bubble-h">
          {top && <CalliopeFace size={28} className={voice.talking ? 'talking' : ''} />}
          <b>{t('Calliope')}</b>
          <VoiceToggle voice={voice} />
          <span className="cal-gap" />
          {steps && !last && <button type="button" className="cal-skip" onClick={end}>{t('Skip the tour')}</button>}
        </div>
        <p className="cal-say" onClick={finishTyping}>
          <span aria-hidden="true">{shown}</span>
          <span className="cal-sr" aria-live="polite">{text}</span>
        </p>
        {!steps && <div className="cal-levels" role="list">
          {LEVELS().map(l => <button key={l.value} role="listitem" className="cal-level" data-level={l.value} onClick={() => choose(l.value)}>
            <span className="cal-level-i" aria-hidden="true"><Icon name={l.icon} /></span>
            <span className="grow"><b>{l.title}</b><span className="small muted">{l.sub}</span></span>
            <Icon name="chevronRight" className="dim" />
          </button>)}
        </div>}
        {steps && <div className="cal-nav">
          {at > 0 ? <button type="button" className="cal-back" onClick={() => setAt(at - 1)} aria-label={t('Back')}><Icon name="chevronLeft" /></button> : <span className="cal-back-gap" />}
          <div className="cal-dots" aria-label={t('Step {0} of {1}', at + 1, steps.length)}>
            {steps.length > 1 && steps.map((s, i) => <i key={s.id} className={i === at ? 'on' : ''} />)}
          </div>
          <Button size="sm" variant="primary" trailingIcon={last ? undefined : 'chevronRight'} onClick={next}>{last ? t('Got it') : t('Next')}</Button>
        </div>}
      </div>
      {!top && <CalliopeFigure talking={voice.talking || (!typed && !voice.on)} className="cal-stage-fig" />}
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
  const tour = () => { voice.hush(); close(); replayGuide() }

  return <div className="cal-ask">
    <div className="cal-ask-h">
      <CalliopeFace size={46} className={voice.talking ? 'talking' : ''} />
      <div className="grow"><b>{t('Calliope')}</b><div className="small muted">{t('Your guide to the app')}</div></div>
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
      <MicButton guide={false} onText={setDraft} onFinal={text => send(calledByName(text) ?? text)} disabled={busy} />
      <button type="submit" className="cal-send" disabled={busy || !draft.trim()} aria-label={t('Send')}><Icon name="arrowUp" /></button>
    </form>
    <button type="button" className="cal-again" onClick={tour}><Icon name="sparkles" /> {t('Show me around again')}</button>
  </div>
}

/**
 * The welcome again, from the start, and every screen to be shown again as it is opened (Settings
 * and "Show me around again").
 */
export function replayGuide() {
  useStore.getState().update(s => { s.hints = withToursReset(s.hints) })
  window.location.hash = '#/home'
  setTimeout(() => startTour(), 350)
}

/** Opens Calliope to ask her about the app. With `question`, asks it at once. */
export function calliopeSheet(question) {
  useUI.getState().openSheet(close => <AskSheet close={close} question={typeof question === 'string' ? question : ''} />)
}

// Whoever says her name into a microphone of the app is asking her (lib/calliope.js calledByName).
setGuideOpener(calliopeSheet)
