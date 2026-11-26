// Olympus: Calliope's moments on screen (lib/calliope-moments.js decides which and when). When a
// less common situation first happens, her face and a few words slide in at the top of the screen,
// stay a few seconds, and go. Nothing is dimmed and nothing waits for her: the screen under her
// keeps working. A tap keeps her until closed; ✕ closes her; "No more tips" switches the whole
// guide off, as on the tips (components/Guide.jsx).
import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { withGuideLevel } from '../lib/guide.js'
import { MOMENTS, momentFor, momentDue, momentMs, withMomentSeen } from '../lib/calliope-moments.js'
import Icon from './Icon.jsx'
import { CalliopeFace, useCalliope, useCalliopeVoice } from './Calliope.jsx'

// How long the state has to stay still before she looks at it: a weight being typed is judged
// once the typing stops, not at every keystroke.
const SETTLE_MS = 700

/** Mounted once by the app, beside her tours. */
export function CalliopeMoments() {
  const S = useStore(s => s.S)
  const resting = useUI(s => !!s.timer && !s.timer.ready && s.timer.kind !== 'switch')
  const touring = useCalliope(s => !!s.tour)
  const screen = useLocation().pathname.split('/').filter(Boolean)[0] || 'home'
  const [shown, setShown] = useState(null)   // { id, text, key }

  useEffect(() => {
    if (shown || touring || import.meta.env?.MODE === 'test') return
    const tm = setTimeout(() => {
      const st = useStore.getState()
      // A sheet open is waited for: she does not talk over a question the app is asking.
      if (useUI.getState().sheets.length || useCalliope.getState().tour) return
      const id = momentFor(st.S, { screen, resting })
      if (!id || !momentDue(st.S, id)) return
      // Shown counts from the moment she appears, so leaving the screen does not bring it back.
      st.update(s => { s.hints = withMomentSeen(s.hints, id) })
      setShown({ id, text: MOMENTS[id].text(), key: Date.now() })
    }, SETTLE_MS)
    return () => clearTimeout(tm)
  }, [S, screen, resting, touring, shown])

  // A tour starting, or leaving the screen a workout moment is about, takes her away.
  useEffect(() => {
    if (!shown) return
    const where = MOMENTS[shown.id]?.where
    if (touring || (where && where !== screen)) setShown(null)
  }, [touring, screen, shown])

  if (!shown) return null
  return <Moment key={shown.key} id={shown.id} text={shown.text} close={() => setShown(null)} />
}

function Moment({ id, text, close }) {
  const update = useStore(s => s.update)
  const voice = useCalliopeVoice()
  const [kept, setKept] = useState(false)
  const ms = momentMs(text)
  const timer = useRef(null)

  useEffect(() => { voice.say(text, { keep: true }) }, [])   // eslint-disable-line react-hooks/exhaustive-deps
  // Gone after its reading time, unless kept or she is still talking (then when she stops).
  useEffect(() => {
    if (kept || voice.talking) return
    timer.current = setTimeout(close, ms)
    return () => clearTimeout(timer.current)
  }, [kept, voice.talking, ms, close])

  const shut = () => { voice.hush(); close() }
  const off = () => {
    update(s => { s.hints = withGuideLevel(s.hints, 'off') })
    shut()
    useUI.getState().toast(t('Tips are off. Turn them back on in Settings → About & updates.'))
  }
  return <div className={'cal-moment' + (kept ? ' kept' : '')} role="status" aria-live="polite" data-moment={id}
    style={{ '--cal-moment-ms': ms + 'ms' }} onClick={() => setKept(true)}>
    <CalliopeFace size={38} className={voice.talking ? 'talking' : ''} />
    <div className="cal-moment-b">
      <b>{t('Calliope')}</b>
      <p>{text}</p>
      {kept && <button type="button" className="cal-moment-off" onClick={e => { e.stopPropagation(); off() }}>{t('No more tips')}</button>}
    </div>
    <button type="button" className="cal-moment-x" aria-label={t('Close')} onClick={e => { e.stopPropagation(); shut() }}><Icon name="xmark" /></button>
    {!kept && <i className="cal-moment-time" aria-hidden="true" />}
  </div>
}
