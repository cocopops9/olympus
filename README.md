# Olympus

**A gym tracker and a social network for the people you train with.**

Olympus is a fork of [openGym](https://github.com/DuarteSantos8/openGym) by Duarte Santos
(AGPL-3.0). It keeps everything openGym does for your own training (guided workouts, rest timer,
progression rules, 1RM, muscle maps, body weight and measurements, imports from Hevy, Strong and
FitNotes) and adds a social layer like Hevy's: profiles, following, a feed of workouts, likes and
comments.

> **Modified version notice (AGPL-3.0 §5a).** This is a modified version of openGym v1.4.1,
> changed in October 2026: renamed to Olympus, navigation reduced to three tabs, and a social
> layer added (server routes in `api/social.js`, screens in `frontend/src/views/Feed.jsx`,
> `Profile.jsx`, `UserProfile.jsx`). The original project's history is kept in this repository;
> its README is in [docs/OPENGYM_README.md](docs/OPENGYM_README.md).

## The app: three tabs

| Tab | What it does |
| --- | --- |
| **Home** | The feed. *Following* shows your posts and those of the people you follow; *Discover* shows every post on your server. The magnifier searches people by name (empty search lists everyone, most followed first) with a Follow button on each. **+** writes a post, optionally with one of your recent workouts attached. A "Today's training" link opens the old training dashboard. |
| **Workout** | The start button, unchanged from openGym: starts today's planned routine, or opens the picker on a day with none, and turns into *Resume* (with the running time) while a session is open. |
| **Profile** | You: avatar, bio, followers, following, posts. Then four tabs: **Calendar** (month grid of trained and planned days, latest workouts, full history), **Stats** (the full Stats screen), **Body** (body weight with goal and curve, body measurements, progress photos), **Posts**. Below them: Today's training, Plan, Exercises and Settings. |

After you finish a workout, the summary screen has a **Share to feed** button, and every saved
workout's detail sheet has **Post to feed**. A post carries a bounded summary only (name, date,
duration, volume, work sets, PRs, and per exercise the number of sets and the best one), never
your whole training document.

A post can also carry up to **four photos**. The app scales each one to at most 1600 px and
re-encodes it as JPEG before it leaves the phone, which drops the EXIF block (GPS position,
camera, time); the server strips any metadata segments that are left and keeps only JPEG and PNG.

Another person's page (`/u/<id>`) shows their bio, counts, posts and a Follow button. You can
delete your own posts, any comment under your posts, and your own comments; an admin of the
server can delete any post.

**Private profiles.** *Profile → Edit profile → Private profile* hides your posts, followers and
following from everyone who does not follow you. A Follow on a private profile becomes a request,
which you accept or decline under the bell on Home. Switching back to public accepts every
request still waiting.

**Blocking.** The ⋯ menu on someone's page blocks them: the follows between you both are removed,
neither sees the other's posts, comments or profile, and neither can follow the other until you
unblock (*Edit profile → Blocked people*, or the same menu).

**Notifications.** Likes, comments, new followers, follow requests and accepted requests appear
under the bell on Home, with a count on the Home tab; the app asks the server once a minute
while it is open. Where Web Push works (a browser or an installed web app with notifications
switched on in *Settings*) they also arrive as system notifications; *Edit profile* has a
switch to turn those off. The Android app built from this folder runs in a WebView without Web
Push, so there it is the in-app bell only.

## How the social part works, and what it needs

A social network needs a shared server: two phones cannot see each other's posts without one.
So the feed, search, follows, likes and comments live on an **Olympus server** (the `api/`
container), stored in `DATA_DIR/social.json` beside the existing `db.json`.

- **Signed in to a server** (in a browser, or a phone paired with *Settings → Account → Connect to
  my server*): everything works.
- **Phone kept local / guest mode**: training, stats and body tracking work exactly as before. Home
  explains that the feed needs a server and offers to connect one. Nothing is sent anywhere.

One server is one community: every signed-in profile on it can find every other enabled profile,
read their public posts, and follow them, except where a profile is private or a block applies.

Limits enforced by the server (`api/social.js`, `LIMITS`): post text 1000 characters, comments
500, bio 160, 30 posts and 120 comments per profile per hour, 200 comments per post, 20 exercises
per attached workout, 20,000 posts per server (the oldest go first); 4 photos per post, 2 MB
per photo, 60 photo uploads per hour and 500 photos per profile, with photos never attached to a
post deleted after 24 hours; the newest 200 notifications per profile. Photos are stored in
`DATA_DIR/social-photos/` and served only to people allowed to see the post.

## Run it

### 1. The server (needed for the social features)

**What the APK uses:** a free Supabase project. The server's job runs there as one Edge Function
with the data in Postgres; nothing to keep running. See [supabase/README.md](supabase/README.md)
for what it covers and its limits (no passkeys, push or Coach; the free project pauses after a
week without use).

**Your own server instead**, with every feature: [deploy/oracle/README.md](deploy/oracle/README.md) puts it on an Oracle
Cloud *Always Free* VM. You create the account and the VM and paste one script; the VM installs
everything, gets HTTPS on a free `sslip.io` address and updates itself from GitHub every night.
With that address set as the repository variable `OLYMPUS_SERVER`, the APK joins the server by
itself (Home: *Create profile* / *Sign in*), with no pairing code.

**On your own machine** instead:

You need [Docker](https://docs.docker.com/get-docker/) with Compose.

```
cd C:\olympus            (or wherever this folder is)
copy .env.example .env   (cp on macOS/Linux)
docker compose up -d --build
```

Open <http://localhost:8080> and create a profile. `docker-compose.yml` builds from this folder
on purpose (`pull_policy: build`): the prebuilt openGym images on ghcr.io do not have the social
routes. For friends to join from their phones you need HTTPS on a domain, which is a two-line
change in `.env`; [docs/SELF_HOSTING.md](docs/SELF_HOSTING.md) walks through Cloudflare Tunnel,
Caddy, Traefik and nginx. Back up the `data/` folder: it holds every account, workout and post.

### 2. The Android app

**Import from Hevy.** In Hevy: *Profile → Settings → Export & Import Data → Export Workouts*
(and *Export Measurements*). In Olympus: *Settings → Data & backup → Import from another app*,
then pick the file: the CSV, or the same data as an Excel workbook (`.xlsx`). Workouts land in the calendar with their times, names, notes, warm-up, failure
and drop sets, supersets and RPE; exercise names are matched to the catalogue, and the ones it has
no entry for become your own exercises. An export made with Hevy set to Spanish is matched by Hevy's English
names too (`frontend/src/lib/hevy-locale.js`). The measurements file brings weigh-ins and circumferences.
Importing the same file again adds nothing twice.

**Download link.** Pushed to a public GitHub repository, this folder builds its own APK: the
workflow `.github/workflows/android-apk.yml` runs on GitHub's servers after every push to `main`
(about 10 minutes) and publishes the file as the release *android*, so this link always gives the
newest build:

```
https://github.com/<github-user>/<repo>/releases/latest/download/olympus.apk
```

Opened on the phone, it downloads `olympus.apk`; opening the file installs it (Android asks once
to allow installs from the browser). A newer build installs over the old one from the same link,
keeping your data.

The APK is signed with `frontend/android/olympus-release.keystore`, which is public with the code.
That is enough for a personal app, but anyone who has the repository could sign an APK your phone
would accept as an update. To use a private key instead, create one with `keytool`, and set the
repository secrets `OLYMPUS_KEYSTORE_B64` (the keystore, base64), `OLYMPUS_KEYSTORE_PASSWORD`,
`OLYMPUS_KEY_ALIAS` and `OLYMPUS_KEY_PASSWORD`; the workflow then uses those. Changing the key
means uninstalling the old app once (export a backup first).

**Building it yourself** instead:

Requirements: Node.js 22, JDK 17 or 21, and the Android SDK (installing
[Android Studio](https://developer.android.com/studio) gives you the SDK).

```
cd C:\olympus\frontend
npm ci
npm run build:mobile
npx cap open android
```

In Android Studio: **Build → Build App Bundle(s) / APK(s) → Build APK(s)**, then install the APK
from `frontend/android/app/build/outputs/apk/` on your phone (or press Run with the phone
connected by USB). The app id is `app.olympus.gym`, so it installs beside openGym rather than over
it. In the app, choose **Connect to my server** and pair it with the code from *Settings → Account
→ Pair the mobile app* on your server's web page. Details: [docs/MOBILE.md](docs/MOBILE.md).

`build:mobile` points exercise media at the openGym CDN dataset; see the media licence below.

### 3. Development

```
cd api && npm ci && npm start               # API on :3000 (set DATA_DIR, ORIGIN, RP_ID; see .env.example)
cd frontend && npm ci && npm run dev        # app with hot reload, proxies /api to :3000
cd api && npm test                          # API tests, social layer in test/social.test.js
cd frontend && npm test                     # frontend tests
```

## Your settings in the code

`frontend/src/lib/app-info.js` holds the three values that are yours to set:

- `UPDATE_REPO`: the `<github-user>/<repo>` whose releases the Android app checks for updates.
  Empty (as shipped) switches the in-app updater off, so the app never offers an upstream openGym
  APK, which would be a different app.
- `SOURCE_URL`: where the source of your version can be read (see the licence section).
- `UPSTREAM_URL`: openGym, credited in *Settings → About*.

## What was kept for compatibility

The user-visible name is Olympus everywhere (app name, screens, notifications, export file names
such as `olympus-backup-<date>.json`). A few internal identifiers still say `opengym` on purpose:
storage and cache names, the native-keyboard event, the `opengym_plan` marker in plan files, the
`opengym-backup.json` entry inside backup ZIPs, Health Connect record ids, and the exercise
catalogue ids. Changing them would buy nothing visible and would break imports of openGym backups
and plan files, which Olympus still reads.

## Licence: what this fork obliges you to do

- **Code: AGPL-3.0** ([LICENSE](LICENSE)). You may use, modify and share it. If you let other
  people use a modified version **over a network** (a server your friends sign in to), you must
  offer them the source of that exact version: publish your fork and set `SOURCE_URL`. Keep the
  licence, the notices, and the credit to openGym.
- **Exercise media is not under the AGPL.** The stills and animations are © Aliaksandr
  Makatserchyk, [Gym visual](https://gymvisual.com/), licensed for use in openGym only. According
  to openGym's NOTICE, a **non-commercial** fork may keep them unmodified with the notice;
  anything else (for example publishing Olympus commercially or on an app store) needs your own
  licence from gymvisual.com. See [NOTICE.md](NOTICE.md).
- The names "Olympus" and "openGym" are not registered by this repository; check trademarks
  before publishing under the name Olympus.

## Limits of this version

- No reporting or moderation queue: an admin can delete posts, and people can block each other,
  but there is nothing to flag content to the admin. Fine for a server shared by friends, not for
  an open public instance.
- No system push notifications in the Android app (see *Notifications* above); the in-app bell
  and badge work everywhere.
- Photos only, no video, and no editing of a post once published.
- The website in `website/` and most guides in `docs/` still describe openGym.
