// The sound of a notification (Settings → Notifications → Notification sound) as data: what
// lib/sound.js notifySound() plays in the app, and what the Android notification channels play
// from res/raw (android/app/src/main/res/raw/olympus_<id>.wav, rendered from this same table by
// scripts/render-notify-sounds.mjs). Kept apart from lib/sound.js, like lib/rest-sounds.js, so the
// store, Settings and lib/mobile.js can read the choice without the audio code.
//
// Both Greek sounds are in A, which neither the end of a rest (E, rising: lyre E5 B5 E6) nor the
// medals (D) nor a record (a rising Dorian run in D into a trumpet) use, and both fall where the
// rest sound rises, so a notification is not mistaken for the end of a rest.
//  - kymbala: a pair of small bronze cymbals struck together, then a lyre calls a falling fourth,
//    A5 to E5. Cymbals and lyre are what Greek vase paintings show at a feast or a procession.
//  - tetrachord: the lyre plucks the Dorian tetrachord downwards, A G F E, the scale Greek music
//    theory was built from (it was always named from the top down), the last string left to ring.
//
// `cymbal`: [when, peak] for each strike. A strike is two cymbals a little apart in pitch, each a
// handful of inharmonic partials (CYMBAL_PARTIALS), so they beat against each other and shimmer.
// `lyre`: [freq, when, ringSeconds, peak] for each plucked string (sound.js pluck).
// `gain` drives the mix into a compressor and `makeup` sets the level after it (sound.js
// renderNotifySound): measured offline, peak 0.84-0.89 of full scale, RMS 0.10-0.11, 1.3 s audible.
export const CYMBAL_BASE = [2380, 2455]
// [ratio to the base, strength, seconds to die away]. The ratios are a struck plate's, not a
// string's: no two are in a whole-number ratio, which is what makes metal sound like metal.
export const CYMBAL_PARTIALS = [[1, 1, 0.9], [1.594, 0.7, 0.7], [2.136, 0.45, 0.55], [2.653, 0.3, 0.4]]
export const NOTIFY_SOUNDS = {
  kymbala: { cymbal: [[0, 0.08]], lyre: [[880, 0.14, 1.0, 0.5], [659.25, 0.38, 1.3, 0.5]], gain: 3.5, makeup: 1.15 },
  tetrachord: { lyre: [[880, 0, 0.8, 0.5], [783.99, 0.13, 0.8, 0.5], [698.46, 0.26, 0.8, 0.5], [659.25, 0.39, 1.3, 0.5]], gain: 3.5, makeup: 1.15 },
}
export const GREEK_NOTIFY_IDS = Object.keys(NOTIFY_SOUNDS)
// The phone's own notification sound, and none at all.
export const NOTIFY_SOUND_IDS = [...GREEK_NOTIFY_IDS, 'system', 'off']
export const DEFAULT_NOTIFY_SOUND = 'kymbala'

/** The notification sound a profile picked; one it never picked, or one this app does not know, is the default. */
export function notifySoundOf(S) {
  const k = S?.notifySound
  return NOTIFY_SOUND_IDS.includes(k) ? k : DEFAULT_NOTIFY_SOUND
}

/** When the last note of a Greek notification sound has died away, in seconds. */
export function notifySoundEnd(id) {
  const snd = NOTIFY_SOUNDS[id]
  if (!snd) return 0
  const ends = [
    ...(snd.cymbal || []).map(([w]) => w + Math.max(...CYMBAL_PARTIALS.map(p => p[2]))),
    ...(snd.lyre || []).map(([, w, d]) => w + d),
  ]
  return Math.max(0, ...ends)
}

// Android takes a notification's sound from its channel, and a channel's sound cannot be changed
// once the channel exists. So each choice has a channel of its own, and the reminders go out on
// the one the profile picked. The `-1` is the channel's version: a new rendering of a sound file
// needs a new channel id, or phones that already made the channel keep the old one.
export const NOTIFY_CHANNELS = {
  kymbala: { id: 'olympus-kymbala-1', sound: 'olympus_kymbala.wav', importance: 4 },
  tetrachord: { id: 'olympus-tetrachord-1', sound: 'olympus_tetrachord.wav', importance: 4 },
  system: { id: 'olympus-default-1', sound: null, importance: 4 },
  // Importance 2 (low) is how Android is told a channel makes no sound.
  off: { id: 'olympus-silent-1', sound: null, importance: 2 },
}
export const notifyChannelOf = S => NOTIFY_CHANNELS[notifySoundOf(S)]

// The kinds of social news (api/social.js notify): each can be switched off in Settings →
// Notifications. One that is off is not listed, not counted on the badge, and not pushed.
export const NEWS_KINDS = ['like', 'comment', 'follow', 'request', 'accepted']
/** Whether this kind of news is on for the profile: everything is, until switched off. */
export const newsOn = (S, kind) => !(Array.isArray(S?.newsOff) && S.newsOff.includes(kind))
/** The notifications this profile wants to see, and how many of them are unread. */
export function visibleNews(S, items) {
  const list = (items || []).filter(n => newsOn(S, n.kind))
  return { items: list, unread: list.filter(n => !n.read).length }
}
/** Turns one kind of news on or off in a profile being updated (S.newsOff lists the kinds that are off). */
export function setNewsKind(s, kind, on) {
  const off = new Set(Array.isArray(s.newsOff) ? s.newsOff : [])
  if (on) off.delete(kind); else off.add(kind)
  s.newsOff = NEWS_KINDS.filter(k => off.has(k))
}
