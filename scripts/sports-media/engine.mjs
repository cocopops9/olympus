// Olympus: the figure behind the sports animations (frontend/src/assets/sports/).
//
// The animations are our own drawing, made to sit beside the exercise clips: a light grey figure on a
// white square, the muscles the sport trains in red (the stronger the weight in lib/sports.js, the
// deeper the red), looping for three seconds. A pose is a handful of joint angles; a sport is a
// few key poses that the figure moves through and back to the first. Run by render.mjs.
//
// Angles are degrees, measured from the limb hanging straight down, positive toward the way the
// figure faces (always to the right). A knee or an elbow "flex" bends the lower part backward for
// the leg and forward for the arm.
export const SIZE = 180
export const GROUND = 152
// The whole figure is drawn at K of its natural size so a jump with the arms up still fits the square.
const K = 0.86
const LEN = Object.fromEntries(Object.entries({ thigh: 34, shin: 33, foot: 11, torso: 43, neck: 6, upper: 23, fore: 21, head: 10 }).map(([k, v]) => [k, v * K]))

export const DEFAULT = {
  hx: 88, jump: 0, hy: null, tor: 4, hd: 0,
  rt: 2, rk: 6, lt: -2, lk: 4,
  ru: 6, re: 16, lu: -6, le: 16,
  // props: a ball (in the right hand when bf is 0, at bx,by when 1, on an arc of height `arc` between), a racket, a second free object
  bx: 0, by: 0, bf: 0, arc: 0, bo: 0, bs: 1,
  ra: 0, ro: 0,
  sx: 0, sy: 0, so: 0, sa: 0,
  scroll: 0, flip: 0,
}

const rad = d => (d * Math.PI) / 180
const dir = a => [Math.sin(rad(a)), Math.cos(rad(a))]
const add = (p, v, k = 1) => [p[0] + v[0] * k, p[1] + v[1] * k]
const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]
const f2 = n => Math.round(n * 100) / 100
const P = p => f2(p[0]) + ' ' + f2(p[1])
const smooth = x => x * x * (3 - 2 * x)

/** The pose at time t (0 to 1, looping) from key poses [{ t, ...fields }, ...] (sorted, first at 0). */
export function poseAt(keys, t) {
  const ks = keys.map(k => ({ ...DEFAULT, ...k }))
  ks.push({ ...ks[0], t: 1 })
  t = ((t % 1) + 1) % 1
  let i = 0
  while (i < ks.length - 2 && t >= ks[i + 1].t) i++
  const a = ks[i], b = ks[i + 1]
  const k = b.t === a.t ? 1 : smooth(Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))))
  const out = {}
  for (const f of Object.keys(DEFAULT)) {
    if (f === 'hy') out.hy = a.hy == null || b.hy == null ? (a.hy ?? b.hy) : a.hy + (b.hy - a.hy) * k
    else out[f] = a[f] + (b[f] - a[f]) * k
  }
  out.t = t
  return out
}

/** Joint positions of a pose. The feet are put on the ground unless the pose gives `hy`. */
export function skeleton(p) {
  const leg = (hip, thigh, flex) => {
    const knee = add(hip, dir(thigh), LEN.thigh)
    const shinAng = thigh - flex
    const ankle = add(knee, dir(shinAng), LEN.shin)
    // The foot follows the shin a little: it points forward when standing, down when the shin kicks back.
    const th = rad(-shinAng * 0.35)
    const toe = [ankle[0] + Math.cos(th) * LEN.foot, ankle[1] + Math.sin(th) * LEN.foot]
    return { knee, ankle, toe }
  }
  let hip = [p.hx, 0]
  const r0 = leg(hip, p.rt, p.rk), l0 = leg(hip, p.lt, p.lk)
  const lowest = Math.max(r0.ankle[1] + 4, r0.toe[1] + 3, l0.ankle[1] + 4, l0.toe[1] + 3)
  const hy = p.hy != null ? p.hy : GROUND - lowest - p.jump
  hip = [p.hx, hy]
  const R = leg(hip, p.rt, p.rk), L = leg(hip, p.lt, p.lk)
  const sh = add(hip, [Math.sin(rad(p.tor)), -Math.cos(rad(p.tor))], LEN.torso)
  const neck = add(sh, [Math.sin(rad(p.tor + p.hd)), -Math.cos(rad(p.tor + p.hd))], LEN.neck)
  const head = add(neck, [Math.sin(rad(p.tor + p.hd)), -Math.cos(rad(p.tor + p.hd))], LEN.head)
  const arm = (u, flex) => {
    const elbow = add(sh, dir(u), LEN.upper)
    const wrist = add(elbow, dir(u + flex), LEN.fore)
    return { elbow, wrist, fa: u + flex }
  }
  return { hip, sh, neck, head, R, L, RA: arm(p.ru, p.re), LA: arm(p.lu, p.le) }
}

const GREY = { far: '#e3e5e8', near: '#d3d6da', torso: '#d9dce0', line: '#9aa0a8', farline: '#c3c7cc' }
const RED = '#d4332b'

function shapes(p1, r1, p2, r2) {
  const dx = p2[0] - p1[0], dy = p2[1] - p1[1]
  const d = Math.hypot(dx, dy) || 1e-6
  const ang = Math.atan2(dy, dx)
  const a = Math.acos(Math.max(-1, Math.min(1, (r1 - r2) / d)))
  const pt = (c, r, th) => [c[0] + r * Math.cos(th), c[1] + r * Math.sin(th)]
  const poly = [pt(p1, r1, ang + a), pt(p2, r2, ang + a), pt(p2, r2, ang - a), pt(p1, r1, ang - a)]
  return `<polygon points="${poly.map(P).join(' ')}"/><circle cx="${f2(p1[0])}" cy="${f2(p1[1])}" r="${r1}"/><circle cx="${f2(p2[0])}" cy="${f2(p2[1])}" r="${r2}"/>`
}

// A body part: outline layer, fill layer, and the red of the muscle on top.
function part(out, p1, r1, p2, r2, { fill, line, w = 0, from = 0.12, to = 0.88, shrink = 0.72 }) {
  r1 *= K; r2 *= K
  out.line.push(`<g fill="${line}" stroke="${line}" stroke-width="1.8" stroke-linejoin="round">${shapes(p1, r1, p2, r2)}</g>`)
  out.fill.push(`<g fill="${fill}">${shapes(p1, r1, p2, r2)}</g>`)
  if (w > 0) {
    const a = mix(p1, p2, from), b = mix(p1, p2, to)
    const ra = (r1 + (r2 - r1) * from) * shrink, rb = (r1 + (r2 - r1) * to) * shrink
    out.red.push(`<g fill="${RED}" opacity="${f2(0.28 + 0.68 * Math.min(1, w))}">${shapes(a, ra, b, rb)}</g>`)
  }
}

/** Weight of each body part from a sport's muscle weights (lib/sports.js). */
export function partWeights(mw) {
  const m = k => mw[k] || 0
  return {
    thigh: Math.max(m('quadriceps'), m('hamstring'), m('adductors'), m('hip-flexors') * 0.9),
    glute: m('gluteal'),
    shin: Math.max(m('calves'), m('tibialis')),
    chest: Math.max(m('chest'), m('serratus')),
    back: Math.max(m('upper-back'), m('trapezius')),
    core: Math.max(m('abs'), m('obliques'), m('lower-back') * 0.9),
    delt: m('deltoids'),
    upper: Math.max(m('biceps'), m('triceps')),
    fore: m('forearm'),
    neck: Math.max(m('neck'), m('trapezius') * 0.8),
  }
}

export function figureSvg(p, w, { far = GREY.far } = {}) {
  const s = skeleton(p)
  const out = { line: [], fill: [], red: [], far: { line: [], fill: [], red: [] } }
  const legPart = (o, L, tone) => {
    part(o, s.hip, 11.5, L.knee, 8, { ...tone, w: w.thigh })
    part(o, L.knee, 7.4, L.ankle, 4.8, { ...tone, w: w.shin, from: 0.1, to: 0.8 })
    part(o, L.ankle, 4.4, L.toe, 3.2, { ...tone, w: 0 })
  }
  const armPart = (o, A, tone) => {
    part(o, s.sh, 7.4, A.elbow, 5.4, { ...tone, w: Math.max(w.upper, w.delt * 0.8) })
    part(o, A.elbow, 5, A.wrist, 3.6, { ...tone, w: w.fore })
  }
  const faint = { fill: far, line: GREY.farline }
  const solid = { fill: GREY.near, line: GREY.line }
  // far side first: they sit behind the body
  legPart(out.far, s.L, faint)
  armPart(out.far, s.LA, faint)
  // trunk
  const tone = { fill: GREY.torso, line: GREY.line }
  part(out, s.hip, 13, s.sh, 15, { ...tone, w: 0 })
  const mid = mix(s.hip, s.sh, 0.5)
  const redTrunk = (a, b, ra, rb, wt) => { ra *= K; rb *= K; if (wt > 0) out.red.push(`<g fill="${RED}" opacity="${f2(0.28 + 0.68 * Math.min(1, wt))}">${shapes(a, ra, b, rb)}</g>`) }
  redTrunk(mix(s.hip, s.sh, 0.1), mid, 8.6, 9.6, w.core)
  redTrunk(mix(s.hip, s.sh, 0.55), mix(s.hip, s.sh, 0.9), 10.4, 11, Math.max(w.chest, w.back))
  redTrunk(s.hip, mix(s.hip, s.sh, 0.14), 9.8, 9, w.glute)
  part(out, s.sh, 6, s.neck, 4.2, { ...tone, w: w.neck, from: 0.1, to: 1, shrink: 0.6 })
  // near side
  legPart(out, s.R, solid)
  armPart(out, s.RA, solid)
  // head
  out.line.push(`<g fill="${GREY.line}" stroke="${GREY.line}" stroke-width="1.8"><circle cx="${f2(s.head[0])}" cy="${f2(s.head[1])}" r="${LEN.head}"/></g>`)
  out.fill.push(`<g fill="#dcdfe3"><circle cx="${f2(s.head[0])}" cy="${f2(s.head[1])}" r="${LEN.head}"/></g>`)
  const layers = o => o.line.join('') + o.fill.join('') + o.red.join('')
  return { svg: layers(out.far) + layers(out), s }
}
