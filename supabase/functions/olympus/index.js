// Olympus on Supabase: the Edge Function's entry point. Deployed with JWT verification off,
// because the app carries Olympus's own session token, not a Supabase one (core.js checks it).
import { createApp } from './core.js';
import { store, photos } from './store.js';

// Hercules reads its provider key and model from the function's secrets (HERCULES_API_KEY, ...).
const app = createApp({ store, photos, env: Deno.env.toObject() });
Deno.serve(req => app.handle(req));
