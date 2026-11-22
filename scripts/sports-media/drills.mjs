// Olympus: the drills' animations, two for each sport (frontend/src/lib/sports.js DRILLS), drawn
// with the same figure and conventions as the sports (engine.mjs, sports.mjs): key poses the figure
// goes through and back to the first, `over(t)` for what is easier as a formula, a scene behind and
// props (`props` behind the figure, `front` before it). `place(p)` moves the figure itself, for the
// drills that hang from a bar: the hands are put on the bar.
import { SIZE, GROUND, skeleton } from './engine.mjs'

const TAU = Math.PI * 2
const sin = Math.sin
const BALL_Y = GROUND - 7
const SCENE = '#cfd3d8', SCENE2 = '#e6e8eb', WATER = '#9ec5e3', FRAME = '#b9bec5'

const f1 = n => Number(n).toFixed(1)
const line = (x1, y1, x2, y2, c = SCENE, w = 2) => `<line x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(x2)}" y2="${f1(y2)}" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/>`
const ground = (c = SCENE) => line(6, GROUND + 3, SIZE - 6, GROUND + 3, c, 2.5)
// Marks on the ground that slide by, for the drills done on the move.
const sliding = (t, gap, draw, n = 5) => {
  let s = ''
  for (let i = 0; i < n; i++) s += draw((((i * gap - t * gap * 2) % (gap * n)) + gap * n) % (gap * n) - gap / 2)
  return s
}
const wall = x => `<rect x="${x}" y="0" width="${SIZE - x}" height="${GROUND + 3}" fill="#eceef1"/>` + line(x, 0, x, GROUND + 3, FRAME, 2.5)
const cone = x => `<path d="M${f1(x - 6)} ${GROUND + 2} L${f1(x - 2)} ${GROUND - 14} L${f1(x + 2)} ${GROUND - 14} L${f1(x + 6)} ${GROUND + 2}Z" fill="#f0a35e" stroke="#c0732e" stroke-width="1.2" stroke-linejoin="round"/>` + line(x - 4, GROUND - 5, x + 4, GROUND - 5, '#fff', 1.6)
const net = (x, top) => line(x, top, x, GROUND + 3, FRAME, 3) + (() => { let s = ''; for (let y = top + 4; y < GROUND; y += 6) s += line(x, y, x + 10, y + 2, SCENE2, 1); return s })()
const backpack = (s, p) => `<rect x="${f1(s.sh[0] - 17)}" y="${f1(s.sh[1] - 2)}" width="11" height="26" rx="4" transform="rotate(${f1(p.tor * 0.9)} ${f1(s.sh[0])} ${f1(s.sh[1])})" fill="#c98f6a" stroke="#8a5a3a" stroke-width="1.2"/>`

// A thrown or hit ball on a parabola from a to b, `h` above the straight line at the middle.
const arc = (a, b, k, h = 0) => ({ bx: a[0] + (b[0] - a[0]) * k, by: a[1] + (b[1] - a[1]) * k - 4 * h * k * (1 - k) })
// Where t falls between t0 and t1, from 0 to 1.
const span = (t, t0, t1) => Math.max(0, Math.min(1, (t - t0) / (t1 - t0)))

// The hip that puts the right hand on (x, y), for a figure hanging from a bar or an edge.
function handsOn(p, x, y) {
  const s = skeleton({ ...p, hx: 0, hy: 0 })
  return { hx: x - s.RA.wrist[0], hy: y - s.RA.wrist[1] }
}

export const DRILLS = {
  // Football: the ball at the feet, the cones sliding by.
  'drill-football-cone-dribble': {
    ball: 'soccer',
    scene: t => ground() + sliding(t, 60, x => cone(x), 4),
    keys: [{ t: 0, bf: 1, bo: 1 }],
    over: t => {
      const f = TAU * 2 * t
      const leg = ph => ({ th: 24 * sin(f + ph), kn: 26 + 22 * Math.cos(f + ph - 0.9) })
      const r = leg(0), l = leg(Math.PI)
      return { hx: 78, tor: 12, hd: 8, rt: r.th, rk: Math.max(6, r.kn), lt: l.th, lk: Math.max(6, l.kn), ru: -22 * sin(f), re: 50, lu: 22 * sin(f), le: 50,
        bx: 104 + 7 * sin(f - 0.6), by: BALL_Y, bf: 1, bo: 1 }
    },
  },
  'drill-football-wall-pass': {
    ball: 'soccer',
    scene: () => ground() + wall(168),
    keys: [
      { t: 0, hx: 70, rt: 2, rk: 8, lt: -4, lk: 8, tor: 6, ru: -12, re: 20, lu: 16, le: 20, bf: 1, bo: 1 },
      { t: 0.14, hx: 70, rt: -26, rk: 46, lt: -2, lk: 14, tor: 8, ru: 18, re: 20, lu: -20, le: 20, bf: 1, bo: 1 },
      { t: 0.26, hx: 70, rt: 24, rk: 10, lt: -2, lk: 14, tor: 2, ru: -24, re: 20, lu: 24, le: 20, bf: 1, bo: 1 },
      { t: 0.4, hx: 70, rt: 4, rk: 8, lt: -4, lk: 10, tor: 6, ru: -12, re: 20, lu: 16, le: 20, bf: 1, bo: 1 },
      { t: 0.62, hx: 70, rt: 22, rk: 34, lt: -2, lk: 12, tor: 8, ru: 10, re: 20, lu: -10, le: 20, bf: 1, bo: 1 },
      { t: 0.74, hx: 70, rt: 8, rk: 12, lt: -4, lk: 10, tor: 6, ru: -10, re: 20, lu: 14, le: 20, bf: 1, bo: 1 },
    ],
    over: t => {
      const foot = 100, hit = 159
      if (t < 0.26) return { bx: foot, by: BALL_Y }
      if (t < 0.4) return { bx: foot + (hit - foot) * span(t, 0.26, 0.4), by: BALL_Y }
      if (t < 0.7) return { bx: hit - (hit - foot) * span(t, 0.4, 0.7) ** 0.8, by: BALL_Y }
      return { bx: foot, by: BALL_Y }
    },
  },

  // Basketball.
  'drill-basketball-dribble': {
    ball: 'basket',
    scene: () => ground(),
    keys: [{ t: 0 }],
    over: t => {
      // Two bounces a loop: the hand pushes down, the ball comes back up to it.
      const k = (t * 2) % 1
      const push = 0.5 - 0.5 * Math.cos(TAU * k)
      const ru = 52 - 26 * push, re = 46 - 30 * push
      const floor = [118, GROUND - 9]
      const bounce = k < 0.5 ? span(k, 0.05, 0.5) : 1 - span(k, 0.5, 0.95)
      return { hx: 82, rt: 32, rk: 60, lt: 20, lk: 50, tor: 22, hd: -18, ru, re, lu: 40, le: 70,
        bf: bounce, bx: floor[0], by: floor[1], bo: 1, jump: 0 }
    },
  },
  'drill-basketball-form-shooting': {
    still: 0.4,
    ball: 'basket', scene: 'basketball',
    keys: [
      { t: 0, hx: 92, rt: 16, rk: 30, lt: 12, lk: 26, tor: 8, hd: -10, ru: 76, re: 104, lu: 30, le: 40, bf: 0, bo: 1 },
      { t: 0.2, hx: 92, rt: 30, rk: 56, lt: 26, lk: 50, tor: 14, hd: -12, ru: 70, re: 110, lu: 30, le: 40, bf: 0, bo: 1 },
      { t: 0.36, hx: 92, rt: 2, rk: 4, lt: 0, lk: 3, tor: 2, jump: 3, hd: -16, ru: 140, re: 40, lu: 20, le: 30, bf: 0, bo: 1, bx: 158, by: 50, arc: 16 },
      { t: 0.44, hx: 92, rt: 2, rk: 4, lt: 0, lk: 3, tor: 2, jump: 3, hd: -16, ru: 160, re: 14, lu: 20, le: 30, bf: 0.05, bo: 1, bx: 158, by: 50, arc: 16 },
      { t: 0.66, hx: 92, rt: 4, rk: 6, lt: 2, lk: 5, tor: 2, hd: -14, ru: 160, re: 14, lu: 20, le: 30, bf: 1, bo: 1, bx: 158, by: 50, arc: 16 },
      { t: 0.74, hx: 92, rt: 8, rk: 14, lt: 6, lk: 12, tor: 4, hd: -10, ru: 150, re: 20, lu: 20, le: 30, bf: 1, bo: 0, bx: 158, by: 76, arc: 0 },
      { t: 0.9, hx: 92, rt: 14, rk: 26, lt: 10, lk: 22, tor: 8, hd: -10, ru: 76, re: 104, lu: 30, le: 40, bf: 0, bo: 0, arc: 0 },
    ],
  },

  // Swimming: in the water, seen from the side.
  'drill-swimming-kickboard': {
    ball: null, scene: 'swimming',
    keys: [{ t: 0 }],
    over: t => {
      const kick = sin(TAU * 6 * t)
      return { hx: 70, hy: 112 + 1.2 * sin(TAU * 2 * t), tor: 86, hd: -14, ru: 92, re: 2, lu: 90, le: 2,
        rt: -82 + 9 * kick, rk: 6 + 10 * Math.max(0, kick), lt: -82 - 9 * kick, lk: 6 + 10 * Math.max(0, -kick) }
    },
    props: s => {
      const w = s.RA.wrist
      return `<rect x="${f1(w[0] - 6)}" y="${f1(w[1] - 4)}" width="34" height="7" rx="3.5" fill="#f5c84c" stroke="#b98d1c" stroke-width="1.3"/>`
    },
  },
  'drill-swimming-pull-buoy': {
    ball: null, scene: 'swimming',
    keys: [{ t: 0 }],
    over: t => {
      const stroke = (t * 2) % 1
      const arm = ph => { const k = (stroke + ph) % 1; return { u: 110 - 360 * k, e: k < 0.55 ? 28 : 70 } }
      const r = arm(0), l = arm(0.5)
      return { hx: 92, hy: 104 + 2 * sin(TAU * 2 * t), tor: 86 + 2.5 * sin(TAU * 2 * t + 1), hd: -2, ru: r.u, re: r.e, lu: l.u, le: l.e,
        rt: -84, rk: 4, lt: -82, lk: 4 }
    },
    // The buoy between the thighs.
    front: s => {
      const m = [(s.hip[0] + s.R.knee[0]) / 2, (s.hip[1] + s.R.knee[1]) / 2]
      return `<ellipse cx="${f1(m[0])}" cy="${f1(m[1] + 2)}" rx="11" ry="6" fill="#5aa0d8" stroke="#2f6e9e" stroke-width="1.3"/>`
    },
  },

  // Tennis.
  'drill-tennis-split-step': {
    ball: null, racket: 'tennis',
    scene: () => ground() + line(150, GROUND + 3, 176, GROUND + 3, '#fff', 2) + net(172, 112),
    keys: [
      { t: 0, hx: 70, rt: 14, rk: 26, lt: -12, lk: 22, tor: 12, hd: -4, ru: 40, re: 66, lu: 46, le: 56, ra: -40, ro: 1 },
      { t: 0.14, hx: 70, rt: 4, rk: 12, lt: -4, lk: 12, tor: 8, jump: 9, hd: -4, ru: 40, re: 66, lu: 46, le: 56, ra: -40, ro: 1 },
      { t: 0.26, hx: 70, rt: 26, rk: 56, lt: -22, lk: 50, tor: 18, jump: 0, hd: -4, ru: 36, re: 70, lu: 44, le: 60, ra: -40, ro: 1 },
      { t: 0.42, hx: 92, rt: 52, rk: 66, lt: -30, lk: 22, tor: 22, hd: -4, ru: 10, re: 70, lu: 60, le: 40, ra: -30, ro: 1 },
      { t: 0.56, hx: 104, rt: 30, rk: 40, lt: -14, lk: 30, tor: 18, hd: -4, ru: -20, re: 60, lu: 70, le: 30, ra: -20, ro: 1 },
      { t: 0.8, hx: 72, rt: 14, rk: 26, lt: -12, lk: 22, tor: 12, hd: -4, ru: 40, re: 66, lu: 46, le: 56, ra: -40, ro: 1 },
    ],
  },
  'drill-tennis-wall-rally': {
    still: 0.3,
    ball: 'tennis', racket: 'tennis',
    scene: () => ground() + wall(168) + line(168, 104, SIZE, 104, '#fff', 2),
    keys: [
      { t: 0, hx: 66, rt: 16, rk: 30, lt: -8, lk: 26, tor: 10, ru: 40, re: 66, lu: 50, le: 40, ra: -30, ro: 1 },
      { t: 0.22, hx: 66, rt: 18, rk: 36, lt: -10, lk: 30, tor: -6, ru: -40, re: 50, lu: 70, le: 30, ra: -10, ro: 1 },
      { t: 0.36, hx: 66, rt: 16, rk: 30, lt: -6, lk: 24, tor: 14, ru: 70, re: 14, lu: 30, le: 40, ra: 0, ro: 1 },
      { t: 0.46, hx: 66, rt: 12, rk: 22, lt: -4, lk: 18, tor: 22, ru: 150, re: 50, lu: 10, le: 50, ra: 20, ro: 1 },
      { t: 0.7, hx: 66, rt: 16, rk: 30, lt: -8, lk: 26, tor: 10, ru: 40, re: 66, lu: 50, le: 40, ra: -30, ro: 1 },
    ],
    over: t => {
      // From the wall, a bounce, to the racket (t 0.36), back to the wall, back down to the bounce.
      const hit = [123, 106], w = [164, 96], bounce = [146, GROUND - 4]
      if (t < 0.16) return { bf: 1, bo: 1, ...arc(w, bounce, span(t, -0.2, 0.16), 0) }
      if (t < 0.3) return { bf: 1, bo: 1, ...arc(bounce, hit, span(t, 0.16, 0.3), 14) }
      if (t < 0.56) return { bf: 1, bo: 1, ...arc(hit, w, span(t, 0.3, 0.56), 10) }
      return { bf: 1, bo: 1, ...arc(w, bounce, span(t, 0.56, 1.16), 0) }
    },
  },

  // Padel.
  'drill-padel-volley': {
    ball: 'tennis', racket: 'padel',
    scene: () => ground() + net(158, 110),
    keys: [
      { t: 0, hx: 88, rt: 18, rk: 36, lt: -10, lk: 32, tor: 12, ru: 50, re: 80, lu: 50, le: 50, ra: -50, ro: 1 },
      { t: 0.2, hx: 88, rt: 18, rk: 36, lt: -10, lk: 32, tor: 12, ru: 66, re: 56, lu: 46, le: 50, ra: -40, ro: 1 },
      { t: 0.3, hx: 88, rt: 16, rk: 34, lt: -8, lk: 30, tor: 14, ru: 54, re: 78, lu: 50, le: 50, ra: -50, ro: 1 },
      { t: 0.38, hx: 88, rt: 6, rk: 14, lt: -4, lk: 14, tor: 10, jump: 6, ru: 50, re: 80, lu: 50, le: 50, ra: -50, ro: 1 },
      { t: 0.46, hx: 88, rt: 18, rk: 36, lt: -10, lk: 32, tor: 12, ru: 50, re: 80, lu: 50, le: 50, ra: -50, ro: 1 },
      { t: 0.7, hx: 88, rt: 18, rk: 36, lt: -10, lk: 32, tor: 12, ru: 66, re: 56, lu: 46, le: 50, ra: -40, ro: 1 },
      { t: 0.8, hx: 88, rt: 16, rk: 34, lt: -8, lk: 30, tor: 14, ru: 54, re: 78, lu: 50, le: 50, ra: -50, ro: 1 },
      { t: 0.88, hx: 88, rt: 6, rk: 14, lt: -4, lk: 14, tor: 10, jump: 6, ru: 50, re: 80, lu: 50, le: 50, ra: -50, ro: 1 },
    ],
    over: t => {
      const k = (t * 2) % 1
      const hit = [154, 60], far = [200, 92], back = [200, 52]
      if (k < 0.4) return { bf: 1, bo: 1, ...arc(far, hit, span(k, 0, 0.4), 6) }
      return { bf: 1, bo: 1, ...arc(hit, back, span(k, 0.4, 0.8), 4) }
    },
  },
  'drill-padel-bandeja': {
    ball: 'tennis', racket: 'padel',
    scene: () => ground() + net(168, 112),
    keys: [
      { t: 0, hx: 74, rt: 18, rk: 34, lt: -14, lk: 28, tor: -4, hd: -16, ru: 150, re: 80, lu: 120, le: 20, ra: -30, ro: 1 },
      { t: 0.3, hx: 74, rt: 20, rk: 38, lt: -14, lk: 30, tor: -8, hd: -20, ru: 160, re: 96, lu: 130, le: 20, ra: -40, ro: 1 },
      { t: 0.42, hx: 74, rt: 16, rk: 28, lt: -10, lk: 24, tor: 8, hd: -14, ru: 130, re: 14, lu: 60, le: 30, ra: 0, ro: 1 },
      { t: 0.54, hx: 74, rt: 12, rk: 22, lt: -6, lk: 20, tor: 16, hd: -6, ru: 70, re: 30, lu: 30, le: 40, ra: 10, ro: 1 },
      { t: 0.78, hx: 74, rt: 18, rk: 34, lt: -14, lk: 28, tor: -4, hd: -16, ru: 150, re: 80, lu: 120, le: 20, ra: -30, ro: 1 },
    ],
    over: t => {
      const top = [176, -24], hit = [119, 10], out = [200, 96]
      if (t < 0.42) return { bf: 1, bo: 1, ...arc(top, hit, span(t, 0.05, 0.42), -6) }
      return { bf: 1, bo: 1, ...arc(hit, out, span(t, 0.42, 0.7), 4) }
    },
  },

  // Volleyball: the ball kept going straight up.
  'drill-volleyball-forearm-pass': {
    ball: 'volley', scene: () => ground(),
    keys: [
      { t: 0, hx: 84, rt: 34, rk: 62, lt: 26, lk: 56, tor: 22, hd: -10, ru: 56, re: 0, lu: 54, le: 0 },
      { t: 0.16, hx: 84, rt: 12, rk: 22, lt: 8, lk: 18, tor: 10, hd: -14, ru: 76, re: 0, lu: 74, le: 0 },
      { t: 0.5, hx: 84, rt: 18, rk: 34, lt: 12, lk: 28, tor: 14, hd: -24, ru: 50, re: 10, lu: 48, le: 10 },
      { t: 0.8, hx: 84, rt: 30, rk: 54, lt: 22, lk: 48, tor: 20, hd: -16, ru: 54, re: 0, lu: 52, le: 0 },
    ],
    over: t => {
      // Up and down on a free fall, the contact at t = 0 (and 1).
      const contact = 74, top = 4
      const k = (t + 0.06) % 1
      return { bf: 1, bo: 1, bx: 129, by: contact - 4 * (contact - top) * k * (1 - k) }
    },
  },
  'drill-volleyball-setting': {
    ball: 'volley', scene: () => ground(),
    keys: [
      { t: 0, hx: 84, rt: 28, rk: 52, lt: 22, lk: 46, tor: 6, hd: -30, ru: 140, re: 50, lu: 136, le: 54 },
      { t: 0.16, hx: 84, rt: 4, rk: 8, lt: 2, lk: 6, tor: 2, hd: -34, ru: 168, re: 6, lu: 164, le: 8 },
      { t: 0.5, hx: 84, rt: 10, rk: 18, lt: 6, lk: 14, tor: 2, hd: -36, ru: 150, re: 40, lu: 146, le: 44 },
      { t: 0.84, hx: 84, rt: 26, rk: 48, lt: 20, lk: 42, tor: 6, hd: -32, ru: 138, re: 56, lu: 134, le: 58 },
    ],
    over: t => {
      const contact = 11, top = -16
      const k = (t + 0.04) % 1
      // Only the lower part of the flight is in the picture: the ball goes out of the top and comes back.
      return { bf: 1, bo: 1, bx: 100, by: contact - 4 * (contact - top) * k * (1 - k) }
    },
  },

  // Rugby.
  'drill-rugby-tackle-bag': {
    still: 0.5,
    ball: null, scene: () => ground(),
    keys: [
      { t: 0, hx: 52, rt: 30, rk: 60, lt: -20, lk: 50, tor: 30, hd: -24, ru: 30, re: 70, lu: -20, le: 60, sa: 0 },
      { t: 0.16, hx: 66, rt: -14, rk: 54, lt: 34, lk: 64, tor: 36, hd: -28, ru: -20, re: 70, lu: 30, le: 60, sa: 0 },
      { t: 0.32, hx: 82, rt: 40, rk: 78, lt: -16, lk: 40, tor: 46, hd: -36, ru: 60, re: 50, lu: 40, le: 60, sa: 0 },
      { t: 0.42, hx: 92, rt: 46, rk: 82, lt: -30, lk: 20, tor: 52, hd: -40, ru: 100, re: 70, lu: 96, le: 76, sa: 8 },
      { t: 0.56, hx: 104, rt: 30, rk: 60, lt: -40, lk: 14, tor: 56, hd: -42, ru: 104, re: 74, lu: 100, le: 80, sa: 26 },
      { t: 0.68, hx: 108, rt: 34, rk: 62, lt: -36, lk: 20, tor: 54, hd: -40, ru: 104, re: 74, lu: 100, le: 80, sa: 30 },
      { t: 0.8, hx: 84, rt: 10, rk: 20, lt: -6, lk: 16, tor: 18, hd: -10, ru: 20, re: 40, lu: 10, le: 40, sa: -6 },
      { t: 0.9, hx: 60, rt: 20, rk: 40, lt: -10, lk: 30, tor: 24, hd: -16, ru: 20, re: 60, lu: -10, le: 60, sa: 2 },
    ],
    // A pop-up tackle bag: it gives way on the hit and springs back.
    props: (s, p) => {
      const x = 140, base = GROUND + 2
      return `<g transform="rotate(${f1(p.sa)} ${x} ${base})"><rect x="${x - 11}" y="${base - 74}" width="22" height="74" rx="10" fill="#4a6c9b" stroke="#2c4a72" stroke-width="1.5"/>`
        + line(x - 10, base - 52, x + 10, base - 52, '#d8e2ef', 2) + line(x - 10, base - 26, x + 10, base - 26, '#d8e2ef', 2) + '</g>'
    },
  },
  'drill-rugby-ground-pass': {
    ball: 'rugby', scene: () => ground(),
    keys: [
      { t: 0, hx: 74, rt: 44, rk: 86, lt: -6, lk: 70, tor: 60, hd: -26, ru: 20, re: 6, lu: 14, le: 6, bf: 0, bo: 1 },
      { t: 0.16, hx: 74, rt: 44, rk: 86, lt: -6, lk: 70, tor: 58, hd: -24, ru: -10, re: 6, lu: -16, le: 6, bf: 0, bo: 1 },
      { t: 0.32, hx: 78, rt: 30, rk: 50, lt: -10, lk: 40, tor: 40, hd: -20, ru: 70, re: 10, lu: 64, le: 10, bf: 0, bo: 1, bx: 210, by: 70, arc: 10 },
      { t: 0.42, hx: 80, rt: 20, rk: 36, lt: -14, lk: 30, tor: 30, hd: -16, ru: 110, re: 8, lu: 104, le: 8, bf: 0.25, bo: 1, bx: 210, by: 70, arc: 10 },
      { t: 0.56, hx: 80, rt: 20, rk: 36, lt: -14, lk: 30, tor: 30, hd: -16, ru: 110, re: 8, lu: 104, le: 8, bf: 1, bo: 1, bx: 210, by: 70, arc: 10 },
      { t: 0.7, hx: 76, rt: 14, rk: 20, lt: -8, lk: 16, tor: 14, hd: -6, ru: 20, re: 30, lu: 14, le: 30, bf: 1, bo: 0, bx: 112, by: GROUND - 6, arc: 0 },
      { t: 0.84, hx: 74, rt: 40, rk: 78, lt: -6, lk: 64, tor: 50, hd: -22, ru: 30, re: 10, lu: 24, le: 10, bf: 1, bo: 1, bx: 112, by: GROUND - 6, arc: 0 },
      { t: 0.94, hx: 74, rt: 44, rk: 86, lt: -6, lk: 70, tor: 60, hd: -26, ru: 20, re: 6, lu: 14, le: 6, bf: 1, bo: 1, bx: 112, by: GROUND - 6, arc: 0 },
    ],
  },

  // Handball.
  'drill-handball-wall-throw': {
    ball: 'handball',
    scene: () => ground() + wall(166),
    keys: [
      { t: 0, hx: 64, rt: -10, rk: 20, lt: 16, lk: 18, tor: -8, ru: 130, re: 100, lu: 70, le: 30, bf: 0, bo: 1 },
      { t: 0.18, hx: 68, rt: -18, rk: 26, lt: 26, lk: 24, tor: -14, ru: 120, re: 116, lu: 80, le: 20, bf: 0, bo: 1 },
      { t: 0.3, hx: 74, rt: -24, rk: 30, lt: 24, lk: 22, tor: 12, ru: 160, re: 30, lu: 30, le: 40, bf: 0, bo: 1, bx: 158, by: 70, arc: 4 },
      { t: 0.36, hx: 76, rt: -22, rk: 34, lt: 22, lk: 24, tor: 22, ru: 110, re: 10, lu: 10, le: 40, bf: 0.15, bo: 1, bx: 158, by: 70, arc: 4 },
      { t: 0.46, hx: 74, rt: -14, rk: 30, lt: 18, lk: 24, tor: 18, ru: 70, re: 20, lu: 20, le: 40, bf: 1, bo: 1, bx: 158, by: 70, arc: 4 },
      { t: 0.68, hx: 66, rt: -8, rk: 20, lt: 14, lk: 18, tor: 4, ru: 80, re: 60, lu: 76, le: 60, bf: 0, bo: 1, bx: 158, by: 70, arc: 8 },
      { t: 0.86, hx: 64, rt: -10, rk: 20, lt: 16, lk: 18, tor: -6, ru: 120, re: 96, lu: 70, le: 30, bf: 0, bo: 1 },
    ],
  },
  'drill-handball-defense-step': {
    ball: null,
    scene: () => ground() + [0, 1, 2, 3, 4].map(i => line(30 + i * 10, GROUND + 3, 34 + i * 10, GROUND + 3, '#e9b8b3', 3)).join(''),
    keys: [
      { t: 0, hx: 56, rt: 20, rk: 40, lt: -16, lk: 36, tor: 14, hd: -8, ru: 150, re: 30, lu: 140, le: 40 },
      { t: 0.18, hx: 84, rt: 50, rk: 40, lt: -30, lk: 30, tor: 20, hd: -10, ru: 168, re: 10, lu: 160, le: 16 },
      { t: 0.32, hx: 112, rt: 30, rk: 44, lt: -22, lk: 40, tor: 16, hd: -10, ru: 170, re: 8, lu: 164, le: 14 },
      { t: 0.44, hx: 112, rt: 22, rk: 44, lt: -18, lk: 40, tor: 16, hd: -10, ru: 170, re: 8, lu: 164, le: 14 },
      { t: 0.58, hx: 96, rt: 8, rk: 34, lt: -30, lk: 40, tor: 14, hd: -8, ru: 150, re: 30, lu: 140, le: 40 },
      { t: 0.7, hx: 82, rt: 26, rk: 40, lt: -14, lk: 36, tor: 14, hd: -8, ru: 150, re: 30, lu: 140, le: 40 },
      { t: 0.82, hx: 68, rt: 8, rk: 34, lt: -30, lk: 40, tor: 14, hd: -8, ru: 150, re: 30, lu: 140, le: 40 },
      { t: 0.92, hx: 58, rt: 22, rk: 40, lt: -16, lk: 36, tor: 14, hd: -8, ru: 150, re: 30, lu: 140, le: 40 },
    ],
  },

  // Badminton.
  'drill-badminton-net-lunge': {
    still: 0.43,
    ball: null, racket: 'badminton', scene: 'badminton',
    keys: [
      { t: 0, hx: 46, rt: 10, rk: 20, lt: -8, lk: 18, tor: 10, hd: -4, ru: 60, re: 70, lu: 40, le: 40, ra: -20, ro: 1 },
      { t: 0.12, hx: 60, rt: 30, rk: 30, lt: -14, lk: 26, tor: 12, hd: -4, ru: 60, re: 70, lu: 30, le: 40, ra: -20, ro: 1 },
      { t: 0.22, hx: 74, rt: 10, rk: 24, lt: 4, lk: 30, tor: 12, hd: -4, ru: 70, re: 60, lu: 30, le: 40, ra: -20, ro: 1 },
      { t: 0.36, hx: 102, rt: 70, rk: 72, lt: -46, lk: 14, tor: 16, hd: -10, ru: 90, re: 20, lu: -30, le: 20, ra: -30, ro: 1 },
      { t: 0.5, hx: 102, rt: 70, rk: 72, lt: -46, lk: 14, tor: 16, hd: -10, ru: 96, re: 30, lu: -30, le: 20, ra: -10, ro: 1 },
      { t: 0.64, hx: 76, rt: 24, rk: 30, lt: -12, lk: 24, tor: 10, hd: -4, ru: 60, re: 70, lu: 30, le: 40, ra: -20, ro: 1 },
      { t: 0.8, hx: 54, rt: -6, rk: 20, lt: 12, lk: 24, tor: 10, hd: -4, ru: 60, re: 70, lu: 40, le: 40, ra: -20, ro: 1 },
    ],
  },
  'drill-badminton-high-serve': {
    ball: null, racket: 'badminton', scene: 'badminton',
    keys: [
      { t: 0, hx: 64, rt: 16, rk: 20, lt: -14, lk: 16, tor: 4, hd: 8, ru: -46, re: 30, lu: 70, le: 20, ra: -10, ro: 1, sx: 106, sy: 70, so: 1, sa: 0 },
      { t: 0.14, hx: 64, rt: 16, rk: 20, lt: -14, lk: 16, tor: 4, hd: 10, ru: -60, re: 40, lu: 66, le: 20, ra: -10, ro: 1, sx: 106, sy: 70, so: 1, sa: 0 },
      { t: 0.28, hx: 66, rt: 14, rk: 18, lt: -12, lk: 16, tor: 8, hd: 10, ru: 20, re: 10, lu: 40, le: 20, ra: 0, ro: 1, sx: 106, sy: 128, so: 1, sa: 180 },
      { t: 0.36, hx: 68, rt: 12, rk: 16, lt: -10, lk: 14, tor: 6, hd: -6, ru: 110, re: 20, lu: 20, le: 20, ra: 20, ro: 1, sx: 150, sy: 60, so: 1, sa: 60 },
      { t: 0.46, hx: 68, rt: 10, rk: 14, lt: -8, lk: 12, tor: 0, hd: -14, ru: 160, re: 60, lu: 10, le: 20, ra: 20, ro: 1, sx: 196, sy: -10, so: 1, sa: 40 },
      { t: 0.7, hx: 66, rt: 14, rk: 18, lt: -12, lk: 16, tor: 2, hd: 0, ru: 60, re: 40, lu: 40, le: 20, ra: 0, ro: 1, sx: 196, sy: -10, so: 0, sa: 0 },
      { t: 0.86, hx: 64, rt: 16, rk: 20, lt: -14, lk: 16, tor: 4, hd: 8, ru: -46, re: 30, lu: 70, le: 20, ra: -10, ro: 1, sx: 106, sy: 70, so: 0, sa: 0 },
    ],
  },

  // Table tennis.
  'drill-table-tennis-serve': {
    ball: 'tt', racket: 'tt', scene: 'tabletennis',
    keys: [
      { t: 0, hx: 40, rt: 22, rk: 40, lt: 14, lk: 32, tor: 26, hd: 10, ru: 20, re: 70, lu: 54, le: 50, ra: -10, ro: 1 },
      { t: 0.2, hx: 40, rt: 22, rk: 40, lt: 14, lk: 32, tor: 24, hd: -6, ru: 10, re: 90, lu: 62, le: 60, ra: -10, ro: 1 },
      { t: 0.42, hx: 40, rt: 22, rk: 40, lt: 14, lk: 32, tor: 26, hd: 4, ru: -10, re: 100, lu: 50, le: 50, ra: -14, ro: 1 },
      { t: 0.5, hx: 40, rt: 20, rk: 38, lt: 12, lk: 30, tor: 30, hd: 8, ru: 50, re: 40, lu: 40, le: 50, ra: -20, ro: 1 },
      { t: 0.58, hx: 40, rt: 20, rk: 38, lt: 12, lk: 30, tor: 30, hd: 8, ru: 70, re: 30, lu: 40, le: 50, ra: -20, ro: 1 },
      { t: 0.84, hx: 40, rt: 22, rk: 40, lt: 14, lk: 32, tor: 26, hd: 10, ru: 20, re: 70, lu: 54, le: 50, ra: -10, ro: 1 },
    ],
    over: t => {
      // In the open palm, tossed straight up, hit as it falls, one bounce on each side of the net.
      const palm = [91, 58], top = [92, 26], hit = [104, 80], own = [118, 105], other = [158, 106], away = [200, 84]
      if (t < 0.12) return { bf: 1, bo: 1, bx: palm[0], by: palm[1] }
      if (t < 0.3) return { bf: 1, bo: 1, bx: palm[0], by: palm[1] - (palm[1] - top[1]) * (1 - (1 - span(t, 0.12, 0.3)) ** 2) }
      if (t < 0.5) return { bf: 1, bo: 1, bx: top[0] + (hit[0] - top[0]) * span(t, 0.3, 0.5), by: top[1] + (hit[1] - top[1]) * span(t, 0.3, 0.5) ** 2 }
      if (t < 0.56) return { bf: 1, bo: 1, ...arc(hit, own, span(t, 0.5, 0.56), 0) }
      if (t < 0.7) return { bf: 1, bo: 1, ...arc(own, other, span(t, 0.56, 0.7), 16) }
      if (t < 0.8) return { bf: 1, bo: 1, ...arc(other, away, span(t, 0.7, 0.8), 8) }
      return { bf: 1, bo: span(t, 0.88, 0.98), bx: palm[0], by: palm[1] }
    },
  },
  'drill-table-tennis-multiball': {
    ball: 'tt', racket: 'tt',
    scene: () => line(6, GROUND + 3, SIZE - 6, GROUND + 3, SCENE, 2.5)
      + `<rect x="82" y="108" width="98" height="5" rx="1.5" fill="#6f94b0"/>` + line(88, 113, 88, 152, FRAME, 3) + line(172, 113, 172, 152, FRAME, 3)
      + line(131, 98, 131, 108, FRAME, 2.5) + line(131, 98, 131, 108, '#fff', 1)
      // the feeder's basket of balls at the far end
      + `<rect x="160" y="88" width="18" height="18" rx="2" fill="#eef0f2" stroke="${FRAME}" stroke-width="1.4"/>`
      + [[164, 90], [169, 89], [174, 90], [166, 86], [172, 86]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3" fill="#fff" stroke="#9aa0a8" stroke-width="1"/>`).join(''),
    keys: [
      { t: 0, hx: 40, rt: 22, rk: 40, lt: 14, lk: 32, tor: 22, hd: 6, ru: 40, re: 80, lu: 40, le: 50, ra: -10, ro: 1 },
      { t: 0.24, hx: 40, rt: 22, rk: 40, lt: 14, lk: 32, tor: 18, hd: 6, ru: 10, re: 84, lu: 44, le: 50, ra: -10, ro: 1 },
      { t: 0.34, hx: 40, rt: 20, rk: 38, lt: 12, lk: 30, tor: 30, hd: 6, ru: 76, re: 30, lu: 24, le: 50, ra: -10, ro: 1 },
      { t: 0.5, hx: 40, rt: 22, rk: 40, lt: 14, lk: 32, tor: 22, hd: 6, ru: 40, re: 80, lu: 40, le: 50, ra: -10, ro: 1 },
      { t: 0.74, hx: 40, rt: 22, rk: 40, lt: 14, lk: 32, tor: 18, hd: 6, ru: 10, re: 84, lu: 44, le: 50, ra: -10, ro: 1 },
      { t: 0.84, hx: 40, rt: 20, rk: 38, lt: 12, lk: 30, tor: 30, hd: 6, ru: 76, re: 30, lu: 24, le: 50, ra: -10, ro: 1 },
    ],
    over: t => {
      // A new ball every half loop: from the basket, a bounce on this side, hit, over the net.
      const k = (t * 2) % 1
      const feed = [164, 84], bounce = [112, 105], hit = [90, 74], other = [156, 106], away = [200, 80]
      if (k < 0.2) return { bf: 1, bo: 1, ...arc(feed, bounce, span(k, 0, 0.2), 14) }
      if (k < 0.34) return { bf: 1, bo: 1, ...arc(bounce, hit, span(k, 0.2, 0.34), 8) }
      if (k < 0.54) return { bf: 1, bo: 1, ...arc(hit, other, span(k, 0.34, 0.54), 18) }
      return { bf: 1, bo: 1, ...arc(other, away, span(k, 0.54, 0.7), 8) }
    },
  },

  // Climbing: hanging from a board or a bar, the hands kept where it is.
  'drill-climbing-hangboard': {
    ball: null, noShadow: false,
    scene: () => ground() + `<rect x="58" y="2" width="70" height="12" rx="3" fill="#c9a77c" stroke="#8a6a44" stroke-width="1.4"/>` + line(64, 14, 122, 14, '#8a6a44', 1.4),
    keys: [
      { t: 0, rt: 30, rk: 90, lt: 18, lk: 100, tor: 2, hd: -18, ru: 176, re: 4, lu: 172, le: 6, hang: 1 },
      { t: 0.5, rt: 32, rk: 92, lt: 20, lk: 102, tor: 2, hd: -18, ru: 176, re: 4, lu: 172, le: 6, hang: 1 },
      { t: 0.62, rt: 2, rk: 6, lt: -2, lk: 4, tor: 2, hd: -16, ru: 170, re: 10, lu: 166, le: 12, hang: 0 },
      { t: 0.7, rt: 2, rk: 6, lt: -2, lk: 4, tor: 4, hd: 0, ru: 14, re: 20, lu: 6, le: 20, hang: 0 },
      { t: 0.86, rt: 2, rk: 6, lt: -2, lk: 4, tor: 4, hd: -6, ru: 30, re: 10, lu: 20, le: 10, hang: 0 },
      { t: 0.94, rt: 2, rk: 6, lt: -2, lk: 4, tor: 2, hd: -16, ru: 170, re: 10, lu: 166, le: 12, hang: 0 },
    ],
  },
  'drill-climbing-lock-off': {
    still: 0.3,
    ball: null,
    scene: () => ground() + line(40, 22, 150, 22, '#8a9098', 4) + line(40, 22, 40, 0, '#b9bec5', 3) + line(150, 22, 150, 0, '#b9bec5', 3),
    keys: [
      { t: 0, rt: 30, rk: 90, lt: 18, lk: 100, tor: 4, hd: -14, ru: 176, re: 4, lu: 172, le: 6 },
      { t: 0.16, rt: 32, rk: 92, lt: 20, lk: 102, tor: 8, hd: -8, ru: 30, re: 150, lu: 24, le: 154 },
      { t: 0.38, rt: 32, rk: 92, lt: 20, lk: 102, tor: 8, hd: -8, ru: 32, re: 148, lu: 26, le: 152 },
      { t: 0.5, rt: 30, rk: 90, lt: 18, lk: 100, tor: 6, hd: -12, ru: 96, re: 84, lu: 92, le: 88 },
      { t: 0.7, rt: 30, rk: 90, lt: 18, lk: 100, tor: 6, hd: -12, ru: 98, re: 82, lu: 94, le: 86 },
      { t: 0.9, rt: 30, rk: 90, lt: 18, lk: 100, tor: 4, hd: -14, ru: 176, re: 4, lu: 172, le: 6 },
    ],
  },

  // Hiking: with a backpack.
  'drill-hiking-step-up': {
    still: 0.4,
    ball: null,
    scene: () => ground() + `<rect x="98" y="${GROUND - 26}" width="54" height="${29}" rx="2" fill="#d9c7ae" stroke="#9c8466" stroke-width="1.5"/>`,
    keys: [
      { t: 0, hx: 74, rt: 2, rk: 6, lt: -2, lk: 4, tor: 6, ru: 10, re: 20, lu: -6, le: 20, fr: 0, fl: 0 },
      { t: 0.16, hx: 82, rt: 60, rk: 84, lt: -4, lk: 6, tor: 16, ru: -10, re: 30, lu: 20, le: 30, fr: 26, fl: 0 },
      { t: 0.34, hx: 108, rt: 10, rk: 14, lt: -20, lk: 40, tor: 10, ru: 10, re: 30, lu: -6, le: 30, fr: 26, fl: 26 },
      { t: 0.46, hx: 114, rt: 2, rk: 6, lt: -2, lk: 4, tor: 4, ru: 10, re: 20, lu: -6, le: 20, fr: 26, fl: 26 },
      { t: 0.6, hx: 104, rt: 4, rk: 30, lt: -26, lk: 10, tor: 10, ru: 14, re: 20, lu: -6, le: 20, fr: 26, fl: 0 },
      { t: 0.74, hx: 88, rt: 34, rk: 50, lt: -6, lk: 10, tor: 8, ru: 10, re: 20, lu: -6, le: 20, fr: 26, fl: 0 },
      { t: 0.88, hx: 76, rt: 2, rk: 6, lt: -2, lk: 4, tor: 6, ru: 10, re: 20, lu: -6, le: 20, fr: 0, fl: 0 },
    ],
    props: backpack,
  },
  'drill-hiking-lunge': {
    ball: null,
    scene: t => ground() + sliding(t, 45, x => `<ellipse cx="${f1(x)}" cy="${GROUND + 8}" rx="5" ry="2" fill="${SCENE2}"/>`, 5),
    keys: [
      { t: 0, hx: 84, rt: 60, rk: 64, lt: -34, lk: 86, tor: 6, ru: 10, re: 20, lu: -6, le: 20 },
      { t: 0.12, hx: 84, rt: 60, rk: 64, lt: -34, lk: 86, tor: 6, ru: 10, re: 20, lu: -6, le: 20 },
      { t: 0.3, hx: 84, rt: 2, rk: 6, lt: 20, lk: 50, tor: 6, ru: 10, re: 20, lu: -6, le: 20 },
      { t: 0.5, hx: 84, rt: -34, rk: 86, lt: 60, lk: 64, tor: 6, ru: 10, re: 20, lu: -6, le: 20 },
      { t: 0.62, hx: 84, rt: -34, rk: 86, lt: 60, lk: 64, tor: 6, ru: 10, re: 20, lu: -6, le: 20 },
      { t: 0.8, hx: 84, rt: 20, rk: 50, lt: 2, lk: 6, tor: 6, ru: 10, re: 20, lu: -6, le: 20 },
    ],
    props: backpack,
  },

  // Skiing: the legs, off the snow.
  'drill-skiing-wall-sit': {
    still: 0.5,
    ball: null,
    scene: () => `<rect x="0" y="0" width="44" height="${GROUND + 3}" fill="#eceef1"/>` + line(44, 0, 44, GROUND + 3, FRAME, 2.5) + ground(),
    keys: [
      { t: 0, hx: 58, rt: 2, rk: 4, lt: -2, lk: 4, tor: 0, ru: 10, re: 20, lu: -4, le: 20 },
      { t: 0.2, hx: 58, rt: 86, rk: 86, lt: 84, lk: 84, tor: 0, ru: 70, re: 6, lu: 66, le: 6 },
      { t: 0.5, hx: 58, rt: 88, rk: 88, lt: 86, lk: 86, tor: 0, ru: 72, re: 4, lu: 68, le: 4 },
      { t: 0.8, hx: 58, rt: 86, rk: 86, lt: 84, lk: 84, tor: 0, ru: 70, re: 6, lu: 66, le: 6 },
    ],
  },
  'drill-skiing-squat-jump': {
    still: 0.3,
    ball: null, scene: () => ground('#dfe6ee'),
    keys: [
      { t: 0, hx: 84, rt: 76, rk: 104, lt: 72, lk: 100, tor: 40, hd: -24, ru: -30, re: 10, lu: -36, le: 10 },
      { t: 0.18, hx: 84, rt: 2, rk: 4, lt: 0, lk: 3, tor: 4, jump: 0, ru: 150, re: 10, lu: 146, le: 12 },
      { t: 0.32, hx: 84, rt: 6, rk: 14, lt: 4, lk: 12, tor: 4, jump: 26, ru: 160, re: 10, lu: 156, le: 12 },
      { t: 0.46, hx: 84, rt: 10, rk: 18, lt: 8, lk: 16, tor: 8, jump: 0, ru: 60, re: 20, lu: 56, le: 20 },
      { t: 0.66, hx: 84, rt: 74, rk: 102, lt: 70, lk: 98, tor: 38, hd: -22, ru: 50, re: 30, lu: 46, le: 30 },
      { t: 0.82, hx: 84, rt: 76, rk: 104, lt: 72, lk: 100, tor: 40, hd: -24, ru: -30, re: 10, lu: -36, le: 10 },
    ],
  },
}

// Hanging drills: the hands on the board or bar; the hangboard's figure (hang 0) stands below it
// between hangs, and goes from one to the other smoothly.
function hangOrStand(x, y) {
  return p => {
    const h = handsOn(p, x, y)
    const k = Math.max(0, Math.min(1, p.hang))
    if (k >= 1) return h
    const st = skeleton({ ...p, hy: null, hx: h.hx })
    return { hx: h.hx, hy: st.hip[1] + (h.hy - st.hip[1]) * k }
  }
}
DRILLS['drill-climbing-hangboard'].place = hangOrStand(93, 12)
DRILLS['drill-climbing-lock-off'].place = p => handsOn(p, 95, 22)
