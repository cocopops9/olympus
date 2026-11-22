// Olympus on Supabase: the Claude connector. A remote MCP server (Streamable HTTP) that lets
// Claude, or any MCP client, read one profile's training: routines, workouts, body weight,
// estimated 1RMs, muscle balance. Read-only; the tools are the stdio server's (mcp/src/tools.js),
// spoken over HTTP by mcp/src/remote.js.
//
// It runs as its own Edge Function (supabase/functions/olympus-mcp), so the app's function does
// not load the exercise library and the tools on every cold start, and a fault here cannot take
// the app's sign-in or sync down with it.
//
// Which profile: the connector address the app hands out (core.js, /api/connector) ends in a
// random token, and the account keeps only its SHA-256. Claude's custom connectors take an
// address and, without OAuth, nothing else, so the address is the credential, the same way a
// calendar's private feed address is. Settings shows when it was last used and replaces or
// removes it in one tap; "Sign out everywhere" removes it too. A client that can send headers
// may send the token as "Authorization: Bearer <token>" to the bare address instead.
import { answerBody } from '../../../mcp/src/remote.js';
import { TOKEN_RE, tokenHash } from './connector-token.js';

const MAX_BODY = 1024 * 1024;
const USED_EVERY_MS = 3600000;      // "last used" is written at most once an hour per profile

const usersOf = db => (Array.isArray(db?.users) ? db.users : []);
// The training document without the sync bookkeeping that only the server reads.
const training = doc => {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return null;
  const { _unstamped, _prior, _wids, ...rest } = doc;
  return rest;
};

function tokenOf(req, url) {
  const auth = req.headers.get('authorization') || '';
  if (auth.startsWith('Bearer ')) {
    const t = auth.slice(7).trim();
    if (TOKEN_RE.test(t)) return t;
  }
  const last = url.pathname.split('/').filter(Boolean).pop() || '';
  return TOKEN_RE.test(last) ? last : null;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID',
  'Access-Control-Expose-Headers': 'Mcp-Session-Id',
};
const json = (status, body, extra = {}) => new Response(body == null ? null : JSON.stringify(body), {
  status,
  headers: { ...CORS, ...(body == null ? {} : { 'Content-Type': 'application/json; charset=utf-8' }), 'Cache-Control': 'no-store', ...extra },
});

export function createConnector({ store, now = () => Date.now() }) {
  async function profileOf(token) {
    const h = tokenHash(token);
    const user = usersOf(await store.read('db')).find(u => u.connector?.h === h);
    if (!user || user.disabled) return null;
    return user;
  }

  async function markUsed(user) {
    if (now() - (user.connector.used || 0) < USED_EVERY_MS) return;
    await store.update(['db'], ({ get, set }) => {
      const db = get('db');
      const u = usersOf(db).find(x => x.id === user.id);
      // Only the token this request came with: a replaced or removed one is not revived.
      if (!u || u.connector?.h !== user.connector.h) return;
      u.connector.used = now();
      set('db', db);
    });
  }

  async function handle(req) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...CORS, 'Access-Control-Max-Age': '86400' } });

    const token = tokenOf(req, url);
    // An unknown address answers 404, not 401: a 401 sends MCP clients looking for an OAuth
    // server, and there is none to find. Replaced and removed addresses land here too.
    const user = token ? await profileOf(token) : null;
    if (!user) return json(404, { error: 'this Olympus connector address is not active. Make a new one in the app: Settings, Connect to Claude.' });

    // No server-to-client stream and no session to end (mcp/src/remote.js).
    if (req.method === 'GET' || req.method === 'DELETE') return json(405, { error: 'method not allowed' }, { Allow: 'POST' });
    if (req.method !== 'POST') return json(405, { error: 'method not allowed' }, { Allow: 'POST' });

    const text = await req.text();
    if (text.length > MAX_BODY) return json(413, { error: 'request too large' });

    const load = async () => ({
      state: training(await store.read('state:' + user.id)),
      user: { id: user.id, name: user.name, created: user.created || null },
    });
    const { status, body } = await answerBody(text, { load });
    try { await markUsed(user); } catch (e) { console.error('connector: last used', e); }
    return json(status, body);
  }

  return { handle };
}
