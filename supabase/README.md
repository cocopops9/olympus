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

**Not available here** (they need the Node server): passkeys and pairing codes, Web Push
notifications outside the app, the plan-writing AI Coach (Hercules, the chat coach, is here), exercise photo and video uploads, the admin dashboard.
The first profile created is the admin (it may delete anyone's posts).

**Free plan limits:** 500 MB of database (photos are stored in it, about 300 KB each), 5 GB of
traffic and 500,000 function calls a month. A free project is paused after about a week without
use; resume it from the Supabase dashboard (data is kept for 90 days). Back up with
*Database → Backups* or `select * from olympus.docs`.

## Hercules, the free coach

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

If the deploy fails with jsDelivr answering 403 for one of the files, it is passing: GitHub is
limiting jsDelivr for a moment. Deploy again a few minutes later.
