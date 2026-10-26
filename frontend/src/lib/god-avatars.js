// Olympus: portraits to pick for a coach of your own (components/OwnCoach.jsx): the emblems of
// eight gods of Olympus (Zeus left out on purpose), drawn as gold medallions in the style of
// Hercules's and Athena's portraits. Each is an SVG data URL, so it works as an <img> anywhere.
const INK = '#1a1200'
const GOLD = '#d9a21b'
const LIGHT = '#f7d466'

const wrap = body => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><radialGradient id="g" cx=".5" cy=".38" r=".7"><stop offset="0" stop-color="#fffaf0"/><stop offset="1" stop-color="#efe3c8"/></radialGradient></defs><circle cx="50" cy="50" r="50" fill="url(#g)"/><circle cx="50" cy="50" r="45" fill="none" stroke="${GOLD}" stroke-width="2.2" stroke-dasharray="3 2.2"/>${body}</svg>`

const SVGS = {
  // Apollo: the sun and the lyre.
  apollo: `<g stroke="${INK}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round">${[...Array(12)].map((_, i) => { const a = i * Math.PI / 6, r1 = 33, r2 = 41; return `<line x1="${50 + r1 * Math.cos(a)}" y1="${50 + r1 * Math.sin(a)}" x2="${50 + r2 * Math.cos(a)}" y2="${50 + r2 * Math.sin(a)}" stroke="${GOLD}" stroke-width="3.2"/>` }).join('')}<path d="M38 70c-8-8-10-22-6-34 2-6 6-8 8-6M62 70c8-8 10-22 6-34-2-6-6-8-8-6" fill="none" stroke-width="5" stroke="${INK}"/><path d="M38 70c-8-8-10-22-6-34 2-6 6-8 8-6M62 70c8-8 10-22 6-34-2-6-6-8-8-6" fill="none" stroke-width="2.6" stroke="${GOLD}"/><path d="M33 34h34" fill="none" stroke-width="3"/><path d="M36 70h28v5H36Z" fill="${GOLD}"/><path d="M43 34v36M50 34v36M57 34v36" fill="none" stroke-width="1.6"/></g>`,
  // Artemis: the crescent moon and an arrow.
  artemis: `<g stroke="${INK}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"><path d="M58 18a33 33 0 1 0 0 64a26 26 0 1 1 0-64Z" fill="${LIGHT}"/><path d="M30 72 74 28" fill="none" stroke-width="3"/><path d="m74 28-10 2 8 8Z" fill="${GOLD}"/><path d="m30 72 2-9m-2 9 9-2m-6-2 2-8m-2 8 8-2" fill="none"/></g>`,
  // Hermes: the winged helmet.
  hermes: `<g stroke="${INK}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"><path d="M34 60c0-14 7-22 16-22s16 8 16 22Z" fill="${GOLD}"/><path d="M28 60h44v6H28Z" fill="${LIGHT}"/><path d="M34 52c-6-1-12-5-16-12l6 1-4-6 7 2-3-6 8 4c2 5 3 10 2 17Z" fill="${LIGHT}"/><path d="M66 52c6-1 12-5 16-12l-6 1 4-6-7 2 3-6-8 4c-2 5-3 10-2 17Z" fill="${LIGHT}"/><path d="M42 46c2-3 5-4 9-4" fill="none" stroke="#fff3c4"/></g>`,
  // Ares: a crested helmet and a spear.
  ares: `<g stroke="${INK}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"><path d="M74 16 30 84" fill="none" stroke-width="3"/><path d="m74 16-2 10 8-6Z" fill="${GOLD}"/><path d="M34 40c4-14 26-14 30 0v16l-5 14H39l-5-14Z" fill="${GOLD}"/><path d="M43 50h12M49 50v14" fill="none"/><path d="M34 40c-2-10 6-20 15-22 9 2 17 12 15 22" fill="#b2261c"/></g>`,
  // Poseidon: the trident over the waves.
  poseidon: `<g stroke="${INK}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"><path d="M50 20v54" fill="none" stroke-width="3.2"/><path d="M36 26v14c0 6 6 9 14 9s14-3 14-9V26" fill="none" stroke-width="3"/><path d="m36 26-3 6h6Zm14-8-3 6h6Zm14 8-3 6h6Z" fill="${GOLD}"/><path d="M22 74c6-5 10-5 14 0s10 5 14 0 10-5 14 0 8 5 14 0" fill="none" stroke="#1f4f9c" stroke-width="3"/></g>`,
  // Hephaestus: the hammer on the anvil.
  hephaestus: `<g stroke="${INK}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"><path d="M26 58h48c0 6-6 8-12 8l4 10H34l4-10c-6 0-12-2-12-8Z" fill="${GOLD}"/><path d="m58 18 14 14-6 6-14-14Z" fill="${LIGHT}"/><path d="M58 32 36 54" fill="none" stroke-width="4"/><path d="M28 44l-4-4m10-2-2-5m-8 15-5-1" fill="none" stroke="#e86a1c"/></g>`,
  // Nike: the wings of victory and a laurel.
  nike: `<g stroke="${INK}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"><path d="M48 62C34 60 20 46 18 26c10 8 18 10 26 10-4 6-2 14 4 20Z" fill="${LIGHT}"/><path d="M52 62c14-2 28-16 30-36-10 8-18 10-26 10 4 6 2 14-4 20Z" fill="${LIGHT}"/><path d="M28 34c4 4 10 6 16 6M72 34c-4 4-10 6-16 6M24 44c6 4 14 6 22 6M76 44c-6 4-14 6-22 6" fill="none"/><path d="M36 78c4-6 8-8 14-8s10 2 14 8" fill="none" stroke="${GOLD}" stroke-width="3"/></g>`,
  // Demeter: the sheaf of wheat.
  demeter: `<g stroke="${INK}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"><path d="M50 82V30M50 82 38 40M50 82l12-42" fill="none"/>${[0, 1, 2, 3].map(i => `<ellipse cx="${50 - 5}" cy="${28 + i * 9}" rx="4" ry="7" transform="rotate(-25 ${45} ${28 + i * 9})" fill="${GOLD}"/><ellipse cx="${50 + 5}" cy="${28 + i * 9}" rx="4" ry="7" transform="rotate(25 ${55} ${28 + i * 9})" fill="${GOLD}"/>`).join('')}<ellipse cx="50" cy="20" rx="4" ry="7" fill="${LIGHT}"/><path d="M40 66h20" fill="none" stroke="${GOLD}" stroke-width="4"/></g>`,
}

const toUrl = svg => 'data:image/svg+xml;utf8,' + encodeURIComponent(svg)

/** [{ id, name, url }], in the order they are offered. */
export const GOD_AVATARS = [
  ['apollo', 'Apollo'], ['artemis', 'Artemis'], ['hermes', 'Hermes'], ['ares', 'Ares'],
  ['poseidon', 'Poseidon'], ['hephaestus', 'Hephaestus'], ['nike', 'Nike'], ['demeter', 'Demeter'],
].map(([id, name]) => ({ id, name, url: toUrl(wrap(SVGS[id])) }))

/** The image of an avatar value: 'god:<id>' or a data URL of the person's own picture, or null. */
export function avatarUrl(value) {
  if (!value) return null
  if (String(value).startsWith('god:')) return GOD_AVATARS.find(g => g.id === value.slice(4))?.url || null
  return String(value).startsWith('data:image/') ? value : null
}
