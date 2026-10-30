// Olympus: when a newer build of the app is out, it says so as soon as it opens, and one tap
// installs it: downloaded natively, checked against the checksum the release publishes, handed
// to Android's installer (lib/update.js). Asked once per start; "Later" leaves it until the next
// one. Android app only.
import { useEffect, useRef, useState } from 'react'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { MOBILE, isAndroid } from '../lib/mobile.js'
import { checkForUpdate, downloadAndInstall, fetchChecksum, UPDATES_ON } from '../lib/update.js'
import { Button } from './ui.jsx'
import Icon from './Icon.jsx'

function UpdateSheet({ info, close }) {
  const [busy, setBusy] = useState(false)
  const [pct, setPct] = useState(null)
  const [error, setError] = useState(null)
  const install = async () => {
    setBusy(true); setError(null)
    try {
      let hash = null
      try { hash = await fetchChecksum(info.hashUrl) } catch { /* reported below */ }
      if (!/^[0-9a-f]{64}$/i.test(hash || '')) throw new Error(t('Checksum not available, so not installing'))
      await downloadAndInstall(info.apkUrl, hash, (got, total) => { if (total > 0) setPct(Math.min(100, Math.round(got / total * 100))) })
      close()
    } catch (e) {
      setBusy(false); setPct(null)
      setError(t('Update failed: {0}', e?.message || ''))
    }
  }
  return <div className="upd">
    <div className="upd-ic"><Icon name="download" /></div>
    <h3>{t('Update available')}</h3>
    <p className="small muted">{t('A new version of Olympus is ready. It installs over this one, and your training stays.')}</p>
    {busy && <div className="upd-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? undefined}><i style={{ width: (pct ?? 4) + '%' }} /></div>}
    {error && <p className="small" style={{ color: 'var(--red)' }}>{error}</p>}
    <Button variant="primary" icon="download" disabled={busy} onClick={install}>{busy ? (pct != null ? pct + '%' : t('Downloading…')) : t('Update now')}</Button>
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
    let live = true
    const tm = setTimeout(async () => {
      try {
        if (!(await isAndroid())) return
        const info = await checkForUpdate()
        if (live && info?.hasUpdate && info.apkUrl) updateSheet(info)
      } catch { /* offline, or GitHub busy: Settings can still check */ }
    }, 1500)
    return () => { live = false; clearTimeout(tm) }
  }, [ready])
}
