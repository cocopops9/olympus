// Olympus: the portraits of gods and heroes to pick as a profile picture (components/Social.jsx
// avatarSheet) or for a coach of your own (components/OwnCoach.jsx), drawn in the style of the
// coaches' portraits (made with Canva, src/assets/gods/). A profile with no picture of its own
// is given one of them (godFor).
//
// The first set were gold emblems drawn here as SVG. Hephaestus and Demeter have no portrait yet:
// their emblems stay, not offered any more, so a picture picked before still shows.
import apollo from '../assets/gods/apollo.webp'
import achilles from '../assets/gods/achilles.webp'
import artemis from '../assets/gods/artemis.webp'
import hermes from '../assets/gods/hermes.webp'
import poseidon from '../assets/gods/poseidon.webp'
import ares from '../assets/gods/ares.webp'
import perseus from '../assets/gods/perseus.webp'
import nike from '../assets/gods/nike.webp'
const INK = '#1a1200'
const GOLD = '#d9a21b'
const LIGHT = '#f7d466'

const wrap = body => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><radialGradient id="g" cx=".5" cy=".38" r=".7"><stop offset="0" stop-color="#fffaf0"/><stop offset="1" stop-color="#efe3c8"/></radialGradient></defs><circle cx="50" cy="50" r="50" fill="url(#g)"/><circle cx="50" cy="50" r="45" fill="none" stroke="${GOLD}" stroke-width="2.2" stroke-dasharray="3 2.2"/>${body}</svg>`

const SVGS = {
  // Hephaestus: the hammer on the anvil.
  hephaestus: `<g stroke="${INK}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"><path d="M26 58h48c0 6-6 8-12 8l4 10H34l4-10c-6 0-12-2-12-8Z" fill="${GOLD}"/><path d="m58 18 14 14-6 6-14-14Z" fill="${LIGHT}"/><path d="M58 32 36 54" fill="none" stroke-width="4"/><path d="M28 44l-4-4m10-2-2-5m-8 15-5-1" fill="none" stroke="#e86a1c"/></g>`,
  // Demeter: the sheaf of wheat.
  demeter: `<g stroke="${INK}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"><path d="M50 82V30M50 82 38 40M50 82l12-42" fill="none"/>${[0, 1, 2, 3].map(i => `<ellipse cx="${50 - 5}" cy="${28 + i * 9}" rx="4" ry="7" transform="rotate(-25 ${45} ${28 + i * 9})" fill="${GOLD}"/><ellipse cx="${50 + 5}" cy="${28 + i * 9}" rx="4" ry="7" transform="rotate(25 ${55} ${28 + i * 9})" fill="${GOLD}"/>`).join('')}<ellipse cx="50" cy="20" rx="4" ry="7" fill="${LIGHT}"/><path d="M40 66h20" fill="none" stroke="${GOLD}" stroke-width="4"/></g>`,
}

const toUrl = svg => 'data:image/svg+xml;utf8,' + encodeURIComponent(svg)

/** [{ id, name, url }], in the order they are offered. */
export const GOD_AVATARS = [
  ['apollo', 'Apollo', apollo], ['achilles', 'Achilles', achilles], ['artemis', 'Artemis', artemis], ['hermes', 'Hermes', hermes],
  ['poseidon', 'Poseidon', poseidon], ['ares', 'Ares', ares], ['perseus', 'Perseus', perseus], ['nike', 'Nike', nike],
].map(([id, name, url]) => ({ id, name, url }))
// Picked before the portraits came, and still shown.
const RETIRED = Object.fromEntries(['hephaestus', 'demeter'].map(id => [id, toUrl(wrap(SVGS[id]))]))

/** The image of an avatar value: 'god:<id>' or a data URL of the person's own picture, or null. */
export function avatarUrl(value) {
  if (!value) return null
  if (String(value).startsWith('god:')) return GOD_AVATARS.find(g => g.id === value.slice(4))?.url || RETIRED[value.slice(4)] || null
  return String(value).startsWith('data:image/') ? value : null
}

/**
 * The portrait of a profile that has not picked a picture: one of the gods, chosen from its id
 * so it is the same one on every screen and every device (a simple string hash; it only has to
 * spread profiles evenly over the eight).
 */
export function godFor(seed) {
  const s = String(seed ?? '')
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return GOD_AVATARS[(h >>> 0) % GOD_AVATARS.length]
}
