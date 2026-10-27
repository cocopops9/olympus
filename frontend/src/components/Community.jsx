// Olympus: the three things a person does for the app itself. Invite friends (lib/referral.js),
// send feedback to the developer, and agree or not to share usage statistics (lib/telemetry.js).
// All three need a server profile; the owner sees the results in views/Owner.jsx.
import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { api } from '../lib/api.js'
import { t, tn } from '../lib/i18n.js'
import { MOBILE } from '../lib/mobile.js'
import { fetchReferral, shareInvite } from '../lib/referral.js'
import { startTelemetry, stopTelemetry, track } from '../lib/telemetry.js'
import { Button, TextArea } from './ui.jsx'
import Icon from './Icon.jsx'
import '../community.css'

/* ------------------------------ invite ------------------------------ */

function InviteSheet({ close }) {
  const toast = useUI(s => s.toast)
  const [d, setD] = useState(null)
  const [err, setErr] = useState(null)
  const load = () => { setErr(null); fetchReferral().then(setD, e => setErr(e.message || t('Could not load your invite code.'))) }
  useEffect(load, [])
  const share = async () => {
    const how = await shareInvite(d.code, { mobile: MOBILE })
    if (how === 'shared' || how === 'copied') track('invite.share')
    if (how === 'copied') toast(t('Invite copied: paste it in a message.'))
    if (how === 'failed') toast(t('Could not share the invite.'))
  }
  const copyCode = () => { navigator.clipboard?.writeText(d.code).then(() => toast(t('Code copied')), () => {}) }
  return <div className="cm-sheet">
    <h3>{t('Invite friends')}</h3>
    <p className="small muted">{t('Send a friend the app with your invite code. When they create their account with it, they count as invited by you.')}</p>
    {err ? <div className="cm-err small">{err}<div><Button size="sm" variant="tinted" icon="reset" onClick={load}>{t('Try again')}</Button></div></div>
      : !d ? <div className="cm-code cm-loading" aria-busy="true">······</div>
        : <>
          <button className="cm-code" onClick={copyCode} aria-label={t('Copy the code {0}', d.code)}>{d.code}<Icon name="copy" /></button>
          <div className="cm-joined"><Icon name="person" />{d.invited ? tn('{0} friend joined with your code', '{0} friends joined with your code', d.invited) : t('Nobody has joined with your code yet.')}</div>
          <Button variant="primary" icon="share" onClick={share}>{t('Share invite')}</Button>
        </>}
    <div style={{ height: 8 }} />
    <Button onClick={close}>{t('Done')}</Button>
  </div>
}
export const inviteSheet = () => useUI.getState().openSheet(close => <InviteSheet close={close} />)

/* ------------------------------ feedback ----------------------------- */

const QUESTIONS = [
  ['clarity', () => t('How clear and easy to use is the app?'), () => t('Confusing'), () => t('Very clear')],
  ['enjoy', () => t('How much do you like it?'), () => t('Not at all'), () => t('A lot')],
  ['useful', () => t('How useful is it for your training?'), () => t('Not useful'), () => t('Very useful')],
]

function Scale({ value, onChange, from, to, label, low, high }) {
  const steps = Array.from({ length: to - from + 1 }, (_, i) => from + i)
  return <div className="cm-q" role="group" aria-label={label}>
    <div className="cm-ql">{label}</div>
    <div className={'cm-scale' + (steps.length > 5 ? ' wide' : '')}>
      {steps.map(v => <button key={v} className={'cm-pt' + (value === v ? ' on' : '') + (value != null && v <= value && steps.length <= 5 ? ' fill' : '')}
        aria-pressed={value === v} onClick={() => onChange(value === v ? null : v)}>{v}</button>)}
    </div>
    <div className="cm-ends small dim"><span>{low}</span><span>{high}</span></div>
  </div>
}

function FeedbackSheet({ close }) {
  const toast = useUI(s => s.toast)
  const [r, setR] = useState({})
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const set = k => v => setR(x => ({ ...x, [k]: v }))
  const any = Object.values(r).some(v => v != null) || text.trim()
  const send = async () => {
    setBusy(true); setErr(null)
    const ratings = Object.fromEntries(Object.entries(r).filter(([, v]) => v != null))
    try {
      await api('/api/feedback', { method: 'POST', body: JSON.stringify({ ratings, text: text.trim(), platform: MOBILE ? 'android' : 'web', version: __APP_VERSION__ }) })
      track('feedback.send')
      toast(t('Thank you: your feedback was sent.'))
      close()
    } catch (e) {
      setErr(e?.data?.code === 'feedback-limit' ? t('You have sent a lot of feedback today. Try again tomorrow.')
        : e?.status ? (e.message || t('Could not send your feedback.')) : t('Could not reach the server. Check your connection and try again.'))
    } finally { setBusy(false) }
  }
  return <div className="cm-sheet">
    <h3>{t('Send feedback')}</h3>
    <p className="small muted">{t('A few quick ratings and anything you want to say. It goes straight to the developer. Every question is optional.')}</p>
    {QUESTIONS.map(([k, q, lo, hi]) => <Scale key={k} value={r[k] ?? null} onChange={set(k)} from={1} to={5} label={q()} low={lo()} high={hi()} />)}
    <Scale value={r.recommend ?? null} onChange={set('recommend')} from={0} to={10} label={t('How likely are you to recommend Olympus to a friend?')} low={t('Not likely')} high={t('Very likely')} />
    <div className="cm-q">
      <div className="cm-ql">{t('Anything else?')}</div>
      <TextArea rows={4} maxLength={4000} value={text} onChange={e => setText(e.target.value)} placeholder={t('What works, what does not, bugs, ideas')} />
    </div>
    {err && <div className="cm-err small" role="alert">{err}</div>}
    <Button variant="primary" icon="envelope" disabled={!any || busy} onClick={send}>{busy ? t('Sending…') : t('Send')}</Button>
    <div style={{ height: 8 }} />
    <Button onClick={close}>{t('Cancel')}</Button>
  </div>
}
export const feedbackSheet = () => useUI.getState().openSheet(close => <FeedbackSheet close={close} />)

/* ------------------------------ usage statistics --------------------- */

export function setTelemetry(on) {
  useStore.getState().update(s => { s.telemetry = !!on })
  if (!on) stopTelemetry({ forget: true })
}

export const TELEMETRY_WHAT = () => t('When you open the app, how long you use it, which screens you visit and which features you use. Never your workouts, measurements, messages or notes.')

function ConsentSheet({ close }) {
  const answer = on => { setTelemetry(on); close() }
  return <div className="cm-sheet">
    <div className="cm-ic"><Icon name="chartLine" /></div>
    <h3>{t('Help improve Olympus')}</h3>
    <p className="small">{t('Would you share usage statistics with the developer? It shows what is used and what is hard to find.')}</p>
    <p className="small muted">{TELEMETRY_WHAT()}</p>
    <p className="small muted">{t('They are linked to your account. You can turn this off at any time in Settings, which also deletes what was sent.')}</p>
    <Button variant="primary" onClick={() => answer(true)}>{t('Share statistics')}</Button>
    <div style={{ height: 8 }} />
    <Button onClick={() => answer(false)}>{t('No thanks')}</Button>
  </div>
}
export const consentSheet = () => useUI.getState().openSheet(close => <ConsentSheet close={close} />, { locked: true, onBack: close => { setTelemetry(false); close() } })

/**
 * In the app shell: asks once (a quiet moment after boot, never over a workout or another sheet),
 * and runs lib/telemetry.js while the answer is yes. `path` is the current route.
 */
export function useTelemetry({ ready, server, path }) {
  const S = useStore(s => s.S)
  const on = ready && server && S.telemetry === true
  useEffect(() => {
    if (!ready || !server || S.telemetry != null || import.meta.env?.MODE === 'test') return
    const tm = setInterval(() => {
      const st = useStore.getState().S
      if (st.telemetry != null) { clearInterval(tm); return }
      if (useUI.getState().sheets.length || st.active) return
      clearInterval(tm)
      consentSheet()
    }, 6000)
    return () => clearInterval(tm)
  }, [ready, server, S.telemetry])
  useEffect(() => {
    if (!on) return
    startTelemetry(path)
    return () => { stopTelemetry() }
  }, [on])
  return on
}
