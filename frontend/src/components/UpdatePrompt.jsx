// Olympus: when a newer build of the app is out, it says so as soon as it opens, and one tap
// starts the update: Android downloads it in the background (lib/update-job.js), a bar above the
// tab bar shows how far it got and can cancel it, and the app stays usable meanwhile, screen
// lock included. The file is checked against the checksum the release publishes before Android's
// installer opens. Asked at the start, every few minutes in front and on coming back (useUpdatePrompt). Android
// app only.
import { useEffect, useRef, useState } from 'react'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { MOBILE, isAndroid } from '../lib/mobile.js'
import { checkForUpdate, checksumOf, UPDATES_ON, UPDATE_CHECK_TTL_MS } from '../lib/update.js'
import { startUpdate, resumeUpdate, updateRunning } from '../lib/update-job.js'
import { Button } from './ui.jsx'
import Icon from './Icon.jsx'

function UpdateSheet({ info, close, onLater }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  // Only the checksum is fetched here (a few bytes); the download itself goes on in the background
  // and the sheet closes at once.
  const install = async () => {
    setBusy(true); setError(null)
    try {
      let hash = null
      try { hash = await checksumOf(info) } catch { /* reported below */ }
      await startUpdate({ apkUrl: info.apkUrl, hash, build: info.build ?? null })
      close()
    } catch (e) {
      setBusy(false)
      setError(t('Update failed: {0}', e?.message || ''))
    }
  }
  return <div className="upd">
    <div className="upd-ic"><Icon name="download" /></div>
    <h3>{t('Update available')}</h3>
    <p className="small muted">{t('A new version of Olympus is ready. It installs over this one, and your training stays.')}</p>
    {error && <p className="small" style={{ color: 'var(--red)' }}>{error}</p>}
    {error && <Button variant="tinted" icon="download" onClick={() => window.open(info.apkUrl, '_blank', 'noopener')}>{t('Download the APK from the releases page')}</Button>}
    {error && <div style={{ height: 8 }} />}
    <Button variant="primary" icon="download" disabled={busy} onClick={install}>{busy ? t('Checking…') : t('Update now')}</Button>
    <div style={{ height: 8 }} />
    <Button variant="ghost" className="dim" disabled={busy} onClick={() => { onLater?.(); close() }}>{t('Later')}</Button>
  </div>
}

export const updateSheet = (info, onLater) => useUI.getState().openSheet(close => <UpdateSheet info={info} close={close} onLater={onLater} />, { kind: 'center' })

// How long the app has to have been away before coming back asks again. Short: a build reaches the
// release a few minutes after a push to main, and the person who pushed it is usually the one
// waiting for it with the app open.
export const RECHECK_AFTER_MS = 5 * 60 * 1000
// While the app stays in front it asks again this often, the span lib/update.js keeps an answer
// for. These checks ask afresh (the timing above already spaces them), so the kept answer cannot
// make one of them a no-op. At most 6 an hour in front plus 12 for returns: inside GitHub's 60 an
// hour for an address without a token.
export const RECHECK_EVERY_MS = UPDATE_CHECK_TTL_MS

/**
 * In the app shell: a moment after the first screen is up, every few minutes while the app is in
 * front, and on coming back after a few minutes away. Android keeps the app alive in the background
 * for days, and a build published a minute after the app asked used to wait for the next half
 * hour away, so in practice it was never announced.
 * A build found while another sheet is open waits for that sheet to close instead of being dropped.
 * "Later" leaves that build alone until the app is started again; a newer build asks again.
 */
export function useUpdatePrompt(ready) {
  const state = useRef({ started: false, last: 0, dismissed: null, busy: false, pending: null })
  useEffect(() => {
    if (!MOBILE || !UPDATES_ON || !ready) return
    let live = true
    const st = state.current
    // Shows the build waiting in st.pending as soon as nothing else is on screen.
    const offer = () => {
      const info = st.pending
      if (!live || !info || updateRunning()) return
      if (st.dismissed != null && st.dismissed === info.build) { st.pending = null; return }
      if (useUI.getState().sheets.length) return   // not over something the person is doing
      st.pending = null
      updateSheet(info, () => { st.dismissed = info.build ?? null })
    }
    const check = async () => {
      if (st.busy) return
      st.busy = true
      st.last = Date.now()
      try {
        if (!(await isAndroid())) return
        const info = await checkForUpdate({ fresh: true })
        if (!live || !info?.hasUpdate || !info.apkUrl) return
        st.pending = info
        offer()
      } catch { /* offline, or GitHub busy: Settings can still check */ } finally { st.busy = false }
    }
    let tm
    if (!st.started) {
      st.started = true
      // A download begun before the app was closed is followed again, and nothing asked.
      if (!resumeUpdate()) tm = setTimeout(check, 1500)
    }
    const visible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden'
    const every = setInterval(() => { if (visible()) check() }, RECHECK_EVERY_MS)
    const unsubscribe = useUI.subscribe((s, prev) => { if (st.pending && s.sheets.length === 0 && prev.sheets.length > 0) offer() })
    const back = () => { if (Date.now() - st.last > RECHECK_AFTER_MS) check() }
    const onVisible = () => { if (document.visibilityState === 'visible') back() }
    document.addEventListener('visibilitychange', onVisible)
    let remove = null
    import('@capacitor/app').then(({ App }) => App.addListener('appStateChange', ({ isActive }) => { if (isActive) back() }))
      .then(h => { if (live) remove = h; else h?.remove?.() }).catch(() => {})
    return () => { live = false; clearTimeout(tm); clearInterval(every); unsubscribe(); document.removeEventListener('visibilitychange', onVisible); remove?.remove?.() }
  }, [ready])
}
