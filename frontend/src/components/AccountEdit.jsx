// Olympus: the account part of Edit profile: your name, your password and your sex (optional,
// and only used to draw a male or a female body in the app: the muscle maps and the body you
// tap to pick exercises).
import { useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { api } from '../lib/api.js'
import { PasswordSheet } from './PasswordAuth.jsx'
import { Button, Row, Section, Segmented } from './ui.jsx'

const toast = m => useUI.getState().toast(m)

const nameError = e => (e?.data?.code === 'name-taken' ? t('Another profile already signs in with this name.')
  : e?.data?.code === 'missing' ? t('Enter a name') : (e?.message || t('Could not connect')))

function NameSheet({ close, onSaved }) {
  const user = useStore(s => s.user)
  const [name, setName] = useState(user?.name || '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const save = async ev => {
    ev?.preventDefault()
    const n = name.trim()
    if (!n) { setErr(t('Enter a name')); return }
    if (n === user?.name) { close(); return }
    setBusy(true); setErr('')
    try {
      await api('/api/account/name', { method: 'POST', body: JSON.stringify({ name: n }) })
      useStore.setState(s => ({ user: s.user ? { ...s.user, name: n } : s.user }))
      onSaved?.(n)
      close()
      toast(t('You now sign in as “{0}”', n))
    } catch (e) { setErr(nameError(e)) } finally { setBusy(false) }
  }
  return <form onSubmit={save} noValidate>
    <h3>{t('Change name')}</h3>
    <div className="muted small" style={{ marginBottom: 12 }}>{t('Others see this name, and you sign in with it.')}</div>
    <input className="input" autoFocus maxLength={40} value={name} onChange={e => setName(e.target.value)}
      autoCapitalize="none" autoCorrect="off" spellCheck={false} name="username" autoComplete="username" />
    {err && <div className="small" role="alert" style={{ color: 'var(--red)', marginTop: 10 }}>{err}</div>}
    <div style={{ height: 12 }} />
    <Button type="submit" variant="primary" disabled={busy}>{t('Save')}</Button>
  </form>
}

async function openPassword() {
  try {
    const status = await api('/api/account/password')
    useUI.getState().openSheet(close => <PasswordSheet status={status} close={close} done={() => {}} />)
  } catch (e) { toast(e?.message || t('Could not connect')) }
}

/** Sex as the two body figures the app draws; '' when it was never chosen. */
export const SEX_OPTIONS = () => [
  { value: 'male', label: t('Male') },
  { value: 'female', label: t('Female') },
]

export function AccountSection({ onRenamed }) {
  const user = useStore(s => s.user)
  const body = useStore(s => s.S.body)
  const update = useStore(s => s.update)
  return <Section title={t('Account')} footer={t('Sex is optional. It only chooses the body drawn in the app: the muscle maps and the body you tap to pick exercises.')}>
    <Row icon="person" iconTint="var(--blue)" title={t('Name')} subtitle={user?.name} accessory="chevron"
      onClick={() => useUI.getState().openSheet(close => <NameSheet close={close} onSaved={onRenamed} />)} />
    <Row icon="key" iconTint="var(--orange)" title={t('Change password')} accessory="chevron" onClick={openPassword} />
    <Row icon="figureStrength" iconTint="var(--pink)" title={t('Sex')}>
      <Segmented className="acct-sex" value={body === 'female' ? 'female' : 'male'} options={SEX_OPTIONS()}
        onChange={v => update(s => { s.body = v })} />
    </Row>
  </Section>
}
