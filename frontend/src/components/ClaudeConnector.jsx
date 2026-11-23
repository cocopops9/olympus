// Settings → Connect to Claude and Connect to ChatGPT: one tap makes this profile's connector
// address for that assistant, copies it and opens the assistant's page for adding one; what is
// left is pasting it there. The server makes the address and keeps its hash plus a copy sealed
// with its own key (supabase/functions/olympus/connector-token.js), so this page can copy the same
// address again; it also says when it was made and last used, and makes a new one or removes it.
// Claude and ChatGPT each get their own address (core.js /api/connector, ?for=chatgpt), so either
// can be replaced or removed without touching the other. The page is one; the words are each
// assistant's (CLIENTS), written out in full so each reads naturally once translated.
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
// ChatGPT's page for its plugins, where "+" then "Add custom MCP server" adds one (OpenAI,
// developers.openai.com "Add custom MCP server", read 2026-11-23): on the web, with "No
// authentication", streaming HTTP. ChatGPT asks before each write action unless told to remember,
// and treats a tool without readOnlyHint as a write: mcp/src/remote.js marks every tool.
export const CHATGPT_PLUGINS = 'https://chatgpt.com/plugins'

// Every string through t() at render time, so the language in use is the one shown.
const CLIENTS = {
  claude: {
    query: '',
    link: CLAUDE_CONNECTORS,
    words: () => ({
      about: t('Claude reads your training and, when you ask, logs workouts and weigh-ins, builds and edits routines and plans your week. It asks you before deleting anything.'),
      title: t('Ask Claude about your training'),
      subtitle: t('Once connected, Claude reads your routines, workouts, records, body weight and muscle balance, with the same numbers the app shows.'),
      connect: t('Connect Claude'),
      copiedFinish: t('Address copied: now finish in Claude.'),
      replaceMessage: t('The address Claude has now stops working at once. You then paste the new one into Claude in place of the old.'),
      disconnectTitle: t('Disconnect Claude?'),
      disconnectMessage: t('The address stops working at once and Claude can no longer read or change your training. You can connect again at any time.'),
      disconnected: t('Claude disconnected'),
      unavailable: t('This server does not offer the Claude connector.'),
      finish: t('Finish in Claude'),
      keepSecret: t('Anyone with this address can read and change your training: keep it to yourself. Add it in Claude only once: copying it again gives the same address.'),
      notYet: t('Not added in Claude yet'),
      turnsConnected: t('This turns to connected as soon as Claude reaches Olympus for the first time.'),
      steps: [
        [t('1. Open claude.ai in your browser'), t('Customize, Connectors, then + Add and Add custom connector. On a phone use the browser, not the Claude app: connectors are added on the web.')],
        [t('2. Paste the address'), t('Name: Olympus. URL: paste the address. Tap Continue. Under Authentication leave No sign-in selected (marked Detected): do not pick Sign in now or Sign in when needed. Then Add.')],
        [t('3. Ask'), t('Turn Olympus on in a chat’s tools, then ask, for example: “How has my bench press gone this month?”')],
      ],
      open: t('Open Claude'),
      addOnce: t('Add it once at claude.ai or in the Claude desktop app: it then works in the Claude phone app too.'),
      lastUsed: t('Last used by Claude'),
      disconnect: t('Disconnect Claude'),
    }),
  },
  chatgpt: {
    query: '?for=chatgpt',
    link: CHATGPT_PLUGINS,
    words: () => ({
      about: t('ChatGPT reads your training and, when you ask, logs workouts and weigh-ins, builds and edits routines and plans your week. It asks you before changing anything, and before deleting it asks again.'),
      title: t('Ask ChatGPT about your training'),
      subtitle: t('Once connected, ChatGPT reads your routines, workouts, records, body weight and muscle balance, with the same numbers the app shows.'),
      connect: t('Connect ChatGPT'),
      copiedFinish: t('Address copied: now finish in ChatGPT.'),
      replaceMessage: t('The address ChatGPT has now stops working at once. You then paste the new one into ChatGPT in place of the old.'),
      disconnectTitle: t('Disconnect ChatGPT?'),
      disconnectMessage: t('The address stops working at once and ChatGPT can no longer read or change your training. You can connect again at any time.'),
      disconnected: t('ChatGPT disconnected'),
      unavailable: t('This server does not offer the ChatGPT connector.'),
      finish: t('Finish in ChatGPT'),
      keepSecret: t('Anyone with this address can read and change your training: keep it to yourself. Add it in ChatGPT only once: copying it again gives the same address.'),
      notYet: t('Not added in ChatGPT yet'),
      turnsConnected: t('This turns to connected as soon as ChatGPT reaches Olympus for the first time.'),
      steps: [
        [t('1. Open chatgpt.com in your browser'), t('Plugins, then + and Add custom MCP server. On a phone use the browser, not the ChatGPT app: custom servers are added on the web. It needs a paid ChatGPT plan.')],
        [t('2. Paste the address'), t('Name: Olympus. Server URL: paste the address. Authentication: No authentication. Tap I understand and want to continue, then Create as a plugin, and install it.')],
        [t('3. Ask'), t('In a chat type @, pick Olympus, then ask, for example: “How has my bench press gone this month?” ChatGPT asks you before each change: tap Confirm.')],
      ],
      open: t('Open ChatGPT'),
      addOnce: t('Add it once at chatgpt.com: it then shows among your plugins in ChatGPT.'),
      lastUsed: t('Last used by ChatGPT'),
      disconnect: t('Disconnect ChatGPT'),
    }),
  },
}

const day = ms => new Date(ms).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'long', year: 'numeric' })

export const ClaudeConnectorPage = () => <ConnectorPage client="claude" />
export const ChatGPTConnectorPage = () => <ConnectorPage client="chatgpt" />

export function ConnectorPage({ client = 'claude' }) {
  const c = CLIENTS[client] || CLIENTS.claude
  const w = c.words()
  const path = '/api/connector' + c.query
  const openSite = () => { try { window.open(c.link, '_blank', 'noopener') } catch { /* the button below opens it */ } }
  const toast = useUI(s => s.toast)
  // null while asking; { available, on, created, used }; { missing: true } on a server without it.
  const [st, setSt] = useState(null)
  const [fresh, setFresh] = useState(null)      // the address just made (older servers show it only then)
  const [busy, setBusy] = useState(false)

  const load = () => api(path).then(setSt, e => setSt(e.status === 404 ? { missing: true } : { error: true }))
  useEffect(() => {
    load()
    // Coming back from the assistant: "used" is set by Claude's first request, so this is what tells the
    // athlete whether adding it worked.
    const onVisible = () => { if (document.visibilityState === 'visible') load().catch(() => {}) }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  // The one tap: make the address, put it on the clipboard, open Claude's connectors page.
  const connect = async () => {
    setBusy(true)
    try {
      const r = await api(path, { method: 'POST', body: '{}' })
      setFresh(r.url)
      setSt({ available: true, on: true, created: r.created, used: null, url: r.url })
      const copied = await copyText(r.url)
      if (copied) toast(w.copiedFinish)
      openSite()
    } catch { toast(t('Could not make the address. Try again in a moment.')) }
    setBusy(false)
  }
  // The server hands the same address out again (sealed token), so copying never replaces the
  // one already added in Claude. Only an address made before that has to be made anew.
  const copy = async () => { if (await copyText(fresh || st?.url)) toast(t('Address copied')) }
  const again = () => confirmSheet({
    title: t('Make a new address?'),
    message: w.replaceMessage,
    confirmText: t('Make a new address'),
    onConfirm: connect,
  })
  const remove = () => confirmSheet({
    title: w.disconnectTitle,
    message: w.disconnectMessage,
    confirmText: t('Disconnect'), danger: true,
    onConfirm: async () => {
      try {
        await api('/api/connector/delete' + c.query, { method: 'POST', body: '{}' })
        setFresh(null); setSt({ available: true, on: false, created: null, used: null })
        toast(w.disconnected)
      } catch { toast(t('Could not disconnect. Try again in a moment.')) }
    },
  })

  const unavailable = st && (st.missing || st.available === false)
  const ready = st && !unavailable && !st.error
  // An address Claude has never called is not a connection yet: the steps stay on screen until it is.
  const waiting = ready && st.on && !st.used
  const linked = ready && st.on && st.used
  const known = !!(fresh || st?.url)
  return <>
    <Section footer={w.about}>
      <Row icon="sparkles" iconTint="var(--orange)" title={w.title}
        subtitle={w.subtitle} />
      {ready && !st.on && <div className="claude-actions">
        <Button variant="primary" icon="sparkles" disabled={busy} onClick={connect}>{busy ? t('Connecting…') : w.connect}</Button>
      </div>}
    </Section>

    {!st && <Section><Row icon="hourglass" iconTint="var(--grey)" title={t('Checking…')} /></Section>}
    {st?.error && <Section><Row icon="warning" iconTint="var(--orange)" title={t('The server could not be reached.')} accessory="chevron" onClick={load} /></Section>}
    {unavailable && <Section><Row icon="info" iconTint="var(--grey)" title={w.unavailable} /></Section>}

    {waiting && <Section title={w.finish}
      footer={known
        ? w.keepSecret
        : t('The address is shown only when it is made. If it is no longer on your clipboard, copy a new one: the old one stops working.')}>
      <Row icon="hourglass" iconTint="var(--orange)" title={w.notYet}
        subtitle={w.turnsConnected} />
      <Row icon="globe" iconTint="var(--acc)" title={w.steps[0][0]} subtitle={w.steps[0][1]} />
      <Row icon="copy" iconTint="var(--indigo)" title={w.steps[1][0]} subtitle={w.steps[1][1]} />
      <Row icon="chat" iconTint="var(--green)" title={w.steps[2][0]} subtitle={w.steps[2][1]} />
      <div className="claude-actions">
        {known
          ? <Button variant="tinted" icon="copy" onClick={copy}>{t('Copy the address')}</Button>
          : <Button variant="tinted" icon="copy" disabled={busy} onClick={connect}>{t('Copy a new address')}</Button>}
        <Button variant="primary" icon="globe" onClick={openSite}>{w.open}</Button>
      </div>
    </Section>}

    {ready && st.on && <Section title={t('Connection')} footer={w.addOnce}>
      {linked && <Row icon="checkCircle" iconTint="var(--green)" title={w.lastUsed} value={day(st.used)} />}
      {linked && known && <Row icon="copy" iconTint="var(--indigo)" title={t('Copy the address')} accessory="chevron" onClick={copy} />}
      <Row icon="clock" iconTint="var(--blue)" title={t('Address made')} value={st.created ? day(st.created) : null} />
      {linked && <Row icon="reset" iconTint="var(--orange)" title={t('Make a new address')} subtitle={t('If the address got out, or you lost it.')} accessory="chevron" onClick={again} />}
      <Row icon="signOut" iconTint="var(--red)" title={w.disconnect} danger onClick={remove} />
    </Section>}
  </>
}
