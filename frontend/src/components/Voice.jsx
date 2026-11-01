// Olympus: the microphone of the AI coach chats (lib/voice.js). Tap to dictate, tap again to stop;
// what is understood fills the message as it is said. In voice mode (the full-screen coach) the
// message goes by itself when you stop talking, and the answer is read aloud.
import { useEffect, useRef, useState } from 'react'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { canListen, listen } from '../lib/voice.js'
import Icon from './Icon.jsx'
import '../voice.css'

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
export function MicButton({ onText, onFinal, onSilence, disabled, control, onStopVoice }) {
  const can = useCanListen()
  const [on, setOn] = useState(false)
  const stopRef = useRef(null)
  const start = async () => {
    if (stopRef.current) return
    let last = ''
    try {
      setOn(true)
      stopRef.current = () => {}   // starting: a second start waits
      stopRef.current = await listen({
        onText: text => { if (text) { last = text; onText?.(text) } },
        onEnd: error => {
          stopRef.current = null; setOn(false)
          if (error) useUI.getState().toast(t('The microphone stopped: {0}', error))
          if (last.trim()) onFinal?.(last.trim()); else onSilence?.()
        },
      })
    } catch (e) {
      stopRef.current = null; setOn(false)
      useUI.getState().toast(e?.code === 'permission' ? t('Allow the microphone to talk to your coach.') : t('Dictation is not available on this device.'))
    }
  }
  const stop = opts => { stopRef.current?.(opts) }
  useEffect(() => () => stopRef.current?.({ cancel: true }), [])
  if (control) control.current = { start, stop, get on() { return !!stopRef.current } }
  if (!can) return null
  if (onStopVoice) return <button type="button" className={'mic voice' + (on ? ' on' : '')} onClick={() => { stopRef.current?.({ cancel: true }); onStopVoice() }}
    aria-label={t('Stop voice mode')} title={t('Stop voice mode')}>
    <Icon name="mic" />
  </button>
  return <button type="button" className={'mic' + (on ? ' on' : '')} disabled={disabled && !on} onClick={() => (on ? stop() : start())}
    aria-pressed={on} aria-label={on ? t('Stop dictation') : t('Dictate a message')} title={on ? t('Stop dictation') : t('Dictate a message')}>
    <Icon name="mic" />
  </button>
}
