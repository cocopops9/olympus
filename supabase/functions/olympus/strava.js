// Strava (Settings → Strava): a finished workout is posted to the athlete's Strava feed as a
// manual activity, once they have connected their Strava account, and they can disconnect at any
// time. Supabase only: the Node server does not offer it, and the app says so.
//
// The flow is Strava's OAuth 2 for web apps (developers.strava.com/docs/authentication):
//   1. The app asks POST /api/strava/connect for Strava's authorize page, with a `state` that this
//      server signed for the profile (so the answer can only land on the profile that asked).
//   2. The athlete approves in the browser (or the Strava app); Strava sends the browser to
//      GET /api/strava/callback?code=...&state=...&scope=..., on this function.
//   3. The server trades the code for tokens with the client secret, which never leaves it, and
//      keeps them sealed with its own key (connector-token.js sealToken) in 'strava:<uid>'.
//   4. After each workout the app sends POST /api/strava/post with the activity it worked out
//      (frontend/src/lib/strava.js); the server refreshes the access token when it is about to run
//      out (it lasts six hours) and creates the activity (POST /api/v3/activities).
//
// One document per profile, kept apart from the accounts document so posting never locks it:
//   'strava:<uid>'  { athlete: { id, name }, scope, at, a (sealed access token), r (sealed
//                   refresh token), exp (seconds, Strava's expires_at), posted: { [workout id]:
//                   <activity id> | '-' (refused for good) | 'p:<ms>' (being posted) } }
// `posted` makes a second post of the same workout return the first, so a retry whose answer was
// lost, or two phones emptying the same queue, never doubles an activity on Strava.

export const STRAVA_AUTHORIZE = 'https://www.strava.com/oauth/authorize';
export const STRAVA_AUTHORIZE_MOBILE = 'https://www.strava.com/oauth/mobile/authorize';
export const STRAVA_TOKEN = 'https://www.strava.com/oauth/token';
export const STRAVA_DEAUTHORIZE = 'https://www.strava.com/oauth/deauthorize';
export const STRAVA_ACTIVITIES = 'https://www.strava.com/api/v3/activities';

// Only what posting needs: `read` comes with every grant, `activity:write` creates activities.
export const STRAVA_SCOPE = 'read,activity:write';
// A connect has ten minutes from the tap to the approval.
export const STATE_TTL_MS = 10 * 60 * 1000;
// A token with less than this left is refreshed first (Strava: refresh when under an hour is
// allowed; one minute leaves room for the request itself).
const REFRESH_MARGIN_S = 60;
// A post whose answer never came (the function stopped mid-request) is tried again after this.
export const PENDING_MS = 2 * 60 * 1000;
// How many workouts' outcomes each profile keeps: far more than any queue can hold.
export const POSTED_KEEP = 500;

export const docKey = uid => 'strava:' + uid;

/**
 * The Strava API application this server posts as, from the function's secrets:
 * STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, and where Strava sends the browser back
 * (STRAVA_REDIRECT_URI, else this function's /api/strava/callback). Strava only accepts a
 * redirect on the "Authorization Callback Domain" set in the application, so on the hosted project
 * that domain is <ref>.supabase.co. Null when the server has no application.
 */
export function stravaConfig(env = {}) {
  const id = String(env.STRAVA_CLIENT_ID || '').trim();
  const secret = String(env.STRAVA_CLIENT_SECRET || '').trim();
  if (!id || !secret) return null;
  const own = String(env.STRAVA_REDIRECT_URI || '').trim();
  const project = String(env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const redirect = own || (project ? project + '/functions/v1/olympus/api/strava/callback' : '');
  return redirect ? { id, secret, redirect } : null;
}

/** Strava's page where the athlete approves; `mobile` opens the Strava app when it is installed. */
export function authorizeUrl(config, state, { mobile = false } = {}) {
  const q = new URLSearchParams({
    client_id: config.id,
    redirect_uri: config.redirect,
    response_type: 'code',
    approval_prompt: 'auto',
    scope: STRAVA_SCOPE,
    state,
  });
  return (mobile ? STRAVA_AUTHORIZE_MOBILE : STRAVA_AUTHORIZE) + '?' + q.toString();
}

/** Whether the scope Strava reports back (comma-separated) lets this server post. */
export const canWrite = scope => String(scope || '').split(',').map(s => s.trim()).includes('activity:write');

export class StravaError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}

// A Strava answer as { status, body }; a network failure is a 502 of our own.
async function call(fetchImpl, url, init) {
  let res;
  try { res = await fetchImpl(url, init); } catch (e) { throw new StravaError(502, 'Strava could not be reached', 'strava-unreachable'); }
  let body = null;
  try { body = await res.json(); } catch { body = null; }
  return { status: res.status, body };
}

const form = fields => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
  body: new URLSearchParams(Object.entries(fields).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)])).toString(),
});

/** The tokens and athlete for an approval's `code`. */
export async function exchangeCode(config, code, fetchImpl) {
  const r = await call(fetchImpl, STRAVA_TOKEN, form({ client_id: config.id, client_secret: config.secret, code, grant_type: 'authorization_code' }));
  if (r.status !== 200 || !r.body?.access_token || !r.body?.refresh_token) throw new StravaError(502, 'Strava did not accept the approval', 'strava-exchange');
  return r.body;
}

/** A fresh access token (and possibly a new refresh token) for `refresh`. 401 when Strava revoked it. */
export async function refreshTokens(config, refresh, fetchImpl) {
  const r = await call(fetchImpl, STRAVA_TOKEN, form({ client_id: config.id, client_secret: config.secret, refresh_token: refresh, grant_type: 'refresh_token' }));
  if (r.status === 400 || r.status === 401) throw new StravaError(401, 'Strava no longer accepts this connection', 'strava-revoked');
  if (r.status !== 200 || !r.body?.access_token) throw new StravaError(502, 'Strava could not renew the connection', 'strava-refresh');
  return r.body;
}

/** Ends the grant on Strava's side too, so Olympus leaves the athlete's Strava settings. Best effort. */
export async function deauthorize(access, fetchImpl) {
  try { await call(fetchImpl, STRAVA_DEAUTHORIZE, form({ access_token: access })); } catch { /* the grant then ends with its token */ }
}

export const needsRefresh = (doc, nowMs) => !(Number(doc?.exp) * 1000 - REFRESH_MARGIN_S * 1000 > nowMs);

// What the app sends, held to what Strava takes. Strava's own limits are not published for every
// field; these are generous and keep one request small.
const SPORT_RE = /^[A-Za-z]{2,40}$/;
const LOCAL_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;
const WID_RE = /^[A-Za-z0-9_.:-]{1,80}$/;
export const NAME_MAX = 200;
export const DESCRIPTION_MAX = 3000;
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

/** The activity in a POST /api/strava/post body, or a 400. */
export function cleanActivity(b) {
  const str = v => (typeof v === 'string' ? v : '');
  const wid = str(b?.wid);
  const name = str(b?.name).trim();
  const sport = str(b?.sport_type);
  const start = str(b?.start_date_local);
  const elapsed = Math.round(Number(b?.elapsed_time));
  if (!WID_RE.test(wid)) throw new StravaError(400, 'which workout?', 'bad-activity');
  if (!SPORT_RE.test(sport) || !LOCAL_RE.test(start) || !(elapsed >= 1 && elapsed <= 7 * 86400)) throw new StravaError(400, 'the activity is not complete', 'bad-activity');
  const out = { wid, name: clip(name || 'Workout', NAME_MAX), sport_type: sport, start_date_local: start, elapsed_time: elapsed };
  const description = str(b?.description).trim();
  if (description) out.description = clip(description, DESCRIPTION_MAX);
  const distance = Number(b?.distance);
  if (distance > 0 && distance < 1e6) out.distance = Math.round(distance * 10) / 10;
  if (b?.trainer === true) out.trainer = 1;
  return out;
}

/**
 * Creates the activity. A sport type this Strava does not know (the list grows, and an older one
 * refuses newer names) is posted once more as a plain "Workout" rather than lost.
 * Returns Strava's activity id.
 */
export async function createActivity(access, activity, fetchImpl) {
  const { wid, ...fields } = activity;
  const send = f => call(fetchImpl, STRAVA_ACTIVITIES, { ...form(f), headers: { ...form(f).headers, Authorization: 'Bearer ' + access } });
  let r = await send(fields);
  if ((r.status === 400 || r.status === 422) && fields.sport_type !== 'Workout' && /sport_type|type/i.test(JSON.stringify(r.body?.errors || r.body || ''))) {
    r = await send({ ...fields, sport_type: 'Workout' });
  }
  if (r.status === 201 || r.status === 200) {
    const id = r.body?.id;
    if (id == null) throw new StravaError(502, 'Strava did not say which activity it made', 'strava-error');
    return String(id);
  }
  if (r.status === 401) throw new StravaError(401, 'Strava no longer accepts this connection', 'strava-revoked');
  if (r.status === 403) throw new StravaError(403, 'Strava did not allow posting activities', 'strava-scope');
  if (r.status === 429) throw new StravaError(503, 'Strava is busy, try again later', 'strava-busy');
  if (r.status >= 400 && r.status < 500) throw new StravaError(422, 'Strava refused this activity', 'strava-refused');
  throw new StravaError(502, 'Strava did not answer', 'strava-error');
}

/** `posted` with the oldest entries dropped past POSTED_KEEP (object keys keep insertion order). */
export function trimPosted(posted) {
  const keys = Object.keys(posted || {});
  if (keys.length <= POSTED_KEEP) return posted || {};
  return Object.fromEntries(keys.slice(keys.length - POSTED_KEEP).map(k => [k, posted[k]]));
}

/** The athlete's name as Strava gives it. */
export const athleteName = a => [a?.firstname, a?.lastname].map(s => (typeof s === 'string' ? s.trim() : '')).filter(Boolean).join(' ').slice(0, 80);
