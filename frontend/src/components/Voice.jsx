// Olympus: the microphone of the AI coach chats (lib/voice.js). Tap to dictate, tap the stop square
// to stop; what is understood fills the message. Voice mode, a spoken conversation, is its own
// button and screen (components/VoiceMode.jsx).
import { useEffect, useRef, useState } from 'react'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { canListen, listen, releaseMic } from '../lib/voice.js'
import Icon from './Icon.jsx'
import '../voice.css'
import { calledByName, openGuide } from '../lib/calliope.js'

/** Whether this device can dictate; null while it is being asked. */
export function useCanListen() {
  const [can, setCan] = useState(null)
  useEffect(() => { let live = true; canListen().then(v => { if (live) setCan(v) }, () => { if (live) setCan(false) }); return () => { live = false } }, [])
  return can
}

/**
 * The mic button: dictation into the text box. `onText(text)` while talking, `onFinal(text)` once
 * it stops, `onSilence()` when it stopped with nothing heard. `control` (a ref) gets { start, stop }
 * so a caller can start listening by itself (Chiron's sheet).
 *
 * While it records, the microphone becomes a stop square: a tap ends the recording, sends what was
 * said to be written out, and closes the microphone at once. A tap while it is still opening (the
 * permission prompt, a slow phone) cancels it as soon as it is open: before, that tap did nothing
 * and the microphone stayed on with no way to stop it but waiting for a pause.
 */
// A sentence that starts with the guide's name is hers, whoever the microphone belongs to
// (lib/calliope.js calledByName); `guide={false}` leaves it to the caller (her own sheet).
export function MicButton({ onText, onFinal, onSilence, disabled, control, guide = true }) {
  const can = useCanListen()
  // off | starting (opening the microphone) | on (recording) | wait (being written out)
  const [phase, setPhase] = useState('off')
  const stopRef = useRef(null)
  const pending = useRef(null)   // a stop asked for while the microphone was still opening
  const start = async () => {
    if (stopRef.current) return
    let last = ''
    pending.current = null
    try {
      setPhase('starting')
      // Starting: a stop is remembered, and done once the microphone is open (closing it under the
      // opening would end in an error).
      const remember = opts => { pending.current = opts || { cancel: true } }
      remember.placeholder = true
      stopRef.current = remember
      const stop = await listen({
        onReady: () => setPhase(p => (p === 'starting' ? 'on' : p)),
        onText: text => { if (text) { last = text; onText?.(text) } },
        onEnd: error => {
          stopRef.current = null; setPhase('off')
          // One sentence dictated: the microphone closes at once. A voice conversation (`control`)
          // listens again right away and keeps it until it is over.
          if (!control) releaseMic()
          if (error) useUI.getState().toast(t('The microphone stopped: {0}', error))
          const said = last.trim()
          const forGuide = guide && said ? calledByName(said) : null
          if (forGuide !== null && openGuide(forGuide)) onText?.('')
          else if (said) onFinal?.(said); else onSilence?.()
        },
      })
      if (!stopRef.current) return   // it already ended
      stopRef.current = stop
      if (pending.current) { const opts = pending.current; pending.current = null; stopNow(opts) }
    } catch (e) {
      stopRef.current = null; setPhase('off')
      useUI.getState().toast(e?.code === 'permission' ? t('Allow the microphone to talk to your coach.') : t('Dictation is not available on this device.'))
    }
  }
  const stopNow = opts => {
    const stop = stopRef.current
    if (!stop) return
    if (stop.placeholder) { stop(opts); return }
    if (!opts?.cancel) setPhase(p => (p === 'off' ? p : 'wait'))
    stop(opts)
    if (!control) releaseMic()
  }
  const stop = opts => stopNow(opts)
  useEffect(() => () => { stopRef.current?.({ cancel: true }); releaseMic() }, [])
  if (control) control.current = { start, stop, get on() { return !!stopRef.current } }
  if (!can) return null
  const on = phase === 'on' || phase === 'starting'
  const label = phase === 'wait' ? t('Writing out what you said…') : on ? t('Stop dictation') : t('Dictate a message')
  return <button type="button" className={'mic' + (on ? ' on' : '') + (phase === 'wait' ? ' wait' : '')} disabled={(disabled && !on) || phase === 'wait'}
    onClick={() => (on ? stop() : start())} aria-pressed={on} aria-label={label} title={label}>
    <Icon name={on ? 'stopFill' : 'mic'} />
  </button>
}
