// Olympus: the owner's dashboard. Only the founder of the server reaches it (the route checks
// user.founder, the server checks it again on every request: api/insights.js, core.js ownerData).
//
// Five tabs, each one question:
//   Overview    how is the app doing: people, who came back, activity per day, who is new and who
//               went quiet, which features and screens are used;
//   People      who is here: everyone, searched, filtered and sorted; a tap opens one person, in
//               four parts (Usage, Training, Community, Account); and who invited whom;
//   Community   what is being posted: the community in numbers and everyone's latest posts, which
//               the owner can remove;
//   Feedback    what people say: the ratings' averages, the recommend score (NPS), every message;
//   Export      the same data as CSV (one file per table) or one JSON file.
//
// What the owner does not see, on purpose: the page keeps what the app tells people.
//   - Usage numbers exist only for people who agreed to share statistics (lib/telemetry.js), and
//     they were told those never include their workouts, measurements, messages or notes. So
//     Training says how often someone trains (the "finished a workout" feature, per day), never
//     what a workout contains.
//   - A private profile was told only the followers it accepted see its posts: they are counted,
//     not shown.
//   - Messages between people are never shown: a count of conversations, nothing of what they say.
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

/* ------------------------------ posts -------------------------------- */

// One post as the owner sees it: who, when, what, and the way to remove it. Removing asks once
// more in place, as it cannot be undone (POST /api/social/posts/delete, open to an administrator).
function PostCard({ post, name, onPerson, onOpen, onRemoved }) {
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const remove = async () => {
    setBusy(true)
    try {
      await api('/api/social/posts/delete', { method: 'POST', body: JSON.stringify({ id: post.id }) })
      useUI.getState().toast('Post removed')
      onRemoved?.(post.id)
    } catch (e) { useUI.getState().toast(e?.message || 'Could not connect'); setBusy(false); setAsking(false) }
  }
  const tags = [
    post.photos > 0 && `${post.photos} photo${post.photos === 1 ? '' : 's'}`, post.video && 'video', post.song && '♪ ' + post.song,
    post.workout && (post.workout === true ? 'workout' : 'workout: ' + post.workout),
  ].filter(Boolean)
  return <div className="ow-post">
    <div className="ow-fbh">
      {name && (onPerson ? <button className="ow-link" onClick={onPerson}><b>{name}</b></button> : <b>{name}</b>)}
      <span>{rel(post.ts)}</span>
      <span>{post.likes} like{post.likes === 1 ? '' : 's'} · {post.comments} comment{post.comments === 1 ? '' : 's'}</span>
    </div>
    {post.text ? <p>{post.text}</p> : <p className="ow-dim">No text.</p>}
    {tags.length > 0 && <div className="ow-tags">{tags.map(x => <span key={x}>{x}</span>)}</div>}
    {asking ? <div className="ow-post-a">
      <span className="grow">Remove this post for everyone? It cannot be brought back.</span>
      <button className="ow-mini" disabled={busy} onClick={() => setAsking(false)}>Keep</button>
      <button className="ow-mini danger" disabled={busy} onClick={remove}>Remove</button>
    </div> : <div className="ow-post-a">
      <span className="grow" />
      {onOpen && <button className="ow-mini" onClick={onOpen}>Open</button>}
      <button className="ow-mini danger" onClick={() => setAsking(true)}>Remove</button>
    </div>}
  </div>
}

/* ------------------------------ one person --------------------------- */

const PERSON_TABS = [{ value: 'usage', label: 'Usage' }, { value: 'training', label: 'Training' }, { value: 'community', label: 'Community' }, { value: 'account', label: 'Account' }]
const COACH_NAME = { hercules: 'Hercules', athena: 'Athena', chiron: 'Chiron', calliope: 'Calliope' }
const PRIVATE_NOTE = 'This person does not share usage statistics, so this part stays private.'

// Sessions per week over the last eight weeks: whether someone trains regularly.
function WeekBars({ weeks }) {
  const max = Math.max(1, ...weeks)
  return <div className="ow-chart">
    <div className="ow-bars ow-weeks" style={{ '--n': weeks.length }}>
      {weeks.map((n, i) => <span key={i} className={'ow-bar' + (n ? '' : ' zero')} title={n + ' sessions'}>
        <i style={{ height: Math.max(n ? 6 : 1, n / max * 100) + '%' }} />{n > 0 && <em>{n}</em>}
      </span>)}
    </div>
    <div className="ow-x"><span>8 weeks ago</span><span>this week</span></div>
  </div>
}

function PersonUsage({ d, person }) {
  const used = new Set((d.events || []).map(e => e.name))
  const notUsed = FEATURES.filter(f => !used.has(f))
  const rows = useMemo(() => {
    const byDay = new Map(d.days.map(x => [x.day, x]))
    return Array.from({ length: 30 }, (_, i) => { const k = new Date(Date.now() - (29 - i) * 86400000).toISOString().slice(0, 10); return { day: k, minutes: byDay.get(k)?.minutes || 0, sessions: byDay.get(k)?.sessions || 0 } })
  }, [d])
  if (!person.shares) return <p className="ow-lead">{PRIVATE_NOTE}</p>
  return <>
    <div className="ow-kpis three">
      <Kpi label="sessions" value={num(person.sessions)} />
      <Kpi label="in the app" value={mins(person.seconds)} />
      <Kpi label="active days" value={num(person.activeDays)} />
    </div>
    <h4>Minutes per day, last 30 days</h4>
    <DayChart rows={rows} field="minutes" unit=" min" />
    <h4>Screens</h4>
    <div className="ow-rows">{d.screens.length ? d.screens.map(s => <div key={s.path} className="ow-row"><span className="grow">{screenName(s.path)}</span><Meter value={s.seconds} max={d.screens[0].seconds} /><b>{mins(s.seconds)}</b></div>) : <p className="ow-lead">None yet.</p>}</div>
    <h4>Features used</h4>
    <div className="ow-rows">{d.events.length ? d.events.map(e => <div key={e.name} className="ow-row"><span className="grow">{FEATURE_LABEL[e.name] || e.name}</span><b>{num(e.n)}×</b></div>) : <p className="ow-lead">None yet.</p>}</div>
    {notUsed.length > 0 && <><h4>Never used</h4><div className="ow-tags">{notUsed.map(f => <span key={f}>{FEATURE_LABEL[f]}</span>)}</div></>}
    <h4>Latest activity</h4>
    <div className="ow-rows ow-log">{d.recent.slice(0, 60).map((e, i) => <div key={i} className="ow-row">
      <span className="ow-t">{new Date(e.t).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
      <span className="grow">{e.type === 'open' ? 'Opened the app' : e.type === 'screen' ? screenName(e.path) : FEATURE_LABEL[e.name] || e.name}</span>
      {e.type === 'screen' && <b>{e.sec < 90 ? e.sec + ' s' : mins(e.sec)}</b>}
    </div>)}</div>
  </>
}

function PersonTraining({ d, person }) {
  const tr = d.training
  if (!person.shares) return <p className="ow-lead">{PRIVATE_NOTE}</p>
  if (!tr) return <p className="ow-lead">{OLD_SERVER}</p>
  const made = [
    tr.routines > 0 && `${tr.routines} routine${tr.routines === 1 ? '' : 's'} created`, tr.exercises > 0 && `${tr.exercises} exercise${tr.exercises === 1 ? '' : 's'} created`,
    tr.fromRoutine > 0 && `${tr.fromRoutine} started from a routine`, tr.discarded > 0 && `${tr.discarded} discarded`,
  ].filter(Boolean)
  return <>
    <div className="ow-kpis three">
      <Kpi label="workouts finished" value={num(tr.finished)} sub={`${num(tr.started)} started`} />
      <Kpi label="last workout" value={tr.last ? shortDay(tr.last) : '–'} />
      <Kpi label="first recorded" value={tr.first ? shortDay(tr.first) : '–'} />
    </div>
    {made.length > 0 && <div className="ow-tags">{made.map(x => <span key={x}>{x}</span>)}</div>}
    <h4>Workouts finished per week</h4>
    <WeekBars weeks={tr.weeks} />
    <h4>Days trained</h4>
    {tr.days.length ? <div className="ow-rows">{tr.days.map(x => <div key={x.day} className="ow-row">
      <span className="grow">{day(x.day)}</span>
      <b>{x.finished} workout{x.finished === 1 ? '' : 's'}</b>
    </div>)}</div> : <p className="ow-lead">No workout finished since they started sharing statistics.</p>}
    <p className="ow-note"><Icon name="info" /> How often, from the usage statistics. What a workout contains (exercises, weights, notes, body weight, photos) is never shown: people are told so when they agree to share.</p>
  </>
}

function PersonCommunity({ d, onProfile }) {
  const so = d.social
  const [gone, setGone] = useState([])
  if (!so) return <p className="ow-lead">{OLD_SERVER}</p>
  const posts = so.latest.filter(p => !gone.includes(p.id))
  const asked = Object.entries(d.coachesToday || {}).filter(([, n]) => n > 0)
  return <>
    <div className="ow-kpis three">
      <Kpi label="posts" value={num(Math.max(0, so.posts - gone.length))} />
      <Kpi label="followers" value={num(so.followers)} />
      <Kpi label="following" value={num(so.following)} />
      <Kpi label="comments written" value={num(so.commentsWritten)} />
      <Kpi label="likes given" value={num(so.likesGiven)} />
      <Kpi label="conversations" value={num(d.conversations)} />
    </div>
    <div className="ow-tags">
      <span>{so.private ? 'Private profile' : 'Public profile'}</span>
      {so.blocked > 0 && <span>Blocked {so.blocked}</span>}
      {asked.length ? asked.map(([id, n]) => <span key={id}>{COACH_NAME[id] || id}: {n} today</span>) : <span>No questions to the coaches today</span>}
    </div>
    {so.bio && <p className="ow-bio">{so.bio}</p>}
    <p className="ow-note"><Icon name="info" /> Messages are private: you see how many conversations someone has, never what they say.</p>
    <h4>Latest posts</h4>
    {so.private ? <p className="ow-lead">A private profile: only the followers it accepted see its posts, so they are not shown here.</p>
      : posts.length ? <div className="ow-fb">{posts.map(p => <PostCard key={p.id} post={p} onRemoved={id => setGone(g => [...g, id])} />)}</div> : <p className="ow-lead">No posts.</p>}
    <div style={{ height: 10 }} />
    <Button icon="person" onClick={onProfile}>Open their profile</Button>
  </>
}

function PersonAccount({ person }) {
  const rows = [
    ['Joined', day(person.created)], ['E-mail', person.email || 'not given'], ['Last seen', person.shares ? rel(person.lastSeen) : 'not shared'],
    ['Device', person.platform ? `${person.platform} ${person.version || ''}` : 'not shared'], ['Invited by', person.referredBy || 'nobody'],
    ['People they brought', num(person.invited)], ['Usage statistics', person.shares ? 'shared' : 'not shared'],
  ]
  return <>
    <div className="ow-rows">{rows.map(([k, v]) => <div key={k} className="ow-row"><span className="grow">{k}</span><b className="ow-val">{v}</b></div>)}</div>
    <div style={{ height: 14 }} />
    {person.founder ? <p className="ow-lead">This is you, the owner of the server.</p> : <BanButton person={person} />}
  </>
}

const OLD_SERVER = 'The server has to be updated to show this.'

function PersonSheet({ id, person, close, nav }) {
  const [d, setD] = useState(null)
  const [err, setErr] = useState(null)
  const [tab, setTab] = useState(person.shares ? 'usage' : 'community')
  useEffect(() => { api('/api/owner/person?id=' + encodeURIComponent(id)).then(setD, e => setErr(e.message)) }, [id])
  return <div className="ow-person">
    <h3>{person.name}{person.banned && <i className="ow-flag">banned</i>}{person.founder && <i className="ow-flag acc">owner</i>}</h3>
    <div className="ow-pmeta">
      <span>Joined {day(person.created)}</span>
      {person.shares && <span>Last seen {rel(person.lastSeen)}</span>}
      {person.referredBy && <span>Invited by {person.referredBy}</span>}
    </div>
    <Segmented value={tab} onChange={setTab} options={PERSON_TABS} />
    <div className="ow-ptab">
      {tab === 'account' ? <PersonAccount person={person} />
        : err ? <p className="ow-lead">{err}</p>
          : !d ? <p className="ow-lead">Loading…</p>
            : tab === 'usage' ? <PersonUsage d={d} person={person} />
              : tab === 'training' ? <PersonTraining d={d} person={person} />
                : <PersonCommunity d={d} onProfile={() => { close(); nav('/u/' + id) }} />}
    </div>
    <div style={{ height: 12 }} />
    <Button onClick={close}>Done</Button>
  </div>
}
const personSheet = (p, nav) => useUI.getState().openSheet(close => <PersonSheet id={p.id} person={p} close={close} nav={nav} />)

// Olympus: banning a profile (POST /api/owner/ban): it can no longer sign in and disappears from
// the feeds, its data kept so the ban can be lifted. Asked twice, as it locks someone out.
function BanButton({ person }) {
  const [banned, setBanned] = useState(!!person.banned)
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const set = async on => {
    setBusy(true)
    try {
      await api('/api/owner/ban', { method: 'POST', body: JSON.stringify({ id: person.id, on }) })
      setBanned(on); person.banned = on
      useUI.getState().toast(on ? person.name + ' is banned' : 'Ban lifted for ' + person.name)
    } catch (e) { useUI.getState().toast(e?.message || 'Could not connect') }
    setBusy(false); setAsking(false)
  }
  if (banned) return <Button disabled={busy} onClick={() => set(false)}>Lift the ban</Button>
  if (!asking) return <button className="btn danger" onClick={() => setAsking(true)}>Ban this profile</button>
  return <div className="ow-ban">
    <p className="ow-lead">{person.name} will not be able to sign in, and their profile and posts disappear for everyone. Nothing is deleted: you can lift the ban later.</p>
    <button className="btn danger" disabled={busy} onClick={() => set(true)}>Ban {person.name}</button>
    <div style={{ height: 8 }} />
    <Button disabled={busy} onClick={() => setAsking(false)}>Cancel</Button>
  </div>
}

/* ------------------------------ the page ----------------------------- */

const TABS = [
  { value: 'overview', label: 'Overview', icon: 'chartLine' }, { value: 'people', label: 'People', icon: 'person' },
  { value: 'community', label: 'Community', icon: 'chat' }, { value: 'feedback', label: 'Feedback', icon: 'star' }, { value: 'export', label: 'Export', icon: 'download' },
]
const PEOPLE_SORT = [
  { value: 'lastSeen', label: 'Last seen' }, { value: 'seconds', label: 'Time' }, { value: 'created', label: 'Joined' }, { value: 'posts', label: 'Posts' }, { value: 'invited', label: 'Invites' },
]
const QUIET_DAYS = 14
const WEEK = 7 * 86400000
const isNew = p => p.created && Date.now() - Date.parse(p.created) < WEEK
const isQuiet = p => p.shares && p.lastSeen && Date.now() - p.lastSeen > QUIET_DAYS * 86400000
const PEOPLE_FILTERS = [
  { value: 'all', label: 'Everyone', test: () => true },
  { value: 'week', label: 'Active this week', test: p => p.shares && p.lastSeen && Date.now() - p.lastSeen < WEEK },
  { value: 'new', label: 'New this week', test: isNew },
  { value: 'quiet', label: `Quiet for ${QUIET_DAYS} d`, test: isQuiet },
  { value: 'private', label: 'No statistics', test: p => !p.shares },
  { value: 'banned', label: 'Banned', test: p => p.banned },
]

function Tabs({ value, onChange }) {
  return <div className="ow-tabs" role="tablist">
    {TABS.map(t => <button key={t.value} role="tab" aria-selected={t.value === value} className={'ow-tab' + (t.value === value ? ' on' : '')} onClick={() => onChange(t.value)}>
      <Icon name={t.icon} />{t.label}
    </button>)}
  </div>
}

// The last tab the owner looked at, kept for the visit: coming back from a profile or a post
// returns to where they were.
const lastTab = { value: 'overview' }

function Overview({ d, days, setDays, openPerson }) {
  const [field, setField] = useState('active')
  const T = d.totals
  const features = featureRows(d.events, T.sharing)
  const unused = features.filter(f => !f.users && FEATURES.includes(f.name))
  const fresh = d.people.filter(isNew), quiet = d.people.filter(isQuiet)
  return <>
    <div className="ow-period"><Segmented value={days} onChange={setDays} options={PERIODS} /></div>
    <div className="ow-kpis">
      <Kpi label="people" value={num(T.users)} sub={`${num(T.signups30)} new in 30 d`} />
      <Kpi label="active today" value={num(T.active1)} tone="acc" />
      <Kpi label="active this week" value={num(T.active7)} />
      <Kpi label="active this month" value={num(T.active30)} />
      <Kpi label="joined by invite" value={num(T.referred)} sub={T.users ? pct(T.referred, T.users) + '% of people' : null} />
      <Kpi label="average session" value={T.avgSessionMin == null ? '–' : T.avgSessionMin + ' min'} />
    </div>
    <p className="ow-note"><Icon name="info" /> {T.sharing} of {T.users} {T.users === 1 ? 'person shares' : 'people share'} usage statistics. Activity, features and screens count only them; people, invites, posts and feedback count everyone.</p>

    <Card title="Activity" wideRight right={<Segmented value={field} onChange={setField} options={[{ value: 'active', label: 'People' }, { value: 'sessions', label: 'Sessions' }, { value: 'minutes', label: 'Minutes' }, { value: 'signups', label: 'Sign-ups' }]} />}>
      <DayChart rows={d.series} field={field} unit={field === 'minutes' ? ' min' : ''} />
    </Card>

    <Card title="Who to look at" lead={`People who joined in the last 7 days, and people who share statistics and have not opened the app for ${QUIET_DAYS} days or more.`}>
      <h4>New this week ({fresh.length})</h4>
      {fresh.length ? <div className="ow-tags">{fresh.map(p => <button key={p.id} className="ow-chip" onClick={() => openPerson(p)}>{p.name} · {shortDay(p.created)}</button>)}</div> : <p className="ow-lead">Nobody.</p>}
      <h4>Gone quiet ({quiet.length})</h4>
      {quiet.length ? <div className="ow-tags">{quiet.slice(0, 40).map(p => <button key={p.id} className="ow-chip" onClick={() => openPerson(p)}>{p.name} · {rel(p.lastSeen)}</button>)}</div> : <p className="ow-lead">Nobody.</p>}
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
  </>
}

function People({ d, openPerson }) {
  const [sort, setSort] = useState('lastSeen')
  const [filter, setFilter] = useState('all')
  const [q, setQ] = useState('')
  const people = useMemo(() => {
    const test = PEOPLE_FILTERS.find(f => f.value === filter).test
    const list = d.people.filter(p => test(p) && (!q || p.name.toLowerCase().includes(q.toLowerCase()) || (p.email || '').toLowerCase().includes(q.toLowerCase())))
    const key = p => (sort === 'created' ? String(p.created || '') : sort === 'lastSeen' ? p.lastSeen || 0 : p[sort] || 0)
    return list.slice().sort((a, b) => (key(b) > key(a) ? 1 : key(b) < key(a) ? -1 : 0))
  }, [d, sort, q, filter])
  return <>
    <Card title={`People (${people.length}${people.length === d.people.length ? '' : ' of ' + d.people.length})`} lead="Tap someone to see what they do: usage, training, community and account.">
      <div className="ow-tools">
        <input className="input" placeholder="Search name or e-mail" value={q} onChange={e => setQ(e.target.value)} />
        <div className="ow-chips">{PEOPLE_FILTERS.map(f => <button key={f.value} className={'ow-chip' + (f.value === filter ? ' on' : '')} aria-pressed={f.value === filter} onClick={() => setFilter(f.value)}>
          {f.label} <i>{d.people.filter(f.test).length}</i>
        </button>)}</div>
        <label className="ow-sort"><span>Sort by</span>
          <select className="input" value={sort} onChange={e => setSort(e.target.value)}>{PEOPLE_SORT.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
        </label>
      </div>
      <div className="ow-table" role="table">
        <div className="ow-tr ow-th" role="row"><span>Name</span><span>Last seen</span><span>Time</span><span>Joined</span></div>
        {people.map(p => <button key={p.id} className="ow-tr" role="row" onClick={() => openPerson(p)}>
          <span className="ow-name">{p.name}
            {p.banned && <i className="bad">banned</i>}
            {p.posts > 0 && <i className="dim">{p.posts} post{p.posts === 1 ? '' : 's'}</i>}
            {p.referredBy && <i>via {p.referredBy}</i>}
            {!p.shares && <i className="off">no statistics</i>}
          </span>
          <span>{p.shares ? rel(p.lastSeen) : '–'}</span>
          <span>{p.shares ? mins(p.seconds) : '–'}</span>
          <span>{shortDay(p.created)}</span>
        </button>)}
        {!people.length && <p className="ow-lead ow-empty">Nobody matches.</p>}
      </div>
    </Card>

    <Card title="Invites" lead="Who brought whom: people who created their account with someone’s invite code.">
      {d.referrals.length ? <div className="ow-refs">{d.referrals.map((r, i) => <div key={r.id} className="ow-ref">
        <div className="ow-ref-h"><span className="ow-rank">{i + 1}</span><b className="grow">{r.name}</b><span className="ow-code">{r.code}</span><b className="ow-big">{r.invited.length}</b></div>
        <div className="ow-tags">{r.invited.map(x => <span key={x.id}>{x.name} · {day(x.created)}</span>)}</div>
      </div>)}</div> : <p className="ow-lead">Nobody has joined with an invite code yet.</p>}
    </Card>
  </>
}

// Everyone's latest posts, a page at a time (GET /api/owner/posts), for the owner to look over.
function Community({ d, days, openPerson, nav }) {
  const [posts, setPosts] = useState(null)
  const [more, setMore] = useState(false)
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  const [hidden, setHidden] = useState(0)
  const load = before => {
    setBusy(true)
    return api('/api/owner/posts' + (before ? '?before=' + before : '')).then(r => {
      setPosts(list => (before ? [...(list || []), ...r.posts] : r.posts)); setMore(r.more); setHidden(r.hidden || 0); setErr(null)
    }, e => setErr(e.status === 404 ? OLD_SERVER : e.message)).finally(() => setBusy(false))
  }
  useEffect(() => { load() }, [])
  const c = d.community
  const byId = useMemo(() => new Map(d.people.map(p => [p.id, p])), [d])
  return <>
    {c && <>
      <div className="ow-kpis">
        <Kpi label={`posts in ${days} d`} value={num(c.postsPeriod)} sub={`${num(c.posts)} in all`} tone="acc" />
        <Kpi label={`people posting in ${days} d`} value={num(c.posters)} />
        <Kpi label={`comments in ${days} d`} value={num(c.commentsPeriod)} sub={`${num(c.comments)} in all`} />
        <Kpi label="likes" value={num(c.likes)} />
        <Kpi label="follows" value={num(c.follows)} />
        <Kpi label="private profiles" value={num(c.privateProfiles)} />
      </div>
      <p className="ow-note"><Icon name="info" /> {c.postsPeriod ? pct(c.workoutPosts, c.postsPeriod) + '% of the posts in the period share a workout. ' : ''}Messages between people are private and are not shown anywhere on this page.</p>
    </>}
    <Card title="Latest posts" lead={`What the public profiles post, newest first. Remove what does not belong; to stop someone, open them and use the ban.${hidden ? ` ${num(hidden)} post${hidden === 1 ? '' : 's'} of private profiles ${hidden === 1 ? 'is' : 'are'} not listed: only the followers they accepted see them.` : ''}`}>
      {err ? <p className="ow-lead">{err}</p>
        : !posts ? <p className="ow-lead">Loading…</p>
          : !posts.length ? <p className="ow-lead">Nothing has been posted yet.</p>
            : <div className="ow-fb">{posts.map(p => <PostCard key={p.id} post={p} name={p.name}
              onPerson={byId.get(p.uid) ? () => openPerson(byId.get(p.uid)) : null}
              onOpen={() => nav('/post/' + p.id)}
              onRemoved={id => setPosts(list => list.filter(x => x.id !== id))} />)}</div>}
      {more && posts?.length > 0 && <><div style={{ height: 10 }} /><Button disabled={busy} onClick={() => load(posts[posts.length - 1].ts)}>Earlier posts</Button></>}
    </Card>
  </>
}

function Feedback({ fb }) {
  return <Card title={`Feedback (${fb.count})`} lead="Averages of every rating sent, and the messages, newest first. Each one is also e-mailed to you when mail is set up on the server.">
    <div className="ow-kpis">
      <Kpi label="clear and easy (1 to 5)" value={fb.ratings.clarity ?? '–'} />
      <Kpi label="likes it (1 to 5)" value={fb.ratings.enjoy ?? '–'} />
      <Kpi label="useful for training (1 to 5)" value={fb.ratings.useful ?? '–'} />
      <Kpi label="would recommend (0 to 10)" value={fb.ratings.recommend ?? '–'} sub={fb.nps == null ? null : `NPS ${fb.nps > 0 ? '+' : ''}${fb.nps}`} tone={fb.nps == null ? '' : fb.nps >= 30 ? 'good' : fb.nps < 0 ? 'bad' : ''} />
    </div>
    <p className="ow-note"><Icon name="info" /> NPS is the share who answered 9 or 10 minus the share who answered 0 to 6, from −100 to +100.</p>
    {fb.items.length ? <div className="ow-fb">{fb.items.map(i => <div key={i.id} className="ow-fbi">
      <div className="ow-fbh"><b>{i.name}</b><span>{rel(i.at)}</span>{i.platform && <span>{i.platform} {i.version}</span>}</div>
      {Object.keys(i.ratings || {}).length > 0 && <div className="ow-tags">{Object.entries(i.ratings).map(([k, v]) => <span key={k}>{({ clarity: 'Clear', enjoy: 'Likes', useful: 'Useful', recommend: 'Recommend' })[k] || k} {v}/{k === 'recommend' ? 10 : 5}</span>)}</div>}
      {i.text && <p>{i.text}</p>}
    </div>)}</div> : <p className="ow-lead">No feedback yet.</p>}
  </Card>
}

function Export() {
  const toast = useUI(s => s.toast)
  const [busy, setBusy] = useState(false)
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
  return <Card title="Export" lead="The data behind this page, to open in a spreadsheet or keep. CSV is one table per file; JSON is everything in one file, the full usage history included.">
    <div className="ow-exp">
      <Button size="sm" icon="download" disabled={busy} onClick={() => exportFile('people')}>People (CSV)</Button>
      <Button size="sm" icon="download" disabled={busy} onClick={() => exportFile('daily')}>Daily totals (CSV)</Button>
      <Button size="sm" icon="download" disabled={busy} onClick={() => exportFile('events')}>Events (CSV)</Button>
      <Button size="sm" icon="download" disabled={busy} onClick={() => exportFile('feedback')}>Feedback (CSV)</Button>
      <Button size="sm" variant="tinted" icon="download" disabled={busy} onClick={() => exportFile('json')}>Everything (JSON)</Button>
    </div>
  </Card>
}

export default function Owner() {
  const nav = useNavigate()
  const toast = useUI(s => s.toast)
  const [days, setDays] = useState(30)
  const [tab, setTabState] = useState(lastTab.value)
  const [d, setD] = useState(null)
  const [err, setErr] = useState(null)
  const setTab = v => { lastTab.value = v; setTabState(v); window.scrollTo?.(0, 0) }
  const load = () => { setErr(null); return api('/api/owner/dashboard?days=' + days).then(setD, e => setErr(e.status === 403 ? 'Only the owner of this server can see this page.' : e.message)) }
  useEffect(() => { load() }, [days])
  const openPerson = p => personSheet(p, nav)

  if (err) return <div className="narrow ow"><Header nav={nav} /><div className="ow-card"><p>{err}</p><Button icon="reset" onClick={load}>Try again</Button></div></div>
  if (!d) return <div className="narrow ow"><Header nav={nav} /><div className="ow-card ow-lead">Loading…</div></div>

  return <div className="narrow ow">
    <Header nav={nav} onRefresh={() => load().then(() => toast('Updated'))} />
    <Tabs value={tab} onChange={setTab} />
    {tab === 'overview' ? <Overview d={d} days={days} setDays={setDays} openPerson={openPerson} />
      : tab === 'people' ? <People d={d} openPerson={openPerson} />
        : tab === 'community' ? <Community d={d} days={days} openPerson={openPerson} nav={nav} />
          : tab === 'feedback' ? <Feedback fb={d.feedback} />
            : <Export />}
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
