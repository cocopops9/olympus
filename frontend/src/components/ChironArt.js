// Olympus: Chiron's portrait, in the gold medallion style of the other coaches. The wise old
// centaur: a long white beard, a laurel wreath, a cloak over one shoulder and the horse's back
// under him. Asleep his eyes are shut and the z's drift up; awake they are open. One markup
// for both the inline figure (components/Chiron.jsx, animated by chiron.css) and the image the
// chat lists use (CHIRON_URL).
const INK = '#1a1200'
const GOLD = '#d9a21b'
const LIGHT = '#f7d466'
const SKIN = '#fcf3e3'
const BEARD = '#efe9dc'

export function chironMarkup({ awake = false } = {}) {
  const eyes = awake
    ? `<g class="ch-eyes"><ellipse cx="44" cy="45" rx="2.4" ry="2.1" fill="${INK}"/><ellipse cx="56" cy="45" rx="2.4" ry="2.1" fill="${INK}"/><circle cx="44.8" cy="44.3" r=".7" fill="#fff"/><circle cx="56.8" cy="44.3" r=".7" fill="#fff"/></g>`
    : `<g class="ch-eyes" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"><path d="M41 45.5q3 2 6 0"/><path d="M53 45.5q3 2 6 0"/></g>`
  const zs = awake ? '' : `<g class="ch-z" fill="${GOLD}" stroke="${INK}" stroke-width=".6" font-family="Georgia,serif" font-weight="700"><text class="z1" x="66" y="30" font-size="9">z</text><text class="z2" x="72" y="22" font-size="11">z</text><text class="z3" x="79" y="13" font-size="13">Z</text></g>`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" class="ch-svg${awake ? ' awake' : ''}">`
    + `<defs><radialGradient id="ch-bg" cx=".5" cy=".38" r=".7"><stop offset="0" stop-color="#fffaf0"/><stop offset="1" stop-color="#efe3c8"/></radialGradient><clipPath id="ch-clip"><circle cx="50" cy="50" r="49"/></clipPath></defs>`
    + `<circle cx="50" cy="50" r="50" fill="url(#ch-bg)"/>`
    + `<g clip-path="url(#ch-clip)"><g class="ch-body" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round">`
    // the horse's back and tail
    + `<path d="M6 100c2-14 14-20 30-20h28c16 0 28 6 30 20Z" fill="${GOLD}"/>`
    + `<path d="M10 84c-6-2-8-10-4-16 1 6 4 9 9 10" fill="${LIGHT}"/>`
    // the human torso and the cloak
    + `<path d="M30 84c2-10 9-16 20-16s18 6 20 16Z" fill="${SKIN}"/>`
    + `<path d="M30 84c2-9 7-14 13-16l9 16Z" fill="${GOLD}"/>`
    + `<g class="ch-head" transform="translate(50 50) scale(1.3) translate(-50 -48)">`
    + `<path d="M36 44c0-10 6-17 14-17s14 7 14 17c0 3-1 5-2 7H38c-1-2-2-4-2-7Z" fill="${SKIN}"/>`
    // the beard
    + `<path d="M36.5 47c0 6 1 11 3 15l2.5-2 1.5 5 3-2.5 3.5 5.5 3.5-5.5 3 2.5 1.5-5 2.5 2c2-4 3-9 3-15-2 4-5 6-7.5 6.5-2-2.4-4-3-6.5-3s-4.5.6-6.5 3c-2.5-.5-5.5-2.5-7.5-6.5Z" fill="${BEARD}"/>`
    + `<path d="M44 60c1.5 2 3 3 6 3s4.5-1 6-3M47 66l3 3 3-3" fill="none" stroke-width=".9"/>`
    + `<path d="M50 53.6c-2.4-1.6-6-1.2-8 1.4 2.6.2 5.4-.2 8-1.4 2.6 1.2 5.4 1.6 8 1.4-2-2.6-5.6-3-8-1.4Z" fill="${BEARD}" stroke-width="1.2"/>`
    // hair, the wreath, brows and nose
    + `<path d="M36 42c-1-9 5-16 14-16s15 7 14 16c-3-5-8-7-14-7s-11 2-14 7Z" fill="${BEARD}"/>`
    + `<g fill="${GOLD}" stroke-width="1.2">${[[37, 37, -40], [41, 31.5, -25], [47, 28.5, -8], [53, 28.5, 8], [59, 31.5, 25], [63, 37, 40]].map(([x, y, a]) => `<ellipse cx="${x}" cy="${y}" rx="2.2" ry="4" transform="rotate(${a} ${x} ${y})"/>`).join('')}</g>`
    + `<path d="M40 41.5c2-1.6 5-1.6 7 0M53 41.5c2-1.6 5-1.6 7 0" fill="none" stroke-width="1.8"/>`
    + `<path d="M50 44v5.5l-1.6 1" fill="none" stroke-width="1.3"/>`
    + eyes
    + `</g></g></g>`
    + `<circle cx="50" cy="50" r="45" fill="none" stroke="${GOLD}" stroke-width="2.2" stroke-dasharray="3 2.2"/>`
    + zs
    + `</svg>`
}

export const CHIRON_URL = 'data:image/svg+xml;utf8,' + encodeURIComponent(chironMarkup({ awake: true }))
