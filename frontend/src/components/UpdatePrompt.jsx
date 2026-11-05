// Olympus: when a newer build of the app is out, it says so as soon as it opens, and one tap
// starts the update: Android downloads it in the background (lib/update-job.js), a bar above the
// tab bar shows how far it got and can cancel it, and the app stays usable meanwhile, screen
// lock included. The file is checked against the checksum the release publishes before Android's
// installer opens. Asked once per start; "Later" leaves it until the next one. Android app only.
import { useEffect, useRef, useState } from 'react'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { MOBILE, isAndroid } from '../lib/mobile.js'
import { checkForUpdate, checksumOf, UPDATES_ON } from '../lib/update.js'
import { startUpdate, resumeUpdate, updateRunning } from '../lib/update-job.js'
import { Button } from './ui.jsx'
import Icon from './Icon.jsx'

function UpdateSheet({ info, close }) {
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
    <Button variant="ghost" className="dim" disabled={busy} onClick={close}>{t('Later')}</Button>
  </div>
}

export const updateSheet = info => useUI.getState().openSheet(close => <UpdateSheet info={info} close={close} />, { kind: 'center' })

/** In the app shell: once per start, after boot, a moment after the first screen is up. */
export function useUpdatePrompt(ready) {
  const asked = useRef(false)
  useEffect(() => {
    if (!MOBILE || !UPDATES_ON || !ready || asked.current) return
    asked.current = true
    // A download begun before the app was closed: followed again, and nothing asked.
    if (resumeUpdate()) return
    let live = true
    const tm = setTimeout(async () => {
      try {
        if (!(await isAndroid())) return
        const info = await checkForUpdate()
        if (live && info?.hasUpdate && info.apkUrl && !updateRunning()) updateSheet(info)
      } catch { /* offline, or GitHub busy: Settings can still check */ }
    }, 1500)
    return () => { live = false; clearTimeout(tm) }
  }, [ready])
}
