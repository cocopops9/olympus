// Olympus: the microphone of the AI coach chats (lib/voice.js). Tap to dictate, tap again to stop;
// what is understood fills the message as it is said. In voice mode (the full-screen coach) the
// message goes by itself when you stop talking, and the answer is read aloud.
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
 * The mic button. `onText(text)` while talking, `onFinal(text)` once it stops, `onSilence()` when
 * it stopped with nothing heard. `control` (a ref) gets { start, stop } so voice mode can start
 * listening after an answer has been read. With `onStopVoice` (voice mode), the button is voice
 * mode's own: it shows the microphone as on and a tap ends voice mode.
 */
// A sentence that starts with the guide's name is hers, whoever the microphone belongs to
// (lib/calliope.js calledByName); `guide={false}` leaves it to the caller (her own sheet).
export function MicButton({ onText, onFinal, onSilence, disabled, control, onStopVoice, guide = true }) {
  const can = useCanListen()
  const [on, setOn] = useState(false)
  const stopRef = useRef(null)
  const start = async () => {
    if (stopRef.current) return
    let last = ''
    // Olympus: a stop tapped while the microphone is still opening (the permission prompt, the
    // first second) used to do nothing, and the microphone then stayed on with no way to close it.
    // Now it is remembered and the microphone is closed the moment it is open.
    let stopEarly = null
    try {
      setOn(true)
      stopRef.current = opts => { stopEarly = opts || {} }   // starting: a stop now waits for it
      const stopper = await listen({
        onText: text => { if (text) { last = text; onText?.(text) } },
        onEnd: error => {
          stopRef.current = null; setOn(false)
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
      stopRef.current = stopper
      if (stopEarly) stopper?.(stopEarly)
    } catch (e) {
      stopRef.current = null; setOn(false)
      useUI.getState().toast(e?.code === 'permission' ? t('Allow the microphone to talk to your coach.') : t('Dictation is not available on this device.'))
    }
  }
  const stop = opts => { stopRef.current?.(opts) }
  useEffect(() => () => { stopRef.current?.({ cancel: true }); releaseMic() }, [])
  if (control) control.current = { start, stop, get on() { return !!stopRef.current } }
  if (!can) return null
  if (onStopVoice) return <button type="button" className={'mic voice' + (on ? ' on' : '')} onClick={() => { stopRef.current?.({ cancel: true }); releaseMic(); onStopVoice() }}
    aria-label={t('Stop voice mode')} title={t('Stop voice mode')}>
    <Icon name="mic" />
  </button>
  // While it listens the button is a stop button, a square, so it is plain how to close it.
  return <button type="button" className={'mic' + (on ? ' on' : '')} disabled={disabled && !on} onClick={() => (on ? stop() : start())}
    aria-pressed={on} aria-label={on ? t('Stop dictation') : t('Dictate a message')} title={on ? t('Stop dictation') : t('Dictate a message')}>
    {on ? <span className="mic-stop" aria-hidden="true" /> : <Icon name="mic" />}
  </button>
}

/**
 * Olympus: voice mode, as in ChatGPT or Claude: a button beside the microphone that starts a spoken
 * conversation with the coach (it listens, the coach answers aloud, it listens again). Shown only
 * where the device can dictate.
 */
export function VoiceModeButton({ onStart, disabled }) {
  const can = useCanListen()
  if (!can) return null
  return <button type="button" className="voice-go" disabled={disabled} onClick={onStart} aria-label={t('Voice mode')} title={t('Voice mode')}>
    <Icon name="wave" />
  </button>
}
