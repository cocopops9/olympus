// The workout calendar's month themes, after the Attic (Athenian) calendar.
//
// The Attic year had twelve lunar months, each named after a festival or a god honoured in it.
// The year began with Hekatombaion, at the first new moon after the summer solstice, so every
// Attic month starts somewhere in one modern month and ends in the next (Hekatombaion runs
// roughly from mid July to mid August). A modern month takes the theme of the Attic month that
// STARTS in it: Hekatombaion themes July, Pyanepsion (October into November) themes October, and
// so on round the year. The lunar months drift against ours by up to a few weeks from year to
// year, so the pairing is a fixed approximation, not a date conversion.
//
// Sources for the festivals: J. D. Mikalson, "The Sacred and Civil Calendar of the Athenian Year"
// (Princeton, 1975); the Panathenaia, Eleusinian Mysteries, Pyanepsia, Anthesteria and
// Thargelia are the textbook festivals of their months.
//
// `art` names the emblem drawn by components/GreekMonth.jsx; `tint` is the banner's colour, mixed
// with the theme's surface there so the banner reads in both light and dark mode. `theme` is an
// English UI string, translated through t() like any other.

export const ATTIC_MONTHS = [
  { name: 'Hekatombaion', greek: 'Ἑκατομβαιών', month: 6, art: 'amphora', tint: '#c9772e', theme: 'Panathenaia, feast of Athena' },
  { name: 'Metageitnion', greek: 'Μεταγειτνιών', month: 7, art: 'lyre', tint: '#d4a017', theme: 'Apollo, guardian of neighbours' },
  { name: 'Boedromion', greek: 'Βοηδρομιών', month: 8, art: 'wheat', tint: '#b8903a', theme: 'Eleusinian Mysteries of Demeter' },
  { name: 'Pyanepsion', greek: 'Πυανεψιών', month: 9, art: 'grapes', tint: '#7d3c6b', theme: 'Bean feast and grape harvest' },
  { name: 'Maimakterion', greek: 'Μαιμακτηριών', month: 10, art: 'thunderbolt', tint: '#4d5a73', theme: 'Zeus of the storms' },
  { name: 'Poseideon', greek: 'Ποσειδεών', month: 11, art: 'trident', tint: '#1f6f8b', theme: 'Poseidon, lord of the sea' },
  { name: 'Gamelion', greek: 'Γαμηλιών', month: 0, art: 'pomegranate', tint: '#a3324a', theme: 'Sacred marriage of Zeus and Hera' },
  { name: 'Anthesterion', greek: 'Ἀνθεστηριών', month: 1, art: 'flower', tint: '#b5577d', theme: 'Anthesteria, festival of flowers' },
  { name: 'Elaphebolion', greek: 'Ἐλαφηβολιών', month: 2, art: 'bow', tint: '#4f7a3a', theme: 'Artemis the deer-hunter' },
  { name: 'Mounichion', greek: 'Μουνιχιών', month: 3, art: 'moon', tint: '#5a5f9e', theme: 'Artemis of the moon' },
  { name: 'Thargelion', greek: 'Θαργηλιών', month: 4, art: 'sun', tint: '#d88a1c', theme: 'Thargelia, first fruits for Apollo' },
  { name: 'Skirophorion', greek: 'Σκιροφοριών', month: 5, art: 'owl', tint: '#7a6a4f', theme: 'Skira, procession for Athena' },
]

const BY_MODERN_MONTH = Object.fromEntries(ATTIC_MONTHS.map(m => [m.month, m]))

/** The Attic month whose theme a modern month (0 = January … 11 = December) takes. */
export function atticMonthFor(month) {
  const m = ((Math.trunc(month) % 12) + 12) % 12
  return BY_MODERN_MONTH[m]
}
