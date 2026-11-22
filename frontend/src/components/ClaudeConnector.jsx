// Settings → Connect to Claude: the address Claude (or any MCP client) uses to read this profile's
// training, and how to add it there. The server makes the address and keeps only its hash
// (supabase/functions/olympus/connector-token.js), so it is shown once, right after it is made;
// after that this page says when it was made and last used, and replaces or removes it.
import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { copyText } from '../lib/clipboard.js'
import { t, dateLocale } from '../lib/i18n.js'
import { useUI } from '../store/useUI.js'
import { confirmSheet } from '../sheets.jsx'
import { Section, Row, Button } from './ui.jsx'

const day = ms => new Date(ms).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'long', year: 'numeric' })

export function ClaudeConnectorPage() {
  const toast = useUI(s => s.toast)
  // null while asking; { available, on, created, used }; { missing: true } on a server without it.
  const [st, setSt] = useState(null)
  const [fresh, setFresh] = useState(null)      // the address just made: the only time it is known
  const [busy, setBusy] = useState(false)

  const load = () => api('/api/connector').then(setSt, e => setSt(e.status === 404 ? { missing: true } : { error: true }))
  useEffect(() => { load() }, [])

  const make = async () => {
    setBusy(true)
    try {
      const r = await api('/api/connector', { method: 'POST', body: '{}' })
      setFresh(r.url)
      setSt({ available: true, on: true, created: r.created, used: null })
    } catch { toast(t('Could not make the address. Try again in a moment.')) }
    setBusy(false)
  }
  const copy = async () => { if (await copyText(fresh)) toast(t('Address copied')) }
  const replace = () => confirmSheet({
    title: t('Make a new address?'),
    message: t('The address Claude has now stops working at once. You then paste the new one into Claude in place of the old.'),
    confirmText: t('Make a new address'),
    onConfirm: make,
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
  return <>
    <Section footer={t('Read-only: Claude can read your training but cannot change, add or delete anything.')}>
      <Row icon="sparkles" iconTint="var(--orange)" title={t('Ask Claude about your training')}
        subtitle={t('Once connected, Claude reads your routines, workouts, records, body weight and muscle balance, with the same numbers the app shows.')} />
    </Section>

    {!st && <Section><Row icon="hourglass" iconTint="var(--grey)" title={t('Checking…')} /></Section>}
    {st?.error && <Section><Row icon="warning" iconTint="var(--orange)" title={t('The server could not be reached.')} accessory="chevron" onClick={load} /></Section>}
    {unavailable && <Section><Row icon="info" iconTint="var(--grey)" title={t('This server does not offer the Claude connector.')} /></Section>}

    {st && !unavailable && !st.error && <>
      {fresh ? <Section title={t('Your connector address')} footer={t('Shown only now. Anyone with this address can read your training: keep it to yourself. Lost it? Make a new one.')}>
        <div className="lrow claude-url"><span className="acct-id">{fresh}</span></div>
        <div className="claude-actions"><Button variant="primary" icon="copy" onClick={copy}>{t('Copy the address')}</Button></div>
      </Section> : !st.on ? <Section>
        <div className="claude-actions"><Button variant="primary" icon="link" disabled={busy} onClick={make}>{busy ? t('Making the address…') : t('Make my connector address')}</Button></div>
      </Section> : null}

      {st.on && <Section title={t('Connection')}>
        <Row icon="checkCircle" iconTint="var(--green)" title={t('Address made')} value={st.created ? day(st.created) : null} />
        <Row icon="clock" iconTint="var(--blue)" title={t('Last used by Claude')} value={st.used ? day(st.used) : t('Not yet')} />
        <Row icon="reset" iconTint="var(--orange)" title={t('Make a new address')} subtitle={t('If the address got out, or you lost it.')} accessory="chevron" onClick={replace} />
        <Row icon="signOut" iconTint="var(--red)" title={t('Disconnect Claude')} danger onClick={remove} />
      </Section>}
    </>}

    <Section title={t('How to connect')} footer={t('Add it once at claude.ai or in the Claude desktop app: it then works in the Claude phone app too.')}>
      <Row icon="link" iconTint="var(--acc)" title={t('1. Make your address')} subtitle={t('Above, then copy it.')} />
      <Row icon="gear" iconTint="var(--blue)" title={t('2. Open Claude’s connectors')} subtitle={t('In Claude: Settings, then Connectors, then “Add custom connector”.')} />
      <Row icon="copy" iconTint="var(--indigo)" title={t('3. Paste it')} subtitle={t('Name it Olympus, paste the address and add it. No sign-in is asked for: the address is the key.')} />
      <Row icon="chat" iconTint="var(--green)" title={t('4. Ask')} subtitle={t('Turn Olympus on in a chat’s tools, then ask, for example: “How has my bench press gone this month?”')} />
    </Section>
    <Section footer={t('Claude Code and other MCP clients take the same address as a remote (HTTP) MCP server.')}>
      <Row icon="doc" iconTint="var(--grey)" title={t('Claude Code')} subtitle={<span className="acct-id">claude mcp add --transport http olympus &lt;address&gt;</span>} />
    </Section>
  </>
}
