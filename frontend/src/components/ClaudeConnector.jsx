// Settings → Connect to Claude: one tap makes this profile's connector address, copies it and
// opens Claude's connectors page; what is left is "Add custom connector", paste, Add. The server
// makes the address and keeps only its hash (supabase/functions/olympus/connector-token.js), so
// the address is known here only right after it is made; afterwards this page says when it was
// made and last used, and makes a new one or removes it.
import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { copyText } from '../lib/clipboard.js'
import { t, dateLocale } from '../lib/i18n.js'
import { useUI } from '../store/useUI.js'
import { confirmSheet } from '../sheets.jsx'
import { Section, Row, Button } from './ui.jsx'

// Claude's own page for adding a custom connector (claude.ai, signed in). Adding one is done on
// the web (claude.ai or the desktop app); once added it works in every Claude app of that account,
// the phone apps included (support.claude.com, "Get started with custom connectors using remote MCP").
export const CLAUDE_CONNECTORS = 'https://claude.ai/customize/connectors'

const day = ms => new Date(ms).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'long', year: 'numeric' })
const openClaude = () => { try { window.open(CLAUDE_CONNECTORS, '_blank', 'noopener') } catch { /* the button below opens it */ } }

export function ClaudeConnectorPage() {
  const toast = useUI(s => s.toast)
  // null while asking; { available, on, created, used }; { missing: true } on a server without it.
  const [st, setSt] = useState(null)
  const [fresh, setFresh] = useState(null)      // the address just made: the only time it is known
  const [busy, setBusy] = useState(false)

  const load = () => api('/api/connector').then(setSt, e => setSt(e.status === 404 ? { missing: true } : { error: true }))
  useEffect(() => {
    load()
    // Coming back from Claude: "used" is set by Claude's first request, so this is what tells the
    // athlete whether adding it worked.
    const onVisible = () => { if (document.visibilityState === 'visible') load().catch(() => {}) }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  // The one tap: make the address, put it on the clipboard, open Claude's connectors page.
  const connect = async () => {
    setBusy(true)
    try {
      const r = await api('/api/connector', { method: 'POST', body: '{}' })
      setFresh(r.url)
      setSt({ available: true, on: true, created: r.created, used: null })
      const copied = await copyText(r.url)
      if (copied) toast(t('Address copied: now finish in Claude.'))
      openClaude()
    } catch { toast(t('Could not make the address. Try again in a moment.')) }
    setBusy(false)
  }
  const copy = async () => { if (await copyText(fresh)) toast(t('Address copied')) }
  const again = () => confirmSheet({
    title: t('Make a new address?'),
    message: t('The address Claude has now stops working at once. You then paste the new one into Claude in place of the old.'),
    confirmText: t('Make a new address'),
    onConfirm: connect,
  })
  const remove = () => confirmSheet({
    title: t('Disconnect Claude?'),
    message: t('The address stops working at once and Claude can no longer read your training. You can connect again at any time.'),
    confirmText: t('Disconnect'), danger: true,
    onConfirm: async () => {
      try {
        await api('/api/connector/delete', { method: 'POST', body: '{}' })
        setFresh(null); setSt({ available: true, on: false, created: null, used: null })
        toast(t('Claude disconnected'))
      } catch { toast(t('Could not disconnect. Try again in a moment.')) }
    },
  })

  const unavailable = st && (st.missing || st.available === false)
  const ready = st && !unavailable && !st.error
  // An address Claude has never called is not a connection yet: the steps stay on screen until it is.
  const waiting = ready && st.on && !st.used
  const linked = ready && st.on && st.used
  return <>
    <Section footer={t('Read-only: Claude can read your training but cannot change, add or delete anything.')}>
      <Row icon="sparkles" iconTint="var(--orange)" title={t('Ask Claude about your training')}
        subtitle={t('Once connected, Claude reads your routines, workouts, records, body weight and muscle balance, with the same numbers the app shows.')} />
      {ready && !st.on && <div className="claude-actions">
        <Button variant="primary" icon="sparkles" disabled={busy} onClick={connect}>{busy ? t('Connecting…') : t('Connect Claude')}</Button>
      </div>}
    </Section>

    {!st && <Section><Row icon="hourglass" iconTint="var(--grey)" title={t('Checking…')} /></Section>}
    {st?.error && <Section><Row icon="warning" iconTint="var(--orange)" title={t('The server could not be reached.')} accessory="chevron" onClick={load} /></Section>}
    {unavailable && <Section><Row icon="info" iconTint="var(--grey)" title={t('This server does not offer the Claude connector.')} /></Section>}

    {waiting && <Section title={t('Finish in Claude')}
      footer={fresh
        ? t('Shown only now. Anyone with this address can read your training: keep it to yourself. Lost it? Make a new one.')
        : t('The address is shown only when it is made. If it is no longer on your clipboard, copy a new one: the old one stops working.')}>
      <Row icon="hourglass" iconTint="var(--orange)" title={t('Not added in Claude yet')}
        subtitle={t('This turns to connected as soon as Claude reaches Olympus for the first time.')} />
      <Row icon="globe" iconTint="var(--acc)" title={t('1. Open claude.ai in your browser')}
        subtitle={t('Customize, Connectors, then + Add and Add custom connector. On a phone use the browser, not the Claude app: connectors are added on the web.')} />
      <Row icon="copy" iconTint="var(--indigo)" title={t('2. Paste the address')}
        subtitle={t('Name: Olympus. URL: paste the address. Tap Continue. Under Authentication pick No sign in, even if Claude suggests a sign-in, then Add.')} />
      <Row icon="chat" iconTint="var(--green)" title={t('3. Ask')}
        subtitle={t('Turn Olympus on in a chat’s tools, then ask, for example: “How has my bench press gone this month?”')} />
      <div className="claude-actions">
        {fresh
          ? <Button variant="tinted" icon="copy" onClick={copy}>{t('Copy the address')}</Button>
          : <Button variant="tinted" icon="copy" disabled={busy} onClick={connect}>{t('Copy a new address')}</Button>}
        <Button variant="primary" icon="globe" onClick={openClaude}>{t('Open Claude')}</Button>
      </div>
    </Section>}

    {ready && st.on && <Section title={t('Connection')} footer={t('Add it once at claude.ai or in the Claude desktop app: it then works in the Claude phone app too.')}>
      {linked && <Row icon="checkCircle" iconTint="var(--green)" title={t('Last used by Claude')} value={day(st.used)} />}
      <Row icon="clock" iconTint="var(--blue)" title={t('Address made')} value={st.created ? day(st.created) : null} />
      {linked && <Row icon="reset" iconTint="var(--orange)" title={t('Make a new address')} subtitle={t('If the address got out, or you lost it.')} accessory="chevron" onClick={again} />}
      <Row icon="signOut" iconTint="var(--red)" title={t('Disconnect Claude')} danger onClick={remove} />
    </Section>}
  </>
}
