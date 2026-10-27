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

/* Olympus: joining the app's own server (lib/app-info.js DEFAULT_SERVER) with a name and a
   password, nothing else to type. Creating a profile moves what this phone already logged into
   it (adoptProfile, the same step pairing takes); signing in to a profile that has data asks
   first, as pairing does. `mode`: 'signup' or 'login'. */
export function AccountSheet({ close, mode: start = 'signup' }) {
  const joinServer = useStore(s => s.joinServer)
  const [mode, setMode] = useState(start)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [again, setAgain] = useState('')
  const [sex, setSex] = useState('')      // optional: '' = not said
  // An invite code: from the link the app was opened with, or typed (lib/referral.js).
  const [ref, setRef] = useState(() => pendingInvite())
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const nameRef = useRef(null)
  useEffect(() => { setTimeout(() => nameRef.current?.focus(), 250) }, [])
  const signup = mode === 'signup'
  const field = { autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false }
  const submit = async ev => {
    ev.preventDefault()
    if (busy) return
    const n = name.trim()
    const mail = email.trim()
    const bad = !n ? (signup ? t('Enter a name') : t('Enter your name or e-mail.'))
      : !pw ? t('Enter your password.')
      : signup && mail && !looksLikeEmail(mail) ? t('That is not an e-mail address.')
      : signup && [...pw].length < MIN_PASSWORD ? t('Use at least {0} characters.', MIN_PASSWORD)
      : signup && pw !== again ? t('The two passwords are not the same.')
      : null
    if (bad) { setErr(bad); return }
    setBusy(true); setErr('')
    try {
      await joinServer(DEFAULT_SERVER, signup ? 'signup' : 'login', { name: n, password: pw, email: mail, ...(signup && ref.trim() ? { ref: ref.trim() } : {}) }, askAddDeviceData)
      if (signup) clearPendingInvite()
      // The body figure follows the sex chosen here; not choosing leaves it as it was.
      if (signup && sex) useStore.getState().update(s => { s.body = sex })
      close()
      useUI.getState().toast(signup ? t('Welcome, {0}', n) : t('Welcome back, {0}', useStore.getState().user?.name || n))
    } catch (e) { setErr(e?.data?.code || e?.status === 429 ? passwordError(e) : (e?.message || t('Could not connect'))) }
    finally { setBusy(false) }
  }
  return <>
    <h3>{signup ? t('Create your profile') : t('Sign in with password')}</h3>
    <div className="muted small" style={{ marginBottom: 14 }}>
      {signup ? t('Pick a name and a password. You sign in with both.') : t('Use your profile name (or the e-mail you added to it) and your password.')}
    </div>
    <form onSubmit={submit} noValidate>
      <input ref={nameRef} className="input" name="username" autoComplete="username" placeholder={signup ? t('Your name') : t('Name or e-mail')}
        maxLength={signup ? 40 : 254} value={name} onChange={e => setName(e.target.value)} {...field} />
      {signup && <>
        <div style={{ height: 10 }} />
        <input className="input" type="email" name="email" autoComplete="email" inputMode="email" placeholder={t('E-mail (optional)')} maxLength={254}
          value={email} onChange={e => setEmail(e.target.value)} {...field} />
      </>}
      <div style={{ height: 10 }} />
      <input className="input" type="password" name={signup ? 'new-password' : 'password'} autoComplete={signup ? 'new-password' : 'current-password'}
        placeholder={t('Password')} value={pw} onChange={e => setPw(e.target.value)} />
      {signup && <>
        <div style={{ height: 10 }} />
        <input className="input" type="password" name="new-password-again" autoComplete="new-password" placeholder={t('Repeat the password')}
          value={again} onChange={e => setAgain(e.target.value)} />
        <div className="dim small" style={{ marginTop: 6 }}>{t('At least {0} characters. A few unrelated words make a good one.', MIN_PASSWORD)}</div>
        <div style={{ height: 10 }} />
        <input className="input" name="invite" placeholder={t('Invite code (optional)')} maxLength={12} value={ref}
          onChange={e => setRef(e.target.value.toUpperCase())} {...field} />
        <div className="small muted" style={{ margin: '14px 2px 6px' }}>{t('Sex (optional)')}</div>
        <div className="chips signup-sex" role="group" aria-label={t('Sex (optional)')}>
          {[['male', t('Male')], ['female', t('Female')], ['', t('Prefer not to say')]].map(([v, l]) =>
            <button type="button" key={v || 'none'} className={'chip nocap' + (sex === v ? ' on' : '')} aria-pressed={sex === v} onClick={() => setSex(v)}>{l}</button>)}
        </div>
      </>}
      {err && <div className="small" role="alert" style={{ color: 'var(--red)', marginTop: 10, lineHeight: 1.45, overflowWrap: 'anywhere' }}>{err}</div>}
      <div style={{ height: 12 }} />
      <Button type="submit" variant="primary" disabled={busy}>{busy ? t('Connecting…') : signup ? t('Create profile') : t('Sign in')}</Button>
    </form>
    <div style={{ height: 8 }} />
    <Button type="button" variant="ghost" className="dim" disabled={busy} onClick={() => { setErr(''); setMode(signup ? 'login' : 'signup') }}>
      {signup ? t('Sign in') : t('Create profile')}
    </Button>
  </>
}
export const openAccountSheet = mode => useUI.getState().openSheet(close => <AccountSheet close={close} mode={mode} />)

export default function MobileOnboarding() {
  const { chooseLocalMode } = useStore()
  const head = <>
    <Logo />
    <h1 style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-.028em', margin: '10px 0 4px' }}>Olympus</h1>
  </>
  const wrap = { display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: '78vh', textAlign: 'center' }
  return (
    <div className="narrow" style={wrap}>
      {head}
      <div className="muted" style={{ marginBottom: 34 }}>{t('How do you want to use Olympus?')}</div>
      {DEFAULT_SERVER ? <>
        <Button variant="primary" icon="person" onClick={() => openAccountSheet('signup')}>{t('Create profile')}</Button>
        <div style={{ height: 10 }} />
        <Button icon="key" onClick={() => openAccountSheet('login')}>{t('Sign in')}</Button>
        <div style={{ height: 10 }} />
        <Button variant="ghost" className="dim" icon="lock" onClick={() => chooseLocalMode()}>{t('Use on this device')}</Button>
      </> : <>
        <Button variant="primary" icon="lock" onClick={() => chooseLocalMode()}>{t('Use on this device')}</Button>
        <div style={{ height: 10 }} />
        <Button icon="cloud" onClick={() => useUI.getState().openSheet(close => <ConnectSheet close={close} />)}>{t('Connect to my server')}</Button>
      </>}
      <div className="dim small" style={{ marginTop: 26, lineHeight: 1.5 }}>
        {t('Local keeps everything on this phone. Connecting syncs to your own Olympus server instead. You can switch later in Settings.')}
      </div>
      <div style={{ height: 18 }} />
      <Button icon="gear" onClick={() => openCfAccess()}>{t('Connection settings')}</Button>
    </div>
  )
}
