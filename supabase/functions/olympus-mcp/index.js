// Olympus on Supabase: the Claude connector's Edge Function (../olympus/connector.js). Deployed
// with JWT verification off, like the app's function: the address's own token says whose data
// it is. deno.json maps the two npm packages the shared MCP tools import.
import { createConnector } from '../olympus/connector.js';
import { store } from '../olympus/store.js';

const connector = createConnector({ store });
Deno.serve(req => connector.handle(req));
