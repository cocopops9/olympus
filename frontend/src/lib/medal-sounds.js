// The sound of a medal, one for each tier, as data: what lib/sound.js medalSound() plays through
// Web Audio when the celebration of that tier (components/Medals.jsx CELEBRATION) starts. Kept
// apart from lib/sound.js so a test can read them without any audio.
//
// All in the manner of ancient Greece, and each one fuller than the tier below, so the sound grows
// as the medal matters more:
//   bronze     a lyre: three strings up the triad, then two struck together and left to ring
//   silver     the lyre runs up an arpeggio and answers it with a ringing chord, over a note an
//              aulos (the double-reed pipe) holds
//   gold       a drum, a lyre arpeggio and the salpinx (the bronze war trumpet) calling three notes,
//              the last over a ringing lyre chord
//   diamond    two drum hits, a lyre run over two octaves, the salpinx in fifths, a held chord
//              of trumpets and strings
//   olympian   a drum roll, a lyre sweep down the whole mode, an aulos trill, the salpinx in
//              fifths and octaves, and a chord of four held for two seconds, with a drum under it
// The notes are D, F, A (a D minor triad) and the modes of the old music: the tune is a stylised
// reading of it, not a reconstruction (nothing of its sound survives). None of it is the record's
// sound (lib/sound.js TRIUMPH: a lyre run D E F G A into a trumpet on A and D), which rises
// stepwise and then calls twice; these are arpeggios and chords, and the one sweep falls.
//
// Each layer is a list of notes:
//   lyre   [freq, when, dur?, peak?]   a plucked string (Karplus-Strong)
//   aulos  [freq, dur, when, peak?]    a reedy, odd-harmonic tone (lib/sound.js TIMBRES.aulos)
//   horn   [freq, when, dur, peak?]    the salpinx: two detuned saws through a low-pass filter
//   drum   [freq, when]                a struck skin: a sine that drops a little, with its octave
// `gain` is the level the layers are mixed to before a limiter (lib/sound.js medalSound). Set from
// the sound rendered offline (the app's own sound.js through Chromium's OfflineAudioContext), so that
//   - no tier clips (the highest peak, the olympian's, is 0.98 of full scale; the others 0.84-0.95),
//   - the loudness (RMS over the audible length) rises with every tier: 0.084, 0.125, 0.154,
//     0.165, 0.172 against the record's 0.100, and
//   - each tier lasts longer than the one below (audible: within 40 dB of its loudest 20 ms):
//     1.8, 2.3, 2.5, 3.1, 4.1 seconds. Bronze and silver were 0.7 and 1.3 s, and were found too
//     short (2026-11-21): bronze now strikes its three strings and then a second, ringing pair;
//     silver's arpeggio is answered by a ringing chord over a longer aulos note.
// What a tier sounds like is not measured: the notes are the author's choice (above).
const D = { d3: 146.83, a3: 220, d4: 293.66, f4: 349.23, a4: 440, d5: 587.33, f5: 698.46, a5: 880, d6: 1174.66 }

// The Dorian scale on D from D5 down to D3, for the olympian's falling sweep. It falls where the
// record's lyre run rises, so the two are not the same gesture.
const SWEEP = [587.33, 523.25, 493.88, 440, 392, 349.23, 329.63, 293.66, 261.63, 246.94, 220, 196, 174.61, 164.81, 146.83]

export const MEDAL_TIERS = ['bronze', 'silver', 'gold', 'diamond', 'olympian']

export const MEDAL_SOUNDS = {
  bronze: {
    gain: 1.4,
    lyre: [[D.d4, 0, 1.5], [D.a4, 0.2, 1.5], [D.d5, 0.4, 1.5], [D.a4, 0.85, 1.9], [D.d5, 0.87, 1.9]],
  },
  silver: {
    gain: 1.25,
    lyre: [
      [D.d4, 0, 1.3], [D.f4, 0.12, 1.3], [D.a4, 0.24, 1.3], [D.d5, 0.36, 1.5],
      [D.a4, 1.05, 2.0], [D.d5, 1.07, 2.0], [D.f5, 1.09, 2.0],
    ],
    aulos: [[D.a4, 1.9, 0.5, 0.1]],
  },
  gold: {
    gain: 1.05,
    drum: [[D.d3, 0]],
    lyre: [
      [D.d4, 0.1, 1.1], [D.f4, 0.2, 1.1], [D.a4, 0.3, 1.1], [D.d5, 0.4, 1.1], [D.f5, 0.5, 1.1],
      [D.d4, 1.1, 2.4], [D.a4, 1.12, 2.4], [D.d5, 1.14, 2.4],
    ],
    horn: [[D.d5, 0.6, 0.2], [D.d5, 0.85, 0.2], [D.a5, 1.1, 1.6]],
  },
  diamond: {
    gain: 0.82,
    drum: [[D.d3, 0], [D.d3, 0.5]],
    lyre: [
      ...[D.d3, D.a3, D.d4, D.f4, D.a4, D.d5, D.f5, D.a5].map((f, i) => [f, 0.05 + i * 0.1, 1.2]),
      [D.d4, 1.6, 2.0], [D.a4, 1.62, 2.0], [D.d5, 1.64, 2.0], [D.f5, 1.66, 2.0],
    ],
    horn: [
      [D.d5, 0.9, 0.25], [D.a5, 0.9, 0.25],
      [D.d5, 1.25, 0.25], [D.a5, 1.25, 0.25],
      [D.d5, 1.6, 1.8], [D.a5, 1.6, 1.8], [D.d6, 1.6, 1.8],
    ],
  },
  olympian: {
    gain: 0.72,
    drum: [[D.d3, 0], [D.d3, 0.16], [D.a3, 0.32], [D.d3, 0.5], [D.d3, 2.4], [D.a3, 2.4]],
    lyre: [...SWEEP.map((f, i) => [f, 0.05 + i * 0.07, 1.3]), [D.d4, 2.4, 1.6], [D.a4, 2.4, 1.6], [D.d5, 2.4, 1.6]],
    aulos: [[D.d6, 0.12, 1.1], [1318.5, 0.12, 1.22], [D.d6, 0.12, 1.34], [1318.5, 0.12, 1.46]],
    horn: [
      [D.d5, 1.2, 0.22], [D.d5, 1.5, 0.22], [D.a5, 1.8, 0.5],
      [D.d4, 2.4, 1.9], [D.a4, 2.4, 1.9], [D.d5, 2.4, 1.9], [D.a5, 2.4, 1.9],
    ],
  },
}

/** When the last note of a medal's sound is over, in seconds. */
export function medalSoundEnd(snd) {
  const ends = [
    ...(snd.lyre || []).map(([, w, d = 1.1]) => w + d),
    ...(snd.aulos || []).map(([, d, w]) => w + d),
    ...(snd.horn || []).map(([, w, d]) => w + d),
    ...(snd.drum || []).map(([, w]) => w + DRUM_RING),
  ]
  return Math.max(0, ...ends)
}
export const DRUM_RING = 0.55
