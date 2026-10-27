// Olympus: the owner's dashboard. Only the founder of the server reaches it (the route checks
// user.founder, the server checks it again on every request: api/insights.js, core.js ownerData).
//
// What it shows, from the server's documents:
//   Overview   people, how many came back today / this week / this month, sign-ups, invites;
//   Activity   per day: active people, sessions, minutes in the app, sign-ups;
//   Features   every feature with how often and by how many people it was used, the unused too;
//   Screens    where the time goes;
//   People     everyone, with their usage; a tap opens one person's days, screens and events;
//   Invites    who brought whom;
//   Feedback   the ratings' averages, the recommend score (NPS) and every message;
//   Export     the same data as CSV (one file per table) or one JSON file.
// Usage numbers only exist for people who agreed to share statistics (lib/telemetry.js).
// English only, like the Node server's admin pages: it is not part of the translated app.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUI } from '../store/useUI.js'
import { api } from '../lib/api.js'
import { MOBILE, shareExport } from '../lib/mobile.js'
import { FEATURES } from '../lib/telemetry.js'
import { Segmented, Button } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import '../owner.css'

const PERIODS = [{ value: 7, label: '7 d' }, { value: 30, label: '30 d' }, { value: 90, label: '90 d' }, { value: 365, label: '1 y' }]

const FEATURE_LABEL = {
  'workout.start': 'Started a workout (any)', 'workout.finish': 'Finished a workout', 'workout.discard': 'Discarded a workout',
  'routine.create': 'Created a routine', 'routine.start': 'Started from a routine', 'exercise.create': 'Created an exercise',
  'coach.ask': 'Asked an AI coach', 'coach.action': 'Applied a coach change', 'coach.voice': 'Used voice mode',
  'post.create': 'Posted to the feed', 'post.like': 'Liked a post', 'post.comment': 'Commented', follow: 'Followed someone',
  'measurement.add': 'Logged a measurement', 'photo.add': 'Added a progress photo', 'checkin.save': 'Saved a check-in',
  'invite.share': 'Shared an invite', 'feedback.send': 'Sent feedback', 'backup.export': 'Exported a backup',
}
const SCREEN_LABEL = {
  '/home': 'Feed', '/today': 'Today', '/profile': 'Profile', '/u/:id': 'Someone’s profile', '/notifications': 'Notifications', '/post/:id': 'A post',
  '/checkin': 'Check-in', '/plan': 'Plan', '/plan/r/:id': 'Routine editor', '/workout': 'Workout', '/stats': 'Stats', '/history': 'History',
  '/library': 'Exercise library', '/muscles': 'Muscles', '/structural-balance': 'Structural balance', '/progress-photos': 'Progress photos',
  '/measurements': 'Measurements', '/body': 'Body & wellbeing', '/settings': 'Settings', '/coach': 'Coach chat', '/ai': 'AI coach', '/owner': 'Owner dashboard',
}
const screenName = p => SCREEN_LABEL[p] || (p.startsWith('/settings/') ? 'Settings: ' + p.slice(10) : p)

const num = n => (n == null ? '–' : Number(n).toLocaleString())
const mins = sec => { if ((sec || 0) < 60) return Math.round(sec || 0) + ' s'; const m = Math.round(sec / 60); return m >= 120 ? (Math.round(m / 6) / 10).toLocaleString() + ' h' : m + ' min' }
const rel = ts => {
  if (!ts) return 'never'
  const s = Math.max(0, (Date.now() - ts) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return Math.floor(s / 60) + ' min ago'
  if (s < 86400) return Math.floor(s / 3600) + ' h ago'
  if (s < 30 * 86400) return Math.floor(s / 86400) + ' d ago'
  return new Date(ts).toLocaleDateString()
}
const day = iso => (iso ? new Date(String(iso).slice(0, 10) + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: '2-digit' }) : '–')
const shortDay = iso => (iso ? new Date(String(iso).slice(0, 10) + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '–')
const pct = (a, b) => (b ? Math.round(a / b * 100) : 0)

async function saveText(text, filename, type) {
  if (MOBILE) return shareExport(text, filename)
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type }))
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

/* ------------------------------ pieces ------------------------------- */

function Kpi({ label, value, sub, tone }) {
  return <div className={'ow-kpi' + (tone ? ' ' + tone : '')}><b>{value}</b><span>{label}</span>{sub && <i>{sub}</i>}</div>
}

// Bars per day, one series at a time; a tap on a bar shows its day and value.
function DayChart({ rows, field, unit = '' }) {
  const [sel, setSel] = useState(null)
  const max = Math.max(1, ...rows.map(r => r[field] || 0))
  const total = rows.reduce((a, r) => a + (r[field] || 0), 0)
  const shown = sel != null ? rows[sel] : null
  return <div className="ow-chart">
    <div className="ow-chart-cap">
      {shown ? <><b>{num(shown[field])}{unit}</b><span>{day(shown.day)}</span></>
        : field === 'active' ? <><b>{num(rows[rows.length - 1]?.active || 0)}</b><span>today · busiest day {num(max)}</span></>
          : <><b>{num(total)}{unit}</b><span>in this period</span></>}
    </div>
    <div className="ow-bars" style={{ '--n': rows.length }}>
      <span className="ow-max">{num(max)}</span>
      {rows.map((r, i) => <button key={r.day} className={'ow-bar' + (i === sel ? ' sel' : '') + (r[field] ? '' : ' zero')}
        onClick={() => setSel(i === sel ? null : i)} aria-label={`${day(r.day)}: ${r[field] || 0}${unit}`}>
        <i style={{ height: Math.max(r[field] ? 4 : 1, r[field] / max * 100) + '%' }} />
      </button>)}
    </div>
    <div className="ow-x"><span>{day(rows[0]?.day)}</span><span>{day(rows[rows.length - 1]?.day)}</span></div>
  </div>
}

function Meter({ value, max }) {
  return <span className="ow-meter" aria-hidden="true"><i style={{ width: pct(value, max) + '%' }} /></span>
}

function Card({ title, lead, children, right, wideRight }) {
  return <section className="ow-card">
    <div className={'ow-card-h' + (wideRight ? ' wide' : '')}><h3>{title}</h3>{right}</div>
    {lead && <p className="ow-lead">{lead}</p>}
    {children}
  </section>
}

// Features: the known list first, each with uses and how many of the sharing people used it.
// What nobody used is shown as such: what people do not do is the point of half of this card.
function featureRows(events, sharing) {
  const byName = new Map(events.map(e => [e.name, e]))
  const known = FEATURES.map(name => ({ name, label: FEATURE_LABEL[name] || name, n: byName.get(name)?.n || 0, users: byName.get(name)?.users || 0 }))
  const other = events.filter(e => !FEATURES.includes(e.name)).map(e => ({ ...e, label: e.name }))
  return [...known, ...other].sort((a, b) => b.users - a.users || b.n - a.n).map(r => ({ ...r, adoption: pct(r.users, sharing) }))
}

/* ------------------------------ one person --------------------------- */

function PersonSheet({ id, person, close }) {
  const [d, setD] = useState(null)
  const [err, setErr] = useState(null)
  useEffect(() => { api('/api/owner/person?id=' + encodeURIComponent(id)).then(setD, e => setErr(e.message)) }, [id])
  const used = new Set((d?.events || []).map(e => e.name))
  const notUsed = FEATURES.filter(f => !used.has(f))
  const rows = useMemo(() => {
    if (!d) return []
    const byDay = new Map(d.days.map(x => [x.day, x]))
    return Array.from({ length: 30 }, (_, i) => { const k = new Date(Date.now() - (29 - i) * 86400000).toISOString().slice(0, 10); return { day: k, minutes: byDay.get(k)?.minutes || 0, sessions: byDay.get(k)?.sessions || 0 } })
  }, [d])
  return <div className="ow-person">
    <h3>{person.name}</h3>
    <div className="ow-pmeta">
      <span>Joined {day(person.created)}</span>
      <span>Last seen {rel(person.lastSeen)}</span>
      {person.referredBy && <span>Invited by {person.referredBy}</span>}
      {person.invited > 0 && <span>Brought {person.invited}</span>}
      {person.platform && <span>{person.platform} {person.version}</span>}
      {person.email && <span>{person.email}</span>}
    </div>
    {!person.shares ? <p className="ow-lead">Does not share usage statistics: only the account details are known.</p>
      : err ? <p className="ow-lead">{err}</p>
        : !d ? <p className="ow-lead">Loading…</p>
          : <>
            <div className="ow-kpis three">
              <Kpi label="sessions" value={num(person.sessions)} />
              <Kpi label="in the app" value={mins(person.seconds)} />
              <Kpi label="active days" value={num(person.activeDays)} />
            </div>
            <h4>Minutes per day, last 30 days</h4>
            <DayChart rows={rows} field="minutes" unit=" min" />
            <h4>Screens</h4>
            <div className="ow-rows">{d.screens.map(s => <div key={s.path} className="ow-row"><span className="grow">{screenName(s.path)}</span><Meter value={s.seconds} max={d.screens[0].seconds} /><b>{mins(s.seconds)}</b></div>)}</div>
            <h4>Features used</h4>
            <div className="ow-rows">{d.events.length ? d.events.map(e => <div key={e.name} className="ow-row"><span className="grow">{FEATURE_LABEL[e.name] || e.name}</span><b>{num(e.n)}×</b></div>) : <p className="ow-lead">None yet.</p>}</div>
            {notUsed.length > 0 && <><h4>Never used</h4><div className="ow-tags">{notUsed.map(f => <span key={f}>{FEATURE_LABEL[f]}</span>)}</div></>}
            <h4>Latest activity</h4>
            <div className="ow-rows ow-log">{d.recent.slice(0, 60).map((e, i) => <div key={i} className="ow-row">
              <span className="ow-t">{new Date(e.t).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
              <span className="grow">{e.type === 'open' ? 'Opened the app' : e.type === 'screen' ? screenName(e.path) : FEATURE_LABEL[e.name] || e.name}</span>
              {e.type === 'screen' && <b>{e.sec < 90 ? e.sec + ' s' : mins(e.sec)}</b>}
            </div>)}</div>
          </>}
    <div style={{ height: 10 }} />
    <Button onClick={close}>Done</Button>
  </div>
}
const personSheet = p => useUI.getState().openSheet(close => <PersonSheet id={p.id} person={p} close={close} />)

/* ------------------------------ the page ----------------------------- */

const PEOPLE_SORT = [
  { value: 'lastSeen', label: 'Last seen' }, { value: 'seconds', label: 'Time' }, { value: 'created', label: 'Joined' }, { value: 'invited', label: 'Invites' },
]

export default function Owner() {
  const nav = useNavigate()
  const toast = useUI(s => s.toast)
  const [days, setDays] = useState(30)
  const [d, setD] = useState(null)
  const [err, setErr] = useState(null)
  const [field, setField] = useState('active')
  const [sort, setSort] = useState('lastSeen')
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const load = () => { setErr(null); return api('/api/owner/dashboard?days=' + days).then(setD, e => setErr(e.status === 403 ? 'Only the owner of this server can see this page.' : e.message)) }
  useEffect(() => { load() }, [days])

  const exportFile = async what => {
    setBusy(true)
    try {
      if (what === 'json') {
        const all = await api('/api/owner/export?format=json')
        await saveText(JSON.stringify(all, null, 2), `olympus-export-${new Date().toISOString().slice(0, 10)}.json`, 'application/json')
      } else {
        const r = await api('/api/owner/export?wrap=1&what=' + what)
        await saveText(r.csv, r.filename, 'text/csv')
      }
    } catch (e) { toast(e.message || 'Export failed') } finally { setBusy(false) }
  }

  const people = useMemo(() => {
    const list = (d?.people || []).filter(p => !q || p.name.toLowerCase().includes(q.toLowerCase()) || (p.email || '').toLowerCase().includes(q.toLowerCase()))
    const key = p => (sort === 'created' ? String(p.created || '') : sort === 'lastSeen' ? p.lastSeen || 0 : p[sort] || 0)
    return list.slice().sort((a, b) => (key(b) > key(a) ? 1 : key(b) < key(a) ? -1 : 0))
  }, [d, sort, q])

  if (err) return <div className="narrow ow"><Header nav={nav} /><div className="ow-card"><p>{err}</p><Button icon="reset" onClick={load}>Try again</Button></div></div>
  if (!d) return <div className="narrow ow"><Header nav={nav} /><div className="ow-card ow-lead">Loading…</div></div>

  const T = d.totals
  const features = featureRows(d.events, T.sharing)
  const unused = features.filter(f => !f.users && FEATURES.includes(f.name))
  const fb = d.feedback
  const series = d.series
  return <div className="narrow ow">
    <Header nav={nav} onRefresh={() => load().then(() => toast('Updated'))} />
    <div className="ow-period"><Segmented value={days} onChange={setDays} options={PERIODS} /></div>

    <div className="ow-kpis">
      <Kpi label="people" value={num(T.users)} sub={`${num(T.signups30)} new in 30 d`} />
      <Kpi label="active today" value={num(T.active1)} tone="acc" />
      <Kpi label="active this week" value={num(T.active7)} />
      <Kpi label="active this month" value={num(T.active30)} />
      <Kpi label="joined by invite" value={num(T.referred)} sub={T.users ? pct(T.referred, T.users) + '% of people' : null} />
      <Kpi label="average session" value={T.avgSessionMin == null ? '–' : T.avgSessionMin + ' min'} />
    </div>
    <p className="ow-note"><Icon name="info" /> {T.sharing} of {T.users} {T.users === 1 ? 'person shares' : 'people share'} usage statistics. Activity, features and screens count only them; people, invites and feedback count everyone.</p>

    <Card title="Activity" wideRight right={<Segmented value={field} onChange={setField} options={[{ value: 'active', label: 'People' }, { value: 'sessions', label: 'Sessions' }, { value: 'minutes', label: 'Minutes' }, { value: 'signups', label: 'Sign-ups' }]} />}>
      <DayChart rows={series} field={field} unit={field === 'minutes' ? ' min' : ''} />
    </Card>

    <Card title="Features" lead={`How many of the ${T.sharing} sharing ${T.sharing === 1 ? 'person' : 'people'} used each feature in the period, and how often.${unused.length ? ` ${unused.length} were not used at all.` : ''}`}>
      <div className="ow-rows">{features.map(f => <div key={f.name} className={'ow-row' + (f.users ? '' : ' none')}>
        <span className="grow">{f.label}</span>
        <Meter value={f.users} max={T.sharing} />
        <b className="ow-w">{f.users ? f.adoption + '%' : 'unused'}</b>
        <span className="ow-n">{f.n ? num(f.n) + '×' : ''}</span>
      </div>)}</div>
    </Card>

    <Card title="Screens" lead="Where the time in the app goes, and how many people opened each screen.">
      {d.screens.length ? <div className="ow-rows">{d.screens.map(s => <div key={s.path} className="ow-row">
        <span className="grow">{screenName(s.path)}</span>
        <Meter value={s.seconds} max={d.screens[0].seconds} />
        <b className="ow-w">{mins(s.seconds)}</b>
        <span className="ow-n">{s.users} {s.users === 1 ? 'person' : 'people'}</span>
      </div>)}</div> : <p className="ow-lead">No usage statistics yet.</p>}
    </Card>

    <Card title={`People (${d.people.length})`} lead="Tap someone to see their days, screens, features and latest activity.">
      <div className="ow-tools">
        <input className="input" placeholder="Search name or e-mail" value={q} onChange={e => setQ(e.target.value)} />
        <Segmented value={sort} onChange={setSort} options={PEOPLE_SORT} />
      </div>
      <div className="ow-table" role="table">
        <div className="ow-tr ow-th" role="row"><span>Name</span><span>Last seen</span><span>Time</span><span>Joined</span></div>
        {people.map(p => <button key={p.id} className="ow-tr" role="row" onClick={() => personSheet(p)}>
          <span className="ow-name">{p.name}{p.referredBy && <i>via {p.referredBy}</i>}{!p.shares && <i className="off">no statistics</i>}</span>
          <span>{p.shares ? rel(p.lastSeen) : '–'}</span>
          <span>{p.shares ? mins(p.seconds) : '–'}</span>
          <span>{shortDay(p.created)}</span>
        </button>)}
      </div>
    </Card>

    <Card title="Invites" lead="Who brought whom: people who created their account with someone’s invite code.">
      {d.referrals.length ? <div className="ow-refs">{d.referrals.map((r, i) => <div key={r.id} className="ow-ref">
        <div className="ow-ref-h"><span className="ow-rank">{i + 1}</span><b className="grow">{r.name}</b><span className="ow-code">{r.code}</span><b className="ow-big">{r.invited.length}</b></div>
        <div className="ow-tags">{r.invited.map(x => <span key={x.id}>{x.name} · {day(x.created)}</span>)}</div>
      </div>)}</div> : <p className="ow-lead">Nobody has joined with an invite code yet.</p>}
    </Card>

    <Card title={`Feedback (${fb.count})`} lead="Averages of every rating sent, and the messages, newest first. Each one is also e-mailed to you when mail is set up on the server.">
      <div className="ow-kpis">
        <Kpi label="clear and easy (1 to 5)" value={fb.ratings.clarity ?? '–'} />
        <Kpi label="likes it (1 to 5)" value={fb.ratings.enjoy ?? '–'} />
        <Kpi label="useful for training (1 to 5)" value={fb.ratings.useful ?? '–'} />
        <Kpi label="would recommend (0 to 10)" value={fb.ratings.recommend ?? '–'} sub={fb.nps == null ? null : `NPS ${fb.nps > 0 ? '+' : ''}${fb.nps}`} tone={fb.nps == null ? '' : fb.nps >= 30 ? 'good' : fb.nps < 0 ? 'bad' : ''} />
      </div>
      <p className="ow-note"><Icon name="info" /> NPS is the share who answered 9 or 10 minus the share who answered 0 to 6, from −100 to +100.</p>
      <div className="ow-fb">{fb.items.map(i => <div key={i.id} className="ow-fbi">
        <div className="ow-fbh"><b>{i.name}</b><span>{rel(i.at)}</span>{i.platform && <span>{i.platform} {i.version}</span>}</div>
        {Object.keys(i.ratings || {}).length > 0 && <div className="ow-tags">{Object.entries(i.ratings).map(([k, v]) => <span key={k}>{({ clarity: 'Clear', enjoy: 'Likes', useful: 'Useful', recommend: 'Recommend' })[k] || k} {v}/{k === 'recommend' ? 10 : 5}</span>)}</div>}
        {i.text && <p>{i.text}</p>}
      </div>)}</div>
    </Card>

    <Card title="Export" lead="The data behind this page, to open in a spreadsheet or keep. CSV is one table per file; JSON is everything in one file, the full usage history included.">
      <div className="ow-exp">
        <Button size="sm" icon="download" disabled={busy} onClick={() => exportFile('people')}>People (CSV)</Button>
        <Button size="sm" icon="download" disabled={busy} onClick={() => exportFile('daily')}>Daily totals (CSV)</Button>
        <Button size="sm" icon="download" disabled={busy} onClick={() => exportFile('events')}>Events (CSV)</Button>
        <Button size="sm" icon="download" disabled={busy} onClick={() => exportFile('feedback')}>Feedback (CSV)</Button>
        <Button size="sm" variant="tinted" icon="download" disabled={busy} onClick={() => exportFile('json')}>Everything (JSON)</Button>
      </div>
    </Card>
    <div style={{ height: 30 }} />
  </div>
}

function Header({ nav, onRefresh }) {
  return <div className="hdr">
    <div className="row" style={{ gap: 6 }}>
      <button className="iconbtn" onClick={() => nav(-1)} aria-label="Back"><Icon name="chevronLeft" /></button>
      <h1>Owner dashboard</h1>
    </div>
    {onRefresh && <div className="hdr-actions"><button className="iconbtn" onClick={onRefresh} aria-label="Refresh"><Icon name="reset" /></button></div>}
  </div>
}
