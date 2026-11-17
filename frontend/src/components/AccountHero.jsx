// The top of Settings → Account: who is signed in, on which server, and whether things are in
// step, in one glance. The rows below it (components/ServerSync.jsx) stay the place to act.
import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { t } from '../lib/i18n.js'
import { fmtAgo } from '../lib/format.js'
import { socialReady, fetchProfile } from '../lib/social.js'
import { Avatar } from './Social.jsx'
import Icon from './Icon.jsx'
import { connectionView, hostOf, useOnline } from './ServerSync.jsx'

export const FACE_KEY = 'olympus_settings_face'

/** The profile picture as others see it: kept from the last visit, refreshed once the account can reach its server. */
export function useFace(user) {
  const [face, setFace] = useState(() => { try { return user ? JSON.parse(localStorage.getItem(FACE_KEY))?.[user.id] ?? null : null } catch { return null } })
  useEffect(() => {
    if (!socialReady(user)) return
    let live = true
    fetchProfile().then(p => {
      if (!live) return
      const a = p?.user?.avatar || null
      setFace(a)
      try { localStorage.setItem(FACE_KEY, JSON.stringify({ [user.id]: a })) } catch { /* shown, not kept */ }
    }, () => {})
    return () => { live = false }
  }, [user?.id])
  return face
}

export default function AccountHero() {
  const user = useStore(s => s.user)
  const sync = useStore(s => s.sync)
  const online = useOnline()
  const face = useFace(user)
  if (!user) return null
  const view = sync ? connectionView(sync, { online }) : null
  const initial = String(user.name || '?').trim().charAt(0).toUpperCase()
  return <div className="acc-hero">
    {socialReady(user) ? <span className="acc-av acc-face"><Avatar user={{ ...user, avatar: face }} /></span>
      : <span className="acc-av" aria-hidden="true">{initial}</span>}
    <div className="acc-name">{user.name}</div>
    {sync?.server && <div className="acc-host"><Icon name="globe" />{t('Connected to {0}', hostOf(sync.server))}</div>}
    {view && <div className={'acc-chip ' + view.tone}><i aria-hidden="true" />{view.line}</div>}
    {view && sync.lastSynced ? <div className="acc-when">{t('Last synced: {0}', fmtAgo(sync.lastSynced))}</div> : null}
  </div>
}
