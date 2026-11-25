# Olympus server on Supabase (free)

The phone app's server, run as one Supabase Edge Function on the free plan. Nothing to keep
running and no machine to look after.

- **Project:** `olympus` (`jmhvabcwzrnzscbtqblk`, Frankfurt), in the Supabase organization of this
  repository's owner.
- **Address the app uses:** `https://jmhvabcwzrnzscbtqblk.supabase.co/functions/v1/olympus`
  (built into the APK by `.github/workflows/android-apk.yml`; the repository variable
  `OLYMPUS_SERVER` overrides it).
- **Code:** `functions/olympus/core.js` answers the routes the app uses: name-and-password
  accounts, sync of the training document (`/api/data`, with the Node server's conflict rules),
  the social layer with photos, and deleting one's own account. `store.js` keeps the documents and
  photos in Postgres (`migrations/`), in the `olympus` schema that the Supabase REST API does not
  expose. `social.js`, `sync-stamps.js`, `password.js` and `hercules.js` are copies of the Node server's, made by
  `node scripts/supabase-bundle.mjs`.
- **Deploying:** the deployed `index.js` imports `core.js` from this repository through jsDelivr,
  pinned to one commit, which `DEPLOYED` names. To ship a change: commit and push it, deploy
  `index.js` (with the new commit in the import) and `store.js` to the function `olympus` with
  JWT verification off, then write the commit into `DEPLOYED` and push. That push runs
  `scripts/supabase-e2e.mjs` against the live function (`.github/workflows/supabase-e2e.yml`).
- **Tests:** `api/test/supabase-core.test.js` runs the same code against an in-memory store.

## The Claude connector

`functions/olympus-mcp` is a remote MCP server (Streamable HTTP) through which Claude, or any MCP
client, reads one profile's training: routines, the week plan, workouts set by set, body
weight, estimated 1RMs and muscle balance. Its read tools are the stdio server's
(`mcp/src/tools.js`), spoken over HTTP by `mcp/src/remote.js`, so its numbers are the app's.

It also writes, on that profile only, what the athlete does by hand in the app
(`mcp/src/write-tools.js`): log, correct and remove workouts and weigh-ins, create, change and
delete routines, plan weekdays and single dates. A change is saved like the app's own push: under
the document's lock, stamped with `stampChange` (the app's stamps) and `stampPut` (as a writer that
stamps), with a new revision and write id, so an open phone merges it within half a minute and
keeps its own changes too. Removals take `confirm: true` and are marked destructive. The stdio
server stays read-only.

- **Address:** the app's *Settings → Connect to Claude* asks `POST /api/connector` for one. It is
  `https://<ref>.functions.supabase.co/olympus-mcp/<token>` (or `OLYMPUS_CONNECTOR_URL`
  + `/<token>`); the account keeps the token's SHA-256 (for lookups) and a copy sealed with the
  server's key (so the app can show the same address again), when it was made and
  when it was last used (written at most once an hour). A new address replaces the old one at
  once; *Disconnect* and *Sign out everywhere* remove it.
- **Why the token is in the address:** Claude's custom connectors take an address and, without
  OAuth, nothing else; and a Supabase function on the default domain cannot serve the HTML
  sign-in page an OAuth flow needs. A client that can send headers may send
  `Authorization: Bearer <token>` to the bare address instead.
- **Why the functions host:** before adding a connector, Claude looks up
  `/.well-known/oauth-protected-resource/<connector path>` on the connector's host. On
  `<ref>.supabase.co` the gateway answers any such path containing `/functions/v1/` with 401
  "No API key", which Claude reads as "sign-in required" before failing to register with a
  sign-in service that does not exist. On `<ref>.functions.supabase.co` it is a plain 404, so
  Claude adds the connector with no sign-in. The old form still reaches the function.
- **In Claude:** claude.ai → Customize → Connectors → *+ Add* → *Add custom connector*, paste the
  address, *No sign in*. In Claude
  Code: `claude mcp add --transport http olympus <address>`.
- **Stateless:** every POST is answered with one JSON body; there is no session id and GET is
  405 (no server-to-client stream), which the specification allows.
- **Deploying:** with JWT verification off: `index.js` with the `connector.js` import pointed at
  `https://raw.githubusercontent.com/cocopops9/olympus/<commit>/supabase/functions/olympus/connector.js`
  (not jsDelivr: it answers 403 for this repository, which is over its 50 MB limit for GitHub
  packages, so the 33 files the tools import could not be fetched), `store.js` from `functions/olympus`
  beside it, and `deno.json`, the import map for the two npm packages the tools use (`zod`,
  `zod-to-json-schema`). The app's function must run a commit with `/api/connector` too.
- **Live:** version 1 deployed 2026-11-22 from main 8890c598 (`olympus` v54 serves `/api/connector`).
- **Tests:** `mcp/test/remote.test.js` (protocol parity with the MCP SDK's own listing, the
  address's life cycle, one profile per address).

**Not available here** (they need the Node server): passkeys and pairing codes, Web Push
notifications outside the app, the plan-writing AI Coach (Hercules, the chat coach, is here), exercise photo and video uploads, the admin dashboard.
The first profile created is the admin (it may delete anyone's posts).

**Free plan limits:** 500 MB of database (photos are stored in it, about 300 KB each), 5 GB of
traffic and 500,000 function calls a month. A free project is paused after about a week without
use; resume it from the Supabase dashboard (data is kept for 90 days). Back up with
*Database → Backups* or `select * from olympus.docs`.

## Hercules and Athena, the free coaches

Hercules answers through any OpenAI-compatible chat API with one key that only the server has;
nobody using the app sets anything up. Every profile gets 20 messages a day (UTC); a message the
model did not answer is not counted. Until a key is set the app shows no Hercules button.

Set these as the function's secrets (Supabase dashboard: Edge Functions, Secrets; or
`supabase secrets set NAME=value`):

| Secret | Default | |
|---|---|---|
| `HERCULES_API_KEY` | (none) | The provider key. Required. |
| `HERCULES_BASE_URL` | `https://api.groq.com/openai/v1` | The provider's OpenAI-compatible address. |
| `HERCULES_MODEL` | `openai/gpt-oss-120b` | The main model. |
| `HERCULES_FALLBACK_MODEL` | `openai/gpt-oss-20b` | Answers when the main model is out of its quota; empty for none. |
| `HERCULES_PER_DAY` | `20` | Messages per profile per day. |

The default is Groq's free tier: no card, about 1,000 answers a day on the main model and 14,400
on the fallback, for everyone together; Groq does not train on what is sent by default. Google
Gemini works too (`HERCULES_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai`,
a Gemini model name), but its free tier is much smaller and Google uses free-tier messages to
improve its products.

Athena is the second coach: another model, her own style and her own 20 messages a day, on the
same key. She is on whenever Hercules is, and these secrets are optional:

| Secret | Default | |
|---|---|---|
| `ATHENA_MODEL` | `qwen/qwen3.8-27b` | Her main model (another family than Hercules's). |
| `ATHENA_FALLBACK_MODEL` | `openai/gpt-oss-20b` | Answers when her main model is out of its quota; empty for none. |
| `ATHENA_PER_DAY` | `20` | Messages per profile per day. |
| `ATHENA_API_KEY` | (Hercules's key) | A key of her own, for another provider; with it `ATHENA_BASE_URL` defaults to Groq's address. |
| `ATHENA_BASE_URL` | (Hercules's) | Her provider's OpenAI-compatible address. |

If the deploy fails with jsDelivr answering 403 for one of the files, it is passing: GitHub is
limiting jsDelivr for a moment. Deploy again a few minutes later.

## Strava

*Settings → Strava* posts every finished workout to the athlete's Strava feed
(`functions/olympus/strava.js`, routes `/api/strava*` in `core.js`; the app side is
`frontend/src/lib/strava.js` and `strava-post.js`).

- **Setup, once:** create an API application at <https://www.strava.com/settings/api>.
  *Authorization Callback Domain:* `jmhvabcwzrnzscbtqblk.supabase.co`. Then set the function
  secrets `STRAVA_CLIENT_ID` and `STRAVA_CLIENT_SECRET` on `olympus`. Without them the app says
  Strava is not set up on this server.
- **Callback:** `https://<ref>.supabase.co/functions/v1/olympus/api/strava/callback`
  (`STRAVA_REDIRECT_URI` overrides it). It answers in plain text: a function on the default
  domain may not serve HTML.
- **Limits:** a new Strava application accepts only its owner's account until Strava reviews it
  (Strava "athlete capacity"); ask for the review in the application's settings to open it to
  everyone. Rate limits are Strava's defaults per application.
