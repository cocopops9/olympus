// Olympus: settings whose default changed after profiles already had the old one saved. Each is
// moved once per profile, with a flag of its own, so a choice made afterwards is kept.
//   gold accent   instead of the old default green (lib/accent.js moveToGold)
//   weigh-in      the question before every workout is off: body weight is recorded on its own
//                 page (Profile, Body & wellbeing), never asked for up front
import { moveToGold } from './accent.js'

export function needsDefaults(S) {
  return !!S && (!S.accentGold || !S.weighInQuiet)
}

/** In place on the training document `s`. */
export function applyOlympusDefaults(s) {
  if (!s.accentGold) moveToGold(s)
  if (!s.weighInQuiet) { s.weighIn = false; s.weighInQuiet = true }
  return s
}
