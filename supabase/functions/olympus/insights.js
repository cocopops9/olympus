// Copied from api/insights.js by scripts/supabase-bundle.mjs. Edit that file, then run the script.
// Olympus: what the owner of the server learns about how the app is used. Three parts, all kept
// in the server's documents and shown only to the founder (the profile that made the server):
//
//   telemetry  usage statistics a person agreed to share (the app asks once, Settings turns it
//              off): sessions, time in the app, time per screen and which features are used,
//              summed per day in their own document 'tel:<uid>', with the last events in order.
//   referrals  every profile has an invite code; a profile made with one records who invited it.
//   feedback   ratings and a message from inside the app, kept here and sent to the owner by
//              e-mail when the server has a mail key (RESEND_API_KEY, FEEDBACK_EMAIL).
//
// Pure functions on plain objects: the Supabase server (supabase/functions/olympus/core.js) reads
// and writes the documents, this file decides what goes in them and what the dashboard shows.

export const TEL_DAYS_KEEP = 400;          // days of daily totals kept per profile
export const TEL_RECENT_KEEP = 300;        // last events kept in order per profile
export const TEL_BATCH_MAX = 200;          // events accepted in one upload
export const FEEDBACK_KEEP = 2000;
export const FEEDBACK_PER_DAY = 5;
export const RATING_KEYS = ['clarity', 'enjoy', 'useful'];     // 1 to 5
export const CODE_LEN = 6;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';        // no 0/O or 1/I to misread

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const int = (v, lo, hi) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : null; };
const isMap = v => !!v && typeof v === 'object' && !Array.isArray(v);
export const dayKey = ms => new Date(ms).toISOString().slice(0, 10);

/* ------------------------------ referrals ------------------------------ */

/** A new invite code no profile in `users` has; `rand(n)` gives n random bytes. */
export function newCode(users, rand) {
  const taken = new Set(users.map(u => u.ref).filter(Boolean));
  for (let i = 0; i < 50; i++) {
    const b = rand(CODE_LEN);
    const code = Array.from(b, x => CODE_CHARS[x % CODE_CHARS.length]).join('');
    if (!taken.has(code)) return code;
  }
  throw new Error('no free invite code');
}
export const normalizeCode = v => str(v, 20).toUpperCase().replace(/[^A-Z0-9]/g, '');
/** The profile whose invite code is `code`, or null. */
export const inviter = (users, code) => { const c = normalizeCode(code); return c ? users.find(u => u.ref === c) || null : null; };
/** The profiles `uid` invited, oldest first. */
export const invitedBy = (users, uid) => users.filter(u => u.referredBy === uid).sort((a, b) => String(a.created).localeCompare(String(b.created)));

/* ------------------------------ telemetry ------------------------------ */

// Screens are kept by the route, with ids taken out so one routine or post is not a screen of its own.
export const screenOf = path => str(path, 120).split('?')[0].replace(/\/[A-Za-z0-9_-]{12,}(?=\/|$)/g, '/:id').replace(/\/\d+(?=\/|$)/g, '/:n') || '/';
const EVENT_RE = /^[a-z][a-z0-9_.-]{1,39}$/;

/**
 * Adds one upload to profile document `doc` (null for none yet) and returns it. Events:
 *   { t, type: 'open' }                       the app came to the front (a session)
 *   { t, type: 'screen', path, sec }          seconds spent on a screen
 *   { t, type: 'event', name, n? }            a feature used ('workout.finish', 'coach.ask')
 * `info`: { platform, version }. Times later than `now` or older than 3 days are refused.
 */
export function addTelemetry(doc, events, info = {}, now = Date.now()) {
  const d = isMap(doc) ? doc : { days: {}, recent: [] };
  if (!isMap(d.days)) d.days = {};
  if (!Array.isArray(d.recent)) d.recent = [];
  for (const e of (Array.isArray(events) ? events : []).slice(0, TEL_BATCH_MAX)) {
    if (!isMap(e)) continue;
    const t = Number(e.t);
    if (!Number.isFinite(t) || t > now + 60000 || t < now - 3 * 86400000) continue;
    const day = d.days[dayKey(t)] = isMap(d.days[dayKey(t)]) ? d.days[dayKey(t)] : { s: 0, sec: 0, scr: {}, ev: {} };
    let kept = null;
    if (e.type === 'open') { day.s++; kept = { t, type: 'open' }; }
    else if (e.type === 'screen') {
      const sec = int(e.sec, 0, 6 * 3600);
      if (!sec) continue;
      const scr = screenOf(e.path);
      day.sec += sec;
      day.scr[scr] = (day.scr[scr] || 0) + sec;
      kept = { t, type: 'screen', path: scr, sec };
    } else if (e.type === 'event' && EVENT_RE.test(String(e.name))) {
      const n = int(e.n ?? 1, 1, 1000);
      day.ev[e.name] = (day.ev[e.name] || 0) + n;
      kept = { t, type: 'event', name: e.name, ...(n > 1 ? { n } : {}) };
    }
    if (!kept) continue;
    day.first = Math.min(day.first || t, t);
    day.last = Math.max(day.last || 0, t);
    d.recent.push(kept);
    d.lastSeen = Math.max(d.lastSeen || 0, t);
    d.firstSeen = Math.min(d.firstSeen || t, t);
  }
  d.recent = d.recent.sort((a, b) => a.t - b.t).slice(-TEL_RECENT_KEEP);
  const oldest = dayKey(now - TEL_DAYS_KEEP * 86400000);
  for (const k of Object.keys(d.days)) if (k < oldest) delete d.days[k];
  const platform = str(info.platform, 20), version = str(info.version, 30);
  if (platform) d.platform = platform;
  if (version) d.version = version;
  return d;
}

/* ------------------------------ feedback ------------------------------- */

/** A feedback entry made safe, or a string saying what is wrong with it. */
export function cleanFeedback(body) {
  const ratings = {};
  for (const k of RATING_KEYS) { const v = int(body?.ratings?.[k], 1, 5); if (v != null && body?.ratings?.[k] != null) ratings[k] = v; }
  const recommend = body?.ratings?.recommend != null ? int(body.ratings.recommend, 0, 10) : null;
  if (recommend != null) ratings.recommend = recommend;
  const text = str(body?.text, 4000);
  if (!Object.keys(ratings).length && !text) return 'empty';
  return { ratings, text, platform: str(body?.platform, 20), version: str(body?.version, 30) };
}

/** Adds `entry` from `user` to the feedback document; throws 'limit' past the daily allowance. */
export function addFeedback(doc, user, entry, now = Date.now()) {
  const d = isMap(doc) && Array.isArray(doc.items) ? doc : { items: [] };
  const today = dayKey(now);
  if (d.items.filter(x => x.uid === user.id && dayKey(x.at) === today).length >= FEEDBACK_PER_DAY) throw new Error('limit');
  d.items.push({ id: now.toString(36) + Math.random().toString(36).slice(2, 6), uid: user.id, name: user.name, at: now, ...entry });
  d.items = d.items.slice(-FEEDBACK_KEEP);
  return d;
}

const LABEL = { clarity: 'Clear and easy to use', enjoy: 'Likes the app', useful: 'Useful for training', recommend: 'Would recommend (0-10)' };
/** The e-mail for one feedback entry: { subject, text, html }. */
export function feedbackMail(item) {
  const lines = [
    `From: ${item.name} (${item.uid})`,
    `When: ${new Date(item.at).toISOString()}`,
    item.platform || item.version ? `App: ${[item.platform, item.version].filter(Boolean).join(' ')}` : '',
    '',
    ...Object.entries(item.ratings || {}).map(([k, v]) => `${LABEL[k] || k}: ${v}${k === 'recommend' ? '/10' : '/5'}`),
    '',
    item.text || '(no message)',
  ].filter((l, i, a) => l !== '' || a[i - 1] !== '');
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  return {
    subject: `Olympus feedback from ${item.name}`,
    text: lines.join('\n'),
    html: `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5">${lines.map(l => (l ? esc(l) : '&nbsp;')).join('<br>')}</div>`,
  };
}

/**
 * Sends `mail` ({ to?, subject, text, html }; `to` defaults to the owner, FEEDBACK_EMAIL) and
 * resolves to whether it went. Through Brevo when the server has BREVO_API_KEY (any recipient
 * once the sender address MAIL_FROM is verified there, no domain needed), else through Resend
 * with RESEND_API_KEY (its test sender reaches only the Resend account's own address; any
 * recipient once a domain is verified and MAIL_FROM uses it).
 */
export async function sendMail(env, mail, fetchImpl = globalThis.fetch) {
  const to = mail.to || env?.FEEDBACK_EMAIL;
  const from = env?.MAIL_FROM || env?.FEEDBACK_FROM || '';
  if (!to) return false;
  let res;
  if (env?.BREVO_API_KEY) {
    const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(from);
    const sender = m ? { name: m[1] || 'Olympus', email: m[2] } : { name: 'Olympus', email: from || env?.FEEDBACK_EMAIL };
    if (!sender.email) return false;
    res = await fetchImpl('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ sender, to: [{ email: to }], subject: mail.subject, textContent: mail.text, htmlContent: mail.html }),
    });
  } else if (env?.RESEND_API_KEY) {
    res = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: from || 'Olympus <onboarding@resend.dev>', to: [to], subject: mail.subject, text: mail.text, html: mail.html }),
    });
  } else return false;
  if (!res.ok) console.error('mail', res.status, await res.text().catch(() => ''));
  return res.ok;
}
/** Whether the server has a way to send mail at all. */
export const canMail = env => !!(env?.BREVO_API_KEY || env?.RESEND_API_KEY);

/* ------------------------------ dashboard ------------------------------ */

const avg = list => (list.length ? Math.round(list.reduce((a, b) => a + b, 0) / list.length * 10) / 10 : null);

/**
 * Everything the owner's dashboard shows. `users` the accounts, `tel` { uid: telemetry doc },
 * `feedback` the feedback document, `days` how many days the daily series covers.
 */
export function dashboard({ users, tel, feedback, now = Date.now(), days = 30 }) {
  const byId = new Map(users.map(u => [u.id, u]));
  const today = dayKey(now);
  const dayList = Array.from({ length: days }, (_, i) => dayKey(now - (days - 1 - i) * 86400000))
  const inLast = (doc, n) => Object.entries(doc?.days || {}).filter(([k]) => k > dayKey(now - n * 86400000))
  const people = users.map(u => {
    const d = tel[u.id] || null
    const all = Object.entries(d?.days || {})
    const sum = (list, f) => list.reduce((a, [, x]) => a + (f(x) || 0), 0)
    return {
      id: u.id, name: u.name, created: u.created || null, email: u.email || null,
      referredBy: u.referredBy ? byId.get(u.referredBy)?.name || u.referredBy : null,
      invited: invitedBy(users, u.id).length,
      shares: !!d, lastSeen: d?.lastSeen || null, platform: d?.platform || null, version: d?.version || null,
      sessions: sum(all, x => x.s), seconds: sum(all, x => x.sec), activeDays: all.length,
      seconds7: sum(inLast(d, 7), x => x.sec), sessions7: sum(inLast(d, 7), x => x.s),
    }
  })
  const series = dayList.map(day => {
    let active = 0, sessions = 0, seconds = 0
    for (const d of Object.values(tel)) { const x = d?.days?.[day]; if (x) { active++; sessions += x.s || 0; seconds += x.sec || 0 } }
    const signups = users.filter(u => String(u.created || '').slice(0, 10) === day).length
    return { day, active, sessions, minutes: Math.round(seconds / 60), signups }
  })
  const activeIn = n => Object.values(tel).filter(d => inLast(d, n).length).length
  // Per screen and feature: the total in the window, and how many profiles used it at all (adoption).
  const screens = {}, events = {}, screenUsers = {}, eventUsers = {}
  for (const d of Object.values(tel)) {
    const seenS = new Set(), seenE = new Set()
    for (const [k, x] of Object.entries(d?.days || {})) {
      if (k <= dayKey(now - days * 86400000)) continue
      for (const [s, sec] of Object.entries(x.scr || {})) { screens[s] = (screens[s] || 0) + sec; seenS.add(s) }
      for (const [e, n] of Object.entries(x.ev || {})) { events[e] = (events[e] || 0) + n; seenE.add(e) }
    }
    for (const s of seenS) screenUsers[s] = (screenUsers[s] || 0) + 1
    for (const e of seenE) eventUsers[e] = (eventUsers[e] || 0) + 1
  }
  const sharing = people.filter(p => p.shares)
  const items = Array.isArray(feedback?.items) ? feedback.items : []
  const ratings = Object.fromEntries([...RATING_KEYS, 'recommend'].map(k => [k, avg(items.map(i => i.ratings?.[k]).filter(v => v != null))]))
  const promoters = items.filter(i => i.ratings?.recommend >= 9).length, detractors = items.filter(i => i.ratings?.recommend != null && i.ratings.recommend <= 6).length
  const rated = items.filter(i => i.ratings?.recommend != null).length
  return {
    at: now, today,
    totals: {
      users: users.length, sharing: sharing.length,
      active1: activeIn(1), active7: activeIn(7), active30: activeIn(30),
      signups30: users.filter(u => String(u.created || '') > dayKey(now - 30 * 86400000)).length,
      referred: users.filter(u => u.referredBy).length,
      avgSessionMin: (() => { const s = sharing.reduce((a, p) => a + p.sessions, 0); return s ? Math.round(sharing.reduce((a, p) => a + p.seconds, 0) / s / 6) / 10 : null })(),
    },
    series,
    screens: Object.entries(screens).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([path, seconds]) => ({ path, seconds, users: screenUsers[path] || 0 })),
    events: Object.entries(events).sort((a, b) => b[1] - a[1]).slice(0, 60).map(([name, n]) => ({ name, n, users: eventUsers[name] || 0 })),
    people: people.sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0) || String(b.created).localeCompare(String(a.created))),
    referrals: users.map(u => ({ id: u.id, name: u.name, code: u.ref || null, invited: invitedBy(users, u.id).map(x => ({ id: x.id, name: x.name, created: x.created })) }))
      .filter(r => r.invited.length).sort((a, b) => b.invited.length - a.invited.length),
    feedback: { count: items.length, ratings, nps: rated ? Math.round((promoters - detractors) / rated * 100) : null, items: items.slice(-200).reverse() },
  }
}

/** One profile's telemetry for the dashboard's detail: its days, top screens and features, last events. */
export function personDetail(user, doc) {
  const days = Object.entries(doc?.days || {}).sort((a, b) => a[0].localeCompare(b[0]))
  const screens = {}, events = {}
  for (const [, x] of days) {
    for (const [s, sec] of Object.entries(x.scr || {})) screens[s] = (screens[s] || 0) + sec
    for (const [e, n] of Object.entries(x.ev || {})) events[e] = (events[e] || 0) + n
  }
  return {
    id: user.id, name: user.name, created: user.created || null,
    days: days.slice(-60).map(([day, x]) => ({ day, sessions: x.s || 0, minutes: Math.round((x.sec || 0) / 60), first: x.first || null, last: x.last || null })),
    screens: Object.entries(screens).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([path, seconds]) => ({ path, seconds })),
    events: Object.entries(events).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([name, n]) => ({ name, n })),
    recent: (doc?.recent || []).slice(-100).reverse(),
  }
}

const csvCell = v => { const s = v == null ? '' : String(v); return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s }
/** `rows` (objects) as CSV with the columns `cols`. */
export const toCsv = (rows, cols) => [cols.join(','), ...rows.map(r => cols.map(c => csvCell(r[c])).join(','))].join('\n') + '\n'

/** The CSV exports of the dashboard: 'people', 'daily', 'events', 'feedback'. */
export function exportCsv(what, board, { tel = {}, users = [] } = {}) {
  if (what === 'people') return toCsv(board.people.map(p => ({ ...p, lastSeen: p.lastSeen ? new Date(p.lastSeen).toISOString() : '', minutes: Math.round(p.seconds / 60), minutes7: Math.round(p.seconds7 / 60) })),
    ['id', 'name', 'email', 'created', 'referredBy', 'invited', 'shares', 'lastSeen', 'platform', 'version', 'sessions', 'minutes', 'activeDays', 'sessions7', 'minutes7'])
  if (what === 'daily') return toCsv(board.series, ['day', 'active', 'sessions', 'minutes', 'signups'])
  if (what === 'events') {
    const byId = new Map(users.map(u => [u.id, u.name]))
    const rows = []
    for (const [uid, d] of Object.entries(tel)) for (const e of d?.recent || []) rows.push({ time: new Date(e.t).toISOString(), user: byId.get(uid) || uid, uid, type: e.type, path: e.path || '', name: e.name || '', seconds: e.sec || '', n: e.n || '' })
    return toCsv(rows.sort((a, b) => a.time.localeCompare(b.time)), ['time', 'user', 'uid', 'type', 'path', 'name', 'seconds', 'n'])
  }
  if (what === 'feedback') return toCsv(board.feedback.items.map(i => ({ time: new Date(i.at).toISOString(), user: i.name, uid: i.uid, ...i.ratings, text: i.text, platform: i.platform, version: i.version })),
    ['time', 'user', 'uid', 'clarity', 'enjoy', 'useful', 'recommend', 'text', 'platform', 'version'])
  return null
}
