// Olympus: setting up the coaches' offline voice (lib/local-voice.js). On the first start the
// voice for the app's language (the phone's, unless one was picked) downloads by itself, with its
// progress on screen; later, a language picked in Settings is offered its own voice. A voice
// already there, or a language without one, asks nothing. The phone's own voice stays the backup.
import { useEffect, useState } from 'react'
import { useUI } from '../store/useUI.js'
import { t, getLang } from '../lib/i18n.js'
import { LANGS } from '../lib/i18n-core.js'
import { Button, Row } from './ui.jsx'
import Icon from './Icon.jsx'
import {
  localVoicesOn, refreshLocalVoices, voiceKey, availableVoice, hasLocalVoice, installingVoice,
  installLocalVoice, voiceAsked, markVoiceAsked, onLocalVoices,
} from '../lib/local-voice.js'

const FIRST = 'olympus_voice_setup_done'
const firstDone = () => { try { return localStorage.getItem(FIRST) === '1' } catch { return true } }
const markFirst = () => { try { localStorage.setItem(FIRST, '1') } catch { /* asked again */ } }
const mb = bytes => Math.max(1, Math.round((Number(bytes) || 0) / 1e6))
const langName = () => LANGS[getLang()] || getLang()

function VoiceSetupSheet({ close, voiceKeyOf, auto }) {
  const key = voiceKeyOf
  const v = availableVoice(key)
  const [state, setState] = useState(auto ? 'loading' : 'ask')   // ask | loading | done | failed
  const [got, setGot] = useState(0)
  const [total, setTotal] = useState(v?.bytes || 0)
  const start = () => {
    setState('loading')
    installLocalVoice(key, (r, tt) => { setGot(r); if (tt) setTotal(tt) })
      .then(() => { setState('done'); useUI.getState().toast(t('The coach’s voice is ready.')); setTimeout(close, 900) })
      .catch(() => setState('failed'))
  }
  useEffect(() => { if (auto) start() }, [])
  const pct = total ? Math.min(100, Math.round(got * 100 / total)) : 0
  return <div className="vsetup">
    <div className="vsetup-i"><Icon name="mic" /></div>
    <h3>{t('The coach’s voice')}</h3>
    <p className="muted small">{state === 'ask'
      ? t('Install the voice Chiron and Hercules use for {0}? It works offline, with no daily limit ({1} MB).', langName(), mb(v?.bytes))
      : t('Downloading the voice Chiron and Hercules use for {0}. It works offline, with no daily limit ({1} MB).', langName(), mb(v?.bytes))}</p>
    {(state === 'loading' || state === 'done') && <>
      <div className="vsetup-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><i style={{ width: (state === 'done' ? 100 : pct) + '%' }} /></div>
      <div className="small dim vsetup-n">{state === 'done' ? t('Done') : t('{0} of {1} MB', mb(got), mb(total))}</div>
    </>}
    {state === 'failed' && <p className="small acct-err">{t('The voice could not be downloaded. Check the connection and try again.')}</p>}
    <div style={{ height: 12 }} />
    {state === 'ask' && <>
      <Button variant="primary" onClick={start}>{t('Install')}</Button>
      <div style={{ height: 8 }} />
      <Button variant="ghost" onClick={close}>{t('Not now')}</Button>
    </>}
    {state === 'loading' && <Button variant="ghost" onClick={close}>{t('Continue in the background')}</Button>}
    {state === 'failed' && <>
      <Button variant="primary" onClick={start}>{t('Try again')}</Button>
      <div style={{ height: 8 }} />
      <Button variant="ghost" onClick={close}>{t('Not now')}</Button>
    </>}
    <p className="small dim vsetup-foot">{t('Until then, and for Athena, the phone’s own voice is used.')}</p>
  </div>
}

export function openVoiceSetup({ auto = false } = {}) {
  const key = voiceKey()
  if (!availableVoice(key) || hasLocalVoice(key)) return false
  markVoiceAsked(key)
  markFirst()
  useUI.getState().openSheet(close => <VoiceSetupSheet close={close} voiceKeyOf={key} auto={auto} />, { kind: 'center' })
  return true
}

/**
 * On the first start (once the app is past sign-in) and whenever the language changes: the voice
 * for the language downloads (first start) or is offered (a language picked later).
 */
export function useVoiceSetup({ ready, blocked, lang }) {
  useEffect(() => {
    if (!ready || blocked || !localVoicesOn()) return
    let live = true
    refreshLocalVoices().then(() => {
      if (!live) return
      const key = voiceKey()
      if (!availableVoice(key) || hasLocalVoice(key) || installingVoice(key) || voiceAsked(key)) return
      openVoiceSetup({ auto: !firstDone() })
    })
    return () => { live = false }
  }, [ready, blocked, lang])
}

/** The Settings row: the coach's voice for the language, installed or one tap away. */
export function VoiceSetupRow() {
  const [, bump] = useState(0)
  useEffect(() => { if (localVoicesOn()) refreshLocalVoices(); return onLocalVoices(() => bump(n => n + 1)) }, [])
  const key = voiceKey()
  if (!localVoicesOn() || !availableVoice(key)) return null
  const have = hasLocalVoice(key)
  return <Row icon="mic" iconTint="var(--orange)" title={t('Coach’s voice')}
    subtitle={have ? t('Installed for {0}: works offline.', langName()) : installingVoice(key) ? t('Downloading…') : t('Not installed for {0} ({1} MB).', langName(), mb(availableVoice(key)?.bytes))}
    accessory={have ? 'none' : 'chevron'} onClick={have || installingVoice(key) ? undefined : () => openVoiceSetup({ auto: false })} />
}
