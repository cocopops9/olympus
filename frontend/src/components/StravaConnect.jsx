// Settings → Strava: once connected, every finished workout is posted to the athlete's Strava feed
// (lib/strava-post.js), where their Strava community can see it; disconnecting is one tap away.
// The server holds the Strava tokens and posts (supabase/functions/olympus/strava.js); this page
// asks it how the connection stands, starts the approval in the browser (or the Strava app) and
// ends it. Coming back from the approval, the page asks again, which is when it turns connected.
import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { MOBILE } from '../lib/mobile.js'
import { t, dateLocale } from '../lib/i18n.js'
import { useUI } from '../store/useUI.js'
import { useStore } from '../store/useStore.js'
import { confirmSheet } from '../sheets.jsx'
import { Section, Row } from './ui.jsx'

// Strava's orange (Strava brand guidelines, "Strava Orange" #FC5200).
export const STRAVA_ORANGE = '#FC5200'

/** The Strava tile: an orange square with a mountain-road mark, drawn for this page. */
export function StravaTile({ size = 54 }) {
  return <span className="strava-tile" style={{ width: size, height: size }} aria-hidden="true">
    <svg viewBox="0 0 24 24" width={size * 0.6} height={size * 0.6}>
      <path d="M10.2 3 4.5 14h3.4l2.3-4.4 2.3 4.4h3.4z" fill="#fff" />
      <path d="M15.9 14 14.2 17.3 12.5 14H10l4.2 8 4.2-8z" fill="#fff" opacity=".7" />
    </svg>
  </span>
}

const day = ms => new Date(ms).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'long', year: 'numeric' })

// The account's connection as the training document keeps it (lib/strava-post.js S.stravaOn), so
// workouts are queued on every device of the account, offline too.
function remember(on) {
  const { S, update } = useStore.getState()
  if (!!S.stravaOn === on) return
  update(s => { s.stravaOn = on; if (!on) s.stravaQ = {} })
}

export function StravaPage() {
  const toast = useUI(s => s.toast)
  // null while asking; the server's answer; { missing: true } on a server without Strava.
  const [st, setSt] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = () => api('/api/strava').then(
    r => { setSt(r); if (r.available) remember(!!r.on) },
    e => setSt(e.status === 404 ? { missing: true } : { error: true }))
  useEffect(() => {
    load()
    const onVisible = () => { if (document.visibilityState === 'visible') load().catch(() => {}) }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  const connect = async () => {
    setBusy(true)
    try {
      const r = await api('/api/strava/connect', { method: 'POST', body: JSON.stringify({ mobile: MOBILE }) })
      window.open(r.url, '_blank', 'noopener')
    } catch (e) {
      toast(e?.data?.code === 'no-strava' ? t('Strava is not set up on this server yet.') : t('Could not reach Strava. Try again in a moment.'))
    }
    setBusy(false)
  }
  const remove = () => confirmSheet({
    title: t('Disconnect Strava?'),
    message: t('New workouts will no longer be posted to Strava. Activities already there stay. You can connect again at any time.'),
    confirmText: t('Disconnect'), danger: true,
    onConfirm: async () => {
      try {
        await api('/api/strava/delete', { method: 'POST', body: '{}' })
        remember(false)
        setSt(s => ({ ...s, on: false }))
        toast(t('Strava disconnected'))
      } catch { toast(t('Could not disconnect. Try again in a moment.')) }
    },
  })

  const unavailable = st && (st.missing || st.available === false)
  const ready = st && !unavailable && !st.error
  return <>
    <div className="strava-hero">
      <StravaTile />
      <div className="strava-hero-m">
        <div className="strava-hero-t">Strava</div>
        <div className="strava-hero-s">{t('Once connected, your workouts appear in your Strava feed and you can share them with your Strava community. You can disconnect Strava at any time.')}</div>
      </div>
    </div>

    {!st && <Section><Row icon="hourglass" iconTint="var(--grey)" title={t('Checking…')} /></Section>}
    {st?.error && <Section><Row icon="warning" iconTint="var(--orange)" title={t('The server could not be reached.')} accessory="chevron" onClick={load} /></Section>}
    {st?.missing && <Section><Row icon="info" iconTint="var(--grey)" title={t('This server does not offer Strava.')} /></Section>}
    {st?.available === false && <Section><Row icon="info" iconTint="var(--grey)" title={t('Strava is not set up on this server yet.')} /></Section>}

    {ready && !st.on && <Section footer={t('Strava opens to ask whether Olympus may upload your activities. Afterwards, come back to Olympus.')}>
      <div className="strava-actions">
        <button className="strava-connect" disabled={busy} onClick={connect}>
          {busy ? t('Connecting…') : <>{t('Connect with')} <b style={{ color: STRAVA_ORANGE }}>STRAVA</b></>}
        </button>
      </div>
    </Section>}

    {ready && st.on && <Section title={t('Connection')} footer={t('Each workout you finish is posted to Strava with its exercises and sets, also when you finish it offline.')}>
      <Row icon="checkCircle" iconTint="var(--green)" title={st.athlete?.name ? t('Connected as {0}', st.athlete.name) : t('Connected')}
        value={st.since ? day(st.since) : null} />
      <Row icon="share" iconTint={STRAVA_ORANGE} title={t('Workouts posted')} value={String(st.posted || 0)} />
      <Row icon="signOut" iconTint="var(--red)" title={t('Disconnect Strava')} danger onClick={remove} />
    </Section>}
  </>
}
