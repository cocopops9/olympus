// The Claude connector's address token (connector.js): made by the app's function (core.js),
// checked by the connector's. A module of its own so core.js does not load the connector's tools.
import crypto from 'node:crypto';

export const TOKEN_RE = /^[A-Za-z0-9_-]{32,128}$/;
// 32 random bytes: 256 bits, as base64url (43 characters, safe in a URL path).
export const newConnectorToken = () => crypto.randomBytes(32).toString('base64url');
// The account keeps only this, so a copy of the database does not hand out working addresses.
export const tokenHash = token => crypto.createHash('sha256').update(token).digest('hex');
// Where the connector answers: OLYMPUS_CONNECTOR_URL, else the olympus-mcp function beside this one.
export function connectorBase(env) {
  const own = String(env.OLYMPUS_CONNECTOR_URL || '').trim().replace(/\/+$/, '');
  if (own) return own;
  const project = String(env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  return project ? project + '/functions/v1/olympus-mcp' : null;
}
