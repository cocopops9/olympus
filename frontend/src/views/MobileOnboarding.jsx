// Mobile build only, first launch: the choice useStore.boot() couldn't make on its own — keep
// everything on this device, or connect to a self-hosted Olympus server instead. See
// lib/remote.js for the pairing flow this hands off to.
import { useState, useRef, useEffect } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import Logo from '../components/Logo.jsx'
import { Button } from '../components/ui.jsx'
import { askAddDeviceData } from '../sheets.jsx'
import { normalizeServerUrl } from '../lib/remote.js'
import { loadCfAccess, saveCfAccess } from '../lib/cf-access.js'
import { DEFAULT_SERVER } from '../lib/app-info.js'
import { MIN_PASSWORD, looksLikeEmail, passwordError } from '../components/PasswordAuth.jsx'
import { pendingInvite, clearPendingInvite } from '../lib/referral.js'
import { appConfig, appForgot, appUsername } from '../lib/api.js'
import { googleAvailable, googleIdToken } from '../lib/google.js'
import Icon from '../components/Icon.jsx'
import '../account.css'

// A plain http:// server works (#428), but whatever the app sends, the pairing code and then its
// token, crosses the network readable. Said once under the field, not in the way: on a home
// network that is often a fine trade. localhost is the phone itself and needs no warning.
export function plainHttp(raw) {
  const base = /^\s*http:\/\//i.test(String(raw || '')) ? normalizeServerUrl(raw) : null
  if (!base) return false
  const host = new URL(base).hostname
  return !/^(localhost|127\.\d+\.\d+\.\d+|\[::1\])$/i.test(host)
}


// `server`: the address the token is most likely for (the one being typed into ConnectSheet).
const openCfAccess = server => useUI.getState().openSheet(close => <CfAccessSheet close={close} server={server} />)

// A server behind Cloudflare Access (lib/cf-access.js): the service token that lets this phone
// through, entered before pairing because the pairing request has to get through as well. It is
// saved with the address of its server and only ever sent there, so the sheet asks for that
// address too and says it: a stored token shows the server it belongs to, not `server`.
export function CfAccessSheet({ close, server = '' }) {
  const [addr, setAddr] = useState(typeof server === 'string' ? server : '')
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [had, setHad] = useState(false)
  const [busy, setBusy] = useState(false)
  const origin = normalizeServerUrl(addr)
  useEffect(() => {
    loadCfAccess().then(c => { if (c) { setClientId(c.clientId); setClientSecret(c.clientSecret); setHad(true); if (c.origin) setAddr(c.origin) } })
  }, [])
  const save = async (id, secret) => {
    if (!!id.trim() !== !!secret.trim()) { useUI.getState().toast(t('Enter both the Client ID and the Client Secret')); return }
    if (id.trim() && !origin) { useUI.getState().toast(t('Enter the address of the server this token is for')); return }
    setBusy(true)
    try {
      const saved = await saveCfAccess({ clientId: id, clientSecret: secret, server: origin })
      close()
      useUI.getState().toast(saved ? t('Saved') : t('Removed'))
    } catch (e) { useUI.getState().toast(e.message || t('Could not save')) }
    finally { setBusy(false) }
  }
  return <>
    <h3>{t('Cloudflare Access')}</h3>
    <div className="muted small" style={{ marginBottom: 14 }}>
      {t('Only if your server is behind Cloudflare Access: the service token this phone sends with every request to it. Kept in this phone’s secure storage.')}
    </div>
    <input className="input" placeholder={t('Server address (e.g. gym.example.com)')} value={addr} aria-label={t('Server address (e.g. gym.example.com)')}
      onChange={e => setAddr(e.target.value)} autoCapitalize="none" autoCorrect="off" inputMode="url" />
    {origin && <div className="dim small" role="note" style={{ marginTop: 8, lineHeight: 1.45, overflowWrap: 'anywhere' }}>
      {t('Sent only to {0}, never to another server.', new URL(origin).host)}
    </div>}
    <div style={{ height: 10 }} />
    <input className="input" placeholder="CF-Access-Client-Id" value={clientId}
      onChange={e => setClientId(e.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
    <div style={{ height: 10 }} />
    <input className="input" type="password" placeholder="CF-Access-Client-Secret" value={clientSecret}
      onChange={e => setClientSecret(e.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="off" />
    <div style={{ height: 12 }} />
    <Button variant="primary" onClick={() => save(clientId, clientSecret)} disabled={busy}>{t('Save')}</Button>
    {had && <>
      <div style={{ height: 10 }} />
      <Button icon="trash" onClick={() => save('', '')} disabled={busy}>{t('Remove')}</Button>
    </>}
  </>
}

// `again`: a phone whose server stopped accepting it (components/ServerSync.jsx pairAgain) — the
// address it had is filled in when it still has one, so only the new code is left to type, and
// the sheet says that what the phone kept is merged, not replaced.
export function ConnectSheet({ close, initialUrl = '', again = false }) {
  const { connectToServer } = useStore()
  const [url, setUrl] = useState(initialUrl)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  // Why the last try failed, under the fields: a toast is gone in two seconds, too soon to read
  // "the server was reached but refused the app's request" and act on it (#329).
  const [error, setError] = useState('')
  const ref = useRef(null)
  const codeRef = useRef(null)
  useEffect(() => { setTimeout(() => (initialUrl ? codeRef : ref).current?.focus(), 250) }, [])
  const go = async () => {
    if (!url.trim() || !code.trim()) { useUI.getState().toast(t('Enter your server address and the code')); return }
    setBusy(true)
    setError('')
    try { await connectToServer(url.trim(), code.trim(), askAddDeviceData); close(); useUI.getState().toast(t('Connected')) }
    catch (e) { setError(e.message || t('Could not connect')) }
    finally { setBusy(false) }
  }
  return <>
    <h3>{again ? t('Pair again') : t('Connect to my server')}</h3>
    <div className="muted small" style={{ marginBottom: 14 }}>
      {again
        ? t('Open Settings → Account → “Pair the mobile app” on your Olympus site in a browser and enter the new code shown there. What this phone kept is merged into your account.')
        : t('Open Settings → Account → “Pair the mobile app” on the Olympus site you’re already signed into, then enter its address and the code shown there.')}
    </div>
    <input ref={ref} className="input" placeholder={t('Server address (e.g. gym.example.com)')} value={url}
      onChange={e => setUrl(e.target.value)} autoCapitalize="none" autoCorrect="off" inputMode="url" />
    {plainHttp(url) && <div className="dim small" role="note" style={{ marginTop: 8, lineHeight: 1.45 }}>
      {t('Plain http:// isn’t encrypted. Fine on your home network, but use https:// if your server is reachable from the internet.')}
    </div>}
    <div style={{ height: 10 }} />
    <input ref={codeRef} className="input" placeholder={t('Pairing code')} maxLength={8} value={code}
      onChange={e => setCode(e.target.value.toUpperCase())} style={{ letterSpacing: '.14em', fontWeight: 600, textAlign: 'center' }} />
    {error && <div className="small" role="alert" style={{ color: 'var(--red)', marginTop: 10, lineHeight: 1.45, overflowWrap: 'anywhere' }}>{error}</div>}
    <div style={{ height: 12 }} />
    <Button variant="primary" onClick={go} disabled={busy}>{busy ? t('Connecting…') : t('Connect')}</Button>
    <div style={{ height: 10 }} />
    <Button icon="key" onClick={() => openCfAccess(normalizeServerUrl(url) || '')} disabled={busy}>{t('Cloudflare Access')}</Button>
  </>
}

/* Olympus: an account on the app's own server (lib/app-info.js DEFAULT_SERVER), the way most
   apps do it. Create account: a unique username, an e-mail to recover it with, a password typed
   twice. Sign in: username or e-mail and the password, with "Forgot password?" sending a 6-digit
   code to the account's e-mail. Continue with Google where the server has it set up
   (lib/google.js). The session then lasts (90 days, renewed while the app is used): nobody signs
   in again on every start. Creating an account moves what this phone already logged into it
   (adoptProfile); signing in to one that has data asks first. `mode`: 'signup' | 'login' | 'forgot'. */

// What the server offers before anyone signs in (Google, reset by e-mail), asked once per start.
let configAsk = null
export function useServerConfig() {
  const [cfg, setCfg] = useState(null)
  useEffect(() => {
    if (!DEFAULT_SERVER) return
    configAsk = configAsk || appConfig(DEFAULT_SERVER).catch(() => { configAsk = null; return null })
    let live = true
    configAsk.then(c => { if (live) setCfg(c || {}) })
    return () => { live = false }
  }, [])
  return cfg
}
export const _resetServerConfig = () => { configAsk = null }

export function accountError(e) {
  switch (e?.data?.code || e?.code) {
    case 'username-too-short': return t('A username has at least {0} characters.', 3)
    case 'username-too-long': return t('A username has at most {0} characters.', 20)
    case 'username-chars': return t('Use only letters, digits, dots and underscores, with no spaces.')
    case 'username-reserved': return t('That username is reserved. Pick another one.')
    case 'name-taken': return t('That username is taken. Pick another one.')
    case 'email-missing': return t('Enter your e-mail.')
    case 'reset-invalid': return t('That code is not right. Check the e-mail and try again.')
    case 'reset-expired': return t('That code has expired. Ask for a new one.')
    case 'mail-off': return t('Resetting a password by e-mail is not available yet. Ask the app’s owner for help.')
    case 'google-off': return t('Google sign-in is not available yet.')
    case 'google-email': return t('That Google account has no verified e-mail.')
    case 'google-invalid': case 'google-failed': return t('Google sign-in did not work. Try again.')
    case 'no-account': return t('Add a Google account to this phone first, in the phone’s settings.')
  }
  return passwordError(e)
}

const USERNAME_RE = /^[A-Za-z0-9](?:[A-Za-z0-9._]*[A-Za-z0-9_])?$/
const usernameLocal = n => (n.length < 3 ? 'username-too-short' : n.length > 20 ? 'username-too-long' : !USERNAME_RE.test(n) || n.includes('..') ? 'username-chars' : null)

// The username field's verdict while it is typed: the local rules at once, the server's answer
// (taken or free) a moment after the typing stops.
function useUsernameCheck(name, on) {
  const [st, setSt] = useState({ state: 'idle' })
  useEffect(() => {
    const n = name.trim()
    if (!on || !n) { setSt({ state: 'idle' }); return }
    const bad = usernameLocal(n)
    if (bad) { setSt({ state: 'bad', code: bad }); return }
    setSt({ state: 'checking' })
    let live = true
    const tm = setTimeout(() => {
      appUsername(DEFAULT_SERVER, n).then(r => { if (live) setSt(r.available ? { state: 'free' } : { state: 'bad', code: r.code }) }, () => { if (live) setSt({ state: 'idle' }) })
    }, 450)
    return () => { live = false; clearTimeout(tm) }
  }, [name, on])
  return st
}

function GoogleButton({ clientId, busy, setBusy, setErr, done, invite }) {
  const joinServer = useStore(s => s.joinServer)
  if (!googleAvailable(clientId)) return null
  const go = async () => {
    setBusy(true); setErr('')
    try {
      const idToken = await googleIdToken(clientId)
      await joinServer(DEFAULT_SERVER, 'google', { idToken, ...(invite ? { ref: invite } : {}) }, askAddDeviceData)
      clearPendingInvite()
      done(useStore.getState().user?.name)
    } catch (e) { if (e?.code !== 'cancelled') setErr(accountError(e)) }
    finally { setBusy(false) }
  }
  return <>
    <div className="acct-or"><span>{t('or')}</span></div>
    <button type="button" className="acct-google" disabled={busy} onClick={go}>
      <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
      {t('Continue with Google')}
    </button>
  </>
}

export function AccountSheet({ close, mode: start = 'signup' }) {
  const joinServer = useStore(s => s.joinServer)
  const cfg = useServerConfig()
  const [mode, setMode] = useState(start)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [again, setAgain] = useState('')
  const [code, setCode] = useState('')
  const [sentTo, setSentTo] = useState('')
  // An invite code: from the link the app was opened with, or typed (lib/referral.js).
  const [ref, setRef] = useState(() => pendingInvite())
  const [showRef, setShowRef] = useState(() => !!pendingInvite())
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [info, setInfo] = useState('')
  const firstRef = useRef(null)
  useEffect(() => { setTimeout(() => firstRef.current?.focus(), 250) }, [mode])
  const signup = mode === 'signup', login = mode === 'login', forgot = mode === 'forgot', reset = mode === 'reset'
  const user = useUsernameCheck(name, signup)
  const field = { autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false }
  const go = m => { setErr(''); setInfo(''); setMode(m) }
  const done = (who, made) => {
    close()
    useUI.getState().toast(made ? t('Welcome, {0}', who) : t('Welcome back, {0}', useStore.getState().user?.name || who))
  }
  const mismatch = (signup || reset) && again && pw !== again

  const submit = async ev => {
    ev.preventDefault()
    if (busy) return
    const n = name.trim(), mail = email.trim()
    let bad = null
    if (signup) {
      bad = !n ? t('Choose a username.') : usernameLocal(n) ? accountError({ code: usernameLocal(n) })
        : user.state === 'bad' ? accountError({ code: user.code })
        : !mail ? t('Enter your e-mail.') : !looksLikeEmail(mail) ? t('That is not an e-mail address.')
        : [...pw].length < MIN_PASSWORD ? t('Use at least {0} characters.', MIN_PASSWORD)
        : pw !== again ? t('The two passwords are not the same.') : null
    } else if (login) {
      bad = !n ? t('Enter your username or e-mail.') : !pw ? t('Enter your password.') : null
    } else if (forgot) {
      bad = !looksLikeEmail(mail) ? t('Enter the e-mail of your account.') : null
    } else if (reset) {
      bad = code.replace(/\D/g, '').length !== 6 ? t('Enter the 6-digit code from the e-mail.')
        : [...pw].length < MIN_PASSWORD ? t('Use at least {0} characters.', MIN_PASSWORD)
        : pw !== again ? t('The two passwords are not the same.') : null
    }
    if (bad) { setErr(bad); return }
    setBusy(true); setErr('')
    try {
      if (forgot) {
        await appForgot(DEFAULT_SERVER, mail)
        setSentTo(mail); setCode(''); setPw(''); setAgain('')
        go('reset')
        setInfo(t('If an account uses {0}, a 6-digit code is on its way. Check the spam folder too.', mail))
      } else if (reset) {
        await joinServer(DEFAULT_SERVER, 'reset', { email: sentTo, resetCode: code.replace(/\D/g, ''), password: pw }, askAddDeviceData)
        done(useStore.getState().user?.name, false)
        useUI.getState().toast(t('Password changed. You are signed in.'))
      } else {
        await joinServer(DEFAULT_SERVER, signup ? 'signup' : 'login', signup
          ? { name: n, password: pw, email: mail, ...(ref.trim() ? { ref: ref.trim() } : {}) }
          : { name: n, password: pw }, askAddDeviceData)
        if (signup) clearPendingInvite()
        done(n, signup)
      }
    } catch (e) { setErr(accountError(e)) }
    finally { setBusy(false) }
  }

  const resend = async () => {
    setBusy(true); setErr('')
    try { await appForgot(DEFAULT_SERVER, sentTo); setInfo(t('A new code is on its way to {0}.', sentTo)) } catch (e) { setErr(accountError(e)) } finally { setBusy(false) }
  }

  const title = signup ? t('Create account') : login ? t('Sign in') : forgot ? t('Reset your password') : t('Enter the code')
  const lead = signup ? t('Your username is how friends find you. The e-mail is only used to recover your account.')
    : login ? t('Welcome back. Sign in with your username or e-mail.')
      : forgot ? (cfg && cfg.password_reset === false ? t('Resetting a password by e-mail is not available yet. Ask the app’s owner for help.') : t('Enter the e-mail of your account and we send you a 6-digit code to choose a new password.'))
        : t('Type the code from the e-mail and choose a new password.')
  const hint = user.state === 'checking' ? <span className="acct-hint dim">{t('Checking…')}</span>
    : user.state === 'free' ? <span className="acct-hint ok"><Icon name="check" /> {t('Available')}</span>
      : user.state === 'bad' ? <span className="acct-hint bad">{accountError({ code: user.code })}</span>
        : <span className="acct-hint dim">{t('3 to 20 letters, digits, dots or underscores.')}</span>

  return <div className="acct">
    <h3>{title}</h3>
    <div className="muted small acct-lead">{lead}</div>
    <form onSubmit={submit} noValidate>
      {(signup || login) && <>
        <label className="acct-l" htmlFor="acct-name">{signup ? t('Username') : t('Username or e-mail')}</label>
        <input id="acct-name" ref={firstRef} className={'input' + (signup && user.state === 'bad' ? ' invalid' : '')} name="username" autoComplete="username"
          maxLength={signup ? 20 : 254} value={name} onChange={e => setName(e.target.value.replace(/\s/g, signup ? '' : ' '))} {...field} />
        {signup && hint}
      </>}
      {(signup || forgot) && <>
        <label className="acct-l" htmlFor="acct-mail">{t('E-mail')}</label>
        <input id="acct-mail" ref={forgot ? firstRef : undefined} className="input" type="email" name="email" autoComplete="email" inputMode="email" maxLength={254}
          value={email} onChange={e => setEmail(e.target.value)} {...field} />
      </>}
      {reset && <>
        {info && <div className="acct-info small">{info}</div>}
        <label className="acct-l" htmlFor="acct-code">{t('Code')}</label>
        <input id="acct-code" ref={firstRef} className="input acct-code" inputMode="numeric" autoComplete="one-time-code" maxLength={7}
          value={code} onChange={e => setCode(e.target.value.replace(/[^\d ]/g, ''))} />
      </>}
      {(signup || login || reset) && <>
        <label className="acct-l" htmlFor="acct-pw">{reset ? t('New password') : t('Password')}</label>
        <input id="acct-pw" className="input" type="password" name={login ? 'password' : 'new-password'} autoComplete={login ? 'current-password' : 'new-password'}
          value={pw} onChange={e => setPw(e.target.value)} />
      </>}
      {login && <button type="button" className="acct-link acct-forgot" onClick={() => { setEmail(name.includes('@') ? name.trim() : ''); go('forgot') }}>{t('Forgot password?')}</button>}
      {(signup || reset) && <>
        <label className="acct-l" htmlFor="acct-pw2">{t('Confirm password')}</label>
        <input id="acct-pw2" className={'input' + (mismatch ? ' invalid' : '')} type="password" name="new-password-again" autoComplete="new-password"
          value={again} onChange={e => setAgain(e.target.value)} />
        <span className={'acct-hint' + (mismatch ? ' bad' : ' dim')}>{mismatch ? t('The two passwords are not the same.') : t('At least {0} characters. A few unrelated words make a good one.', MIN_PASSWORD)}</span>
      </>}
      {signup && (showRef
        ? <>
          <label className="acct-l" htmlFor="acct-ref">{t('Invite code')}</label>
          <input id="acct-ref" className="input" name="invite" maxLength={12} value={ref} onChange={e => setRef(e.target.value.toUpperCase())} {...field} />
        </>
        : <button type="button" className="acct-link" onClick={() => setShowRef(true)}>{t('Have an invite code?')}</button>)}
      {err && <div className="small acct-err" role="alert">{err}</div>}
      <div style={{ height: 14 }} />
      <Button type="submit" variant="primary" disabled={busy || (forgot && cfg?.password_reset === false)}>
        {busy ? t('Connecting…') : signup ? t('Create account') : login ? t('Sign in') : forgot ? t('Send code') : t('Set new password')}</Button>
    </form>
    {reset && <button type="button" className="acct-link acct-center" disabled={busy} onClick={resend}>{t('Send the code again')}</button>}
    {(signup || login) && <GoogleButton clientId={cfg?.google_client_id} busy={busy} setBusy={setBusy} setErr={setErr} done={who => done(who, false)} invite={signup ? ref.trim() : ''} />}
    <div className="acct-foot small">
      {signup ? <>{t('Already have an account?')} <button type="button" className="acct-link" onClick={() => go('login')}>{t('Sign in')}</button></>
        : login ? <>{t('New to Olympus?')} <button type="button" className="acct-link" onClick={() => go('signup')}>{t('Create account')}</button></>
          : <button type="button" className="acct-link" onClick={() => go('login')}>{t('Back to sign in')}</button>}
    </div>
  </div>
}
export const openAccountSheet = mode => useUI.getState().openSheet(close => <AccountSheet close={close} mode={mode} />)

// Continuing without an account: said plainly what that leaves out before it is chosen.
function LocalSheet({ close }) {
  const { chooseLocalMode } = useStore()
  return <div className="acct">
    <h3>{t('Continue without an account?')}</h3>
    <div className="muted small acct-lead">{t('Everything you log stays on this phone only. Without an account there is no feed or friends, no AI coaches, no invites and no sync or backup to the cloud. You can create an account later in Settings and your training comes with you.')}</div>
    <Button variant="primary" onClick={() => { close(); openAccountSheet('signup') }}>{t('Create account')}</Button>
    <div style={{ height: 8 }} />
    <Button onClick={() => { close(); chooseLocalMode() }}>{t('Continue without an account')}</Button>
  </div>
}

export default function MobileOnboarding() {
  const { chooseLocalMode } = useStore()
  const cfg = useServerConfig()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const wrap = { display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: '86vh', textAlign: 'center' }
  return (
    <div className="narrow acct-welcome" style={wrap}>
      <Logo />
      <h1 style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-.028em', margin: '10px 0 4px' }}>Olympus</h1>
      {DEFAULT_SERVER ? <>
        <div className="muted" style={{ marginBottom: 34 }}>{t('Train, follow your progress and share it with friends.')}</div>
        <Button variant="primary" onClick={() => openAccountSheet('signup')}>{t('Create account')}</Button>
        <div style={{ height: 10 }} />
        <Button onClick={() => openAccountSheet('login')}>{t('Sign in')}</Button>
        <GoogleButton clientId={cfg?.google_client_id} busy={busy} setBusy={setBusy} setErr={setErr} done={who => useUI.getState().toast(t('Welcome, {0}', who))} invite={pendingInvite()} />
        {err && <div className="small acct-err" role="alert">{err}</div>}
        <div style={{ height: 18 }} />
        <button type="button" className="acct-link acct-center" onClick={() => useUI.getState().openSheet(close => <LocalSheet close={close} />)}>{t('Continue without an account')}</button>
        <div className="dim small" style={{ marginTop: 6, lineHeight: 1.45 }}>{t('Only on this phone: no feed, AI coaches or sync.')}</div>
        <div style={{ height: 22 }} />
        <button type="button" className="acct-link acct-center dim small" onClick={() => openCfAccess()}>{t('Connection settings')}</button>
      </> : <>
        <div className="muted" style={{ marginBottom: 34 }}>{t('How do you want to use Olympus?')}</div>
        <Button variant="primary" icon="lock" onClick={() => chooseLocalMode()}>{t('Use on this device')}</Button>
        <div style={{ height: 10 }} />
        <Button icon="cloud" onClick={() => useUI.getState().openSheet(close => <ConnectSheet close={close} />)}>{t('Connect to my server')}</Button>
        <div className="dim small" style={{ marginTop: 26, lineHeight: 1.5 }}>
          {t('Local keeps everything on this phone. Connecting syncs to your own Olympus server instead. You can switch later in Settings.')}
        </div>
        <div style={{ height: 18 }} />
        <Button icon="gear" onClick={() => openCfAccess()}>{t('Connection settings')}</Button>
      </>}
    </div>
  )
}
