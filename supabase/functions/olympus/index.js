// Olympus on Supabase: the Edge Function's entry point. Deployed with JWT verification off,
// because the app carries Olympus's own session token, not a Supabase one (core.js checks it).
import { createApp } from './core.js';
import { store, photos } from './store.js';

const app = createApp({ store, photos });
Deno.serve(req => app.handle(req));
