// Olympus: the account part of Edit profile: your name, your e-mail, your password and your sex
// (optional, and only used to draw a male or a female body in the app: the muscle maps and the
// body you tap to pick exercises). The sign-in rows (name, e-mail, password) are also in
// Settings → Account (SignInSection), where people look for them first.
import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { api } from '../lib/api.js'
import { PasswordSheet, looksLikeEmail, foldEmail, notReached, useAgainOnceReached } from './PasswordAuth.jsx'
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

// A new e-mail address (POST /api/account/email): the current password first (a profile made
// with Google has none and skips it), then the 6-digit code the server sent to the new address
// (POST /api/account/email/confirm). The old address keeps working until the code comes back.
// A server that cannot send e-mail answers without `pending` and the address is saved at once.
const emailError = e => {
  const c = e?.data?.code
  return c === 'email-invalid' ? t('That is not an e-mail address.')
    : c === 'email-taken' ? t('Another profile already uses this e-mail address.')
    : c === 'current-wrong' ? t('That password is not right.')
    : c === 'current-required' ? t('Enter your password.')
    : c === 'locked' ? t('Too many attempts. Try again in a few minutes.')
    : c === 'wait' ? t('Wait a minute before asking for another code.')
    : c === 'limit' ? t('Too many codes today. Try again tomorrow.')
    : c === 'mail-failed' ? t('The e-mail could not be sent right now. Try again later, or ask the app’s owner for help.')
    : c === 'code-wrong' ? t('That code is not right. Check the e-mail and try again.')
    : c === 'code-expired' || c === 'code-none' ? t('That code has expired. Ask for a new one.')
    : (e?.message || t('Could not connect'))
}

export function EmailSheet({ status, close, done }) {
  const hasPw = !!status?.set
  const [email, setEmail] = useState(status?.emailPending || '')
  const [current, setCurrent] = useState('')
  const [step, setStep] = useState(status?.emailPending ? 'code' : 'edit')   // 'edit' | 'code'
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const clean = email.trim()
  const finish = saved => {
    close(); done?.(saved)
    toast(t('E-mail saved'))
  }
  const ask = async ev => {
    ev?.preventDefault()
    if (busy) return
    const bad = !clean || !looksLikeEmail(clean) ? t('That is not an e-mail address.')
      : foldEmail(clean) === status?.email ? t('That is already your sign-in e-mail.')
      : hasPw && !current ? t('Enter your password.')
      : null
    if (bad) { setErr(bad); return }
    setBusy(true); setErr(null)
    try {
      const r = await api('/api/account/email', { method: 'POST', body: JSON.stringify({ email: clean, ...(hasPw ? { current } : {}) }) })
      if (r?.pending) { setStep('code'); setCode('') } else finish(r?.email || foldEmail(clean))
    } catch (e) { setErr(emailError(e)) } finally { setBusy(false) }
  }
  const confirm = async ev => {
    ev?.preventDefault()
    if (busy) return
    const digits = code.replace(/\D/g, '')
    if (digits.length !== 6) { setErr(t('Enter the 6-digit code from the e-mail.')); return }
    setBusy(true); setErr(null)
    try {
      const r = await api('/api/account/email/confirm', { method: 'POST', body: JSON.stringify({ code: digits }) })
      finish(r?.email || foldEmail(clean))
    } catch (e) { setErr(emailError(e)) } finally { setBusy(false) }
  }
  const errLine = err && <div className="small" role="alert" style={{ color: 'var(--red)', marginTop: 10 }}>{err}</div>
  if (step === 'code') return <form onSubmit={confirm} noValidate>
    <h3>{t('Check your e-mail')}</h3>
    <div className="muted small" style={{ marginBottom: 12, lineHeight: 1.5 }}>
      {t('We sent a 6-digit code to {0}. Enter it here to use this address. Until then your old one stays.', clean)}
    </div>
    <input className="input" autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={8} placeholder="000000"
      value={code} onChange={e => setCode(e.target.value)} aria-label={t('Code')} style={{ letterSpacing: 4, fontSize: 20 }} />
    {errLine}
    <div style={{ height: 12 }} />
    <Button type="submit" variant="primary" disabled={busy}>{t('Confirm')}</Button>
    <div style={{ height: 8 }} />
    <Button type="button" variant="ghost" className="dim" disabled={busy} onClick={() => { setErr(null); setStep('edit') }}>{t('Change the address or send again')}</Button>
  </form>
  return <form onSubmit={ask} noValidate>
    <h3>{t('Change e-mail')}</h3>
    <div className="muted small" style={{ marginBottom: 12, lineHeight: 1.5 }}>
      {status?.emailCodes ? t('A forgotten password is reset through this address. We send a code to the new one to check it is yours.')
        : t('A forgotten password is reset through this address.')}
    </div>
    {status?.email && <div className="dim small" style={{ marginBottom: 8, overflowWrap: 'anywhere' }}>{t('Now: {0}', status.email)}</div>}
    <input className="input" type="email" name="email" autoComplete="email" inputMode="email" placeholder={t('New e-mail address')} maxLength={254}
      autoFocus value={email} onChange={e => setEmail(e.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
    {hasPw && <>
      <div style={{ height: 10 }} />
      <input className="input" type="password" name="current-password" autoComplete="current-password" placeholder={t('Current password')}
        value={current} onChange={e => setCurrent(e.target.value)} />
    </>}
    {errLine}
    <div style={{ height: 12 }} />
    <Button type="submit" variant="primary" disabled={busy}>{status?.emailCodes ? t('Send code') : t('Save')}</Button>
  </form>
}

// GET /api/account/password, kept fresh: whether there is a password, the e-mail, a pending one.
function useAccountStatus() {
  const [st, setSt] = useState(null)
  const [unreached, setUnreached] = useState(false)
  const load = () => api('/api/account/password').then(r => { setSt(r); setUnreached(false) }).catch(e => setUnreached(notReached(e)))
  useEffect(() => { load() }, [])
  useAgainOnceReached(unreached, load)
  return [st, load]
}

/** Name, e-mail and password: the rows that change how you sign in. */
/** The name sheet on its own: Settings → Account opens it from the name under the picture. */
export function openNameSheet(onSaved) {
  return useUI.getState().openSheet(close => <NameSheet close={close} onSaved={onSaved} />)
}

/** Name, e-mail and password rows; `name: false` leaves the name out where it is shown (and
    edited) already, as under the picture in Settings → Account. */
export function SignInRows({ onRenamed, name = true }) {
  const user = useStore(s => s.user)
  const [st, reload] = useAccountStatus()
  const emailSub = !st ? null
    : st.emailPending ? t('Waiting for the code sent to {0}', st.emailPending)
    : st.email || t('Not set yet')
  // A profile made with Google has no password to change: it sets one through the e-mail code.
  const hasPw = st ? !!st.set : true
  return <>
    {name && <Row icon="person" iconTint="var(--blue)" title={t('Name')} subtitle={user?.name} accessory="chevron"
      onClick={() => openNameSheet(onRenamed)} />}
    <Row icon="envelope" iconTint="var(--indigo)" title={t('E-mail')} subtitle={emailSub} accessory="chevron"
      onClick={() => st ? useUI.getState().openSheet(close => <EmailSheet status={st} close={close} done={reload} />) : toast(t('Could not connect'))} />
    <Row icon="key" iconTint="var(--orange)" title={t('Password')} subtitle={hasPw ? t('Change password') : t('Set a password')} accessory="chevron"
      onClick={hasPw ? openPassword : openReset} />
    {hasPw && <Row icon="lock" iconTint="var(--teal)" title={t('Forgot your password?')} subtitle={t('Get a code by e-mail and choose a new one')} accessory="chevron" onClick={openReset} />}
  </>
}

/** Settings → Account: e-mail and password in a section of their own; the name is the title of
    the page, under the picture (components/AccountHero.jsx), and is changed by tapping it. */
export function SignInSection() {
  return <Section title={t('Sign-in details')} footer={t('Your name is what others see and what you sign in with. A forgotten password is reset through your e-mail.')}>
    <SignInRows name={false} />
  </Section>
}

async function openPassword() {
  try {
    const status = await api('/api/account/password')
    useUI.getState().openSheet(close => <PasswordSheet status={status} close={close} done={() => {}} />)
  } catch (e) { toast(e?.message || t('Could not connect')) }
}

// Forgot the current password while signed in: the same reset as on the sign-in screen, a code
// sent to the account's e-mail (views/MobileOnboarding.jsx AccountSheet), the address filled in.
async function openReset() {
  let email = ''
  try { email = (await api('/api/account/password'))?.email || '' } catch { /* typed by hand */ }
  const { openAccountSheet } = await import('../views/MobileOnboarding.jsx')
  openAccountSheet('forgot', { email })
}

// Olympus: deleting the profile for good (POST /api/account/delete): the account, its training,
// and everything of it in the social layer. Confirmed with the password, or, for a profile made
// with Google or Apple that has none, by typing DELETE. Then this device signs out.
function DeleteSheet({ status, close }) {
  const hasPw = !!status?.set
  const [v, setV] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const ok = hasPw ? v.length > 0 : v.trim() === 'DELETE'
  const go = async () => {
    if (!ok || busy) return
    setBusy(true); setErr(null)
    try {
      await api('/api/account/delete', { method: 'POST', body: JSON.stringify(hasPw ? { password: v } : { confirm: 'DELETE' }) })
      close()
      await useStore.getState().signOut({ force: true }).catch(() => {})
      toast(t('Your profile has been deleted.'))
    } catch (e) {
      setBusy(false)
      setErr(e?.data?.code === 'current-wrong' ? t('That password is not right.') : (e?.message || t('Could not connect')))
    }
  }
  return <form onSubmit={e => { e.preventDefault(); go() }}>
    <h3>{t('Delete your profile?')}</h3>
    <p className="muted" style={{ lineHeight: 1.5 }}>{t('Your profile, your training, your posts, photos, likes, comments and follows are deleted for good. This cannot be undone.')}</p>
    {hasPw
      ? <input className="field" type="password" autoComplete="current-password" value={v} onChange={e => setV(e.target.value)}
        placeholder={t('Your password')} aria-label={t('Your password')} autoFocus />
      : <input className="field" value={v} onChange={e => setV(e.target.value)} autoCapitalize="characters"
        placeholder={t('Type DELETE to confirm')} aria-label={t('Type DELETE to confirm')} autoFocus />}
    {err && <p className="small" style={{ color: 'var(--red)' }}>{err}</p>}
    <div style={{ height: 12 }} />
    <button type="submit" className="btn danger" disabled={!ok || busy}>{busy ? t('Deleting…') : t('Delete my profile')}</button>
    <div style={{ height: 8 }} />
    <Button variant="ghost" className="dim" type="button" onClick={close}>{t('Cancel')}</Button>
  </form>
}

async function openDelete() {
  try {
    const status = await api('/api/account/password')
    useUI.getState().openSheet(close => <DeleteSheet status={status} close={close} />)
  } catch (e) { toast(e?.message || t('Could not connect')) }
}

/** Sex as the two body figures the app draws; '' when it was never chosen. */
export const SEX_OPTIONS = () => [
  { value: 'male', label: t('Male') },
  { value: 'female', label: t('Female') },
]

export function AccountSection({ onRenamed }) {
  const body = useStore(s => s.S.body)
  const birth = useStore(s => s.S.birth)
  const update = useStore(s => s.update)
  return <Section title={t('Account')} footer={t('Sex and date of birth are optional. Sex chooses the body drawn in the app; with your body weight, both give your strength level at the main lifts.')}>
    <SignInRows onRenamed={onRenamed} />
    <Row icon="figureStrength" iconTint="var(--pink)" title={t('Sex')}>
      <Segmented className="acct-sex" value={body === 'female' ? 'female' : 'male'} options={SEX_OPTIONS()}
        onChange={v => update(s => { s.body = v })} />
    </Row>
    <Row icon="calendar" iconTint="var(--teal)" title={t('Date of birth')}>
      <input className="input acct-birth" type="date" min="1920-01-01" max={new Date().toISOString().slice(0, 10)} value={birth || ''}
        aria-label={t('Date of birth')} onChange={e => update(s => { s.birth = e.target.value || null })} />
    </Row>
    <Row icon="trash" iconTint="var(--red)" title={t('Delete profile')} danger accessory="chevron" onClick={openDelete} />
  </Section>
}
