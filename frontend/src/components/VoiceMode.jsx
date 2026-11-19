// Olympus: voice mode with Hercules, Athena (or both, or a coach of your own): a spoken
// conversation, full screen, like the voice mode of a chat assistant. The coach listens; what you
// say goes by itself when you stop talking; the answer is read aloud in the coach's own voice
// (lib/voice.js), and the coach listens again. A tap on the coach while it speaks cuts it short
// and it listens; the microphone button pauses and resumes; the cross ends it. Asked how an
// exercise is done, the coach shows it (components/ExerciseDemo.jsx) while it explains.
//
// It is a separate button from the microphone of the text box, which only dictates a message.
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useUI } from '../store/useUI.js'
import { useStore } from '../store/useStore.js'
import { t } from '../lib/i18n.js'
import { track } from '../lib/telemetry.js'
import { listen, speak, speakable, stopSpeaking, releaseMic, warmVoice, canSpeak, VOICES } from '../lib/voice.js'
import { splitActions } from '../lib/coach-actions.js'
import { BOTH } from '../lib/hercules.js'
import { Avatar, coachName } from './Hercules.jsx'
import { useCanListen } from './Voice.jsx'
import ExerciseDemo, { demoFor } from './ExerciseDemo.jsx'
import Icon from './Icon.jsx'
import '../voice-mode.css'

/** The button that opens voice mode: shown where the device can both listen and speak. */
export function VoiceModeButton({ onClick, disabled }) {
  const can = useCanListen()
  if (!can || !canSpeak()) return null
  return <button type="button" className="voice-go" onClick={onClick} disabled={disabled}
    aria-label={t('Voice mode')} title={t('Voice mode')}><Icon name="waveform" /></button>
}

// Whose voice reads an answer: the coach's own; a coach of your own reads with Hercules's.
const voiceOf = who => (VOICES[who] ? who : 'hercules')

/**
 * The voice conversation. `chat` is the conversation's useCoachChat (components/Hercules.jsx),
 * `coach` who it is with, `close` ends voice mode.
 */
export function VoiceMode({ chat, coach, close }) {
  const c = useRef(chat)
  c.current = chat
  // listening | thinking | speaking | paused (and starting, before the microphone is open)
  const [phase, setPhase] = useState('starting')
  const [heard, setHeard] = useState('')
  const [said, setSaid] = useState({ who: coach === BOTH ? 'hercules' : coach, text: '' })
  const [demo, setDemo] = useState(null)
  const live = useRef(true)
  const loop = useRef(0)            // the current run of the loop: a new run makes the old one stop
  const stopListening = useRef(null)
  const interrupt = useRef(null)    // ends what is being read now, so the loop goes on to listen

  const say = async (text, who) => {
    const words = speakable(text)
    if (!words) return
    setSaid({ who, text: words })
    setPhase('thinking')
    // A voice that never says it has finished (a WebView without voices) does not hold the
    // conversation: it goes on after about the time the words take to say.
    let giveUp
    const enough = new Promise(r => { giveUp = r; setTimeout(r, 90000) })
    interrupt.current = () => { stopSpeaking().catch(() => {}); giveUp() }
    const began = () => { setPhase('speaking'); setTimeout(giveUp, 4000 + words.length * 90) }
    try { await Promise.race([speak(words, { who: voiceOf(who), onStart: began }), enough]) } catch { /* shown on screen instead */ }
    interrupt.current = null
  }

  const hear = () => new Promise(resolve => {
    setHeard('')
    let last = '', done = false
    // A recogniser that never starts or never stops counts as silence.
    const guard = setTimeout(() => { stopListening.current?.(); end(last.trim()) }, 60000)
    const end = v => { if (!done) { done = true; clearTimeout(guard); stopListening.current = null; resolve(v) } }
    listen({
      onReady: () => setPhase('listening'),
      onText: text => { if (text) { last = text; setHeard(text) } },
      onEnd: error => { if (error) useUI.getState().toast(t('The microphone stopped: {0}', error)); end(last.trim()) },
    }).then(stop => { stopListening.current = stop; if (!live.current) stop({ cancel: true }) }, e => end(e?.code === 'permission' ? false : ''))
  })

  const run = async () => {
    const me = ++loop.current
    const going = () => live.current && loop.current === me
    let silent = 0
    while (going()) {
      const text = await hear()
      if (!going()) return
      if (text === false) { useUI.getState().toast(t('Allow the microphone to talk to your coach.')); break }
      if (!text) { if (++silent >= 2) break; continue }
      silent = 0
      setDemo(demoFor(text, useStore.getState().S))
      setPhase('thinking')
      const answers = (await c.current.send(text, { all: true })) || []
      if (!going()) return
      if (!answers.length) await say(c.current.err || t('I could not answer that. Try again.'), coach === BOTH ? 'hercules' : coach)
      for (const a of answers) {
        if (!going()) return
        await say(splitActions(a.content).text, a.coach)
      }
    }
    // Not listening any more: the microphone closes now, so music sounds right again.
    if (going()) { setPhase('paused'); releaseMic() }
  }
  const halt = () => {
    loop.current++
    stopListening.current?.({ cancel: true })
    stopListening.current = null
    interrupt.current?.()
    releaseMic()
    stopSpeaking().catch(() => {})
  }

  useEffect(() => {
    live.current = true
    track('coach.voice')
    warmVoice()
    run()
    return () => { live.current = false; halt() }
  }, [])
  // Escape (a keyboard) ends voice mode too.
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') end() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const end = () => { halt(); close() }
  // The coach: while it speaks, a tap cuts it short (it listens next); while it listens, a tap
  // sends what was said; paused, a tap starts listening again.
  const tapCoach = () => {
    if (phase === 'speaking') interrupt.current?.()
    else if (phase === 'listening') stopListening.current?.()
    else if (phase === 'paused') run()
  }
  const toggleMic = () => {
    if (phase === 'paused') { run(); return }
    halt()
    setPhase('paused')
  }

  const speaker = phase === 'speaking' || phase === 'thinking' ? said.who : coach === BOTH ? 'hercules' : coach
  const name = coachName(speaker)
  const status = {
    starting: t('Opening the microphone…'),
    listening: t('I am listening…'),
    thinking: t('{0} is thinking…', name),
    speaking: t('{0} is speaking. Tap to interrupt.', name),
    paused: t('Paused. Tap the microphone to talk.'),
  }[phase]

  return createPortal(<div className={'vmode ' + phase} role="dialog" aria-modal="true" aria-label={t('Voice mode')}>
    <div className="vmode-top">
      <span className="vmode-title"><Icon name="waveform" />{t('Voice mode')}</span>
      <button className="iconbtn" onClick={end} aria-label={t('End voice mode')} title={t('End voice mode')}><Icon name="xmark" /></button>
    </div>
    <div className="vmode-mid">
      <button className="vmode-orb" onClick={tapCoach} aria-label={status}>
        <span className="vmode-ring" aria-hidden="true" />
        <span className="vmode-ring two" aria-hidden="true" />
        <Avatar size="xl" badge={false} live={phase === 'speaking'} coach={speaker} />
      </button>
      <div className="vmode-name">{name}</div>
      <div className="vmode-status" aria-live="polite">{status}</div>
      {demo && <ExerciseDemo ex={demo} />}
      <div className="vmode-words">
        {heard && phase !== 'speaking' && <p className="vmode-heard">“{heard}”</p>}
        {said.text && (phase === 'speaking' || phase === 'paused') && <p className="vmode-said">{said.text.length > 320 ? said.text.slice(0, 319) + '…' : said.text}</p>}
      </div>
    </div>
    <div className="vmode-bar">
      <button className={'vmode-b' + (phase === 'listening' ? ' on' : '')} onClick={toggleMic}
        aria-label={phase === 'paused' ? t('Talk') : t('Pause')} title={phase === 'paused' ? t('Talk') : t('Pause')}>
        <Icon name={phase === 'paused' ? 'mic' : 'pauseFill'} />
      </button>
      <button className="vmode-b end" onClick={end} aria-label={t('End voice mode')} title={t('End voice mode')}><Icon name="xmark" /></button>
    </div>
  </div>, document.body)
}
