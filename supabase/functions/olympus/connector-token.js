// The Claude connector's address token (connector.js): made by the app's function (core.js),
// checked by the connector's. A module of its own so core.js does not load the connector's tools.
import crypto from 'node:crypto';

export const TOKEN_RE = /^[A-Za-z0-9_-]{32,128}$/;
// 32 random bytes: 256 bits, as base64url (43 characters, safe in a URL path).
export const newConnectorToken = () => crypto.randomBytes(32).toString('base64url');
// The account keeps only this, so a copy of the database does not hand out working addresses.
export const tokenHash = token => crypto.createHash('sha256').update(token).digest('hex');
// Where the connector answers: OLYMPUS_CONNECTOR_URL, else the olympus-mcp function beside this one.
//
// On a hosted project the address uses the functions host, <ref>.functions.supabase.co/olympus-mcp,
// not <ref>.supabase.co/functions/v1/olympus-mcp. Both reach the same function, but before adding a
// connector Claude fetches /.well-known/oauth-protected-resource/<connector path> on the same host
// (MCP authorization, protected resource metadata), and on <ref>.supabase.co the gateway answers
// any such path containing /functions/v1/ with 401 "No API key". Claude reads that 401 as "sign-in
// required" and then fails to register with a sign-in service that does not exist. On the
// functions host the same lookup is a plain 404, which reads as "no sign-in".
const HOSTED = /^https:\/\/([a-z0-9]+)\.supabase\.co$/i;
export function connectorBase(env) {
  const own = String(env.OLYMPUS_CONNECTOR_URL || '').trim().replace(/\/+$/, '');
  if (own) return own;
  const project = String(env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  if (!project) return null;
  const hosted = project.match(HOSTED);
  return hosted ? `https://${hosted[1]}.functions.supabase.co/olympus-mcp` : project + '/functions/v1/olympus-mcp';
}
