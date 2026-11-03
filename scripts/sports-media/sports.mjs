// Olympus: the thirteen sports of the animations (see engine.mjs): key poses, a ball or racket, and a scene.
// Each key is { t, ...pose fields } between 0 and 1; the figure goes through them and back to the first.
// `over(t, pose)` replaces fields of the keyed pose where a cycle (a stride) is easier to write as a formula.
import { GROUND } from './engine.mjs'

const BALL_Y = GROUND - 7
const sin = x => Math.sin(x)
const TAU = Math.PI * 2

// A running or walking stride: the legs by phase, the arms swinging against them.
const stride = (t, cycles, { amp = 30, bend = 55, arms = 0, lean = null } = {}) => {
  const f = TAU * cycles * t
  const leg = ph => ({ th: amp * sin(f + ph), kn: bend * 0.55 + bend * 0.45 * Math.cos(f + ph - 0.9) })
  const r = leg(0), l = leg(Math.PI)
  const out = { rt: r.th, rk: Math.max(4, r.kn), lt: l.th, lk: Math.max(4, l.kn) }
  if (arms) { out.ru = -arms * sin(f + 0); out.lu = arms * sin(f + 0) }
  if (lean != null) out.tor = lean
  return out
}

export const SPORTS = {
  'sport-football': {
    ball: 'soccer', scene: 'football',
    keys: [
      { t: 0, rt: 2, rk: 8, lt: -4, lk: 6, tor: 4, ru: -10, re: 25, lu: 14, le: 25, bx: 140, by: BALL_Y, bf: 1, bo: 1 },
      { t: 0.28, rt: -32, rk: 88, lt: 6, lk: 14, tor: 12, ru: 38, re: 30, lu: -38, le: 20, bx: 140, by: BALL_Y, bf: 1, bo: 1 },
      { t: 0.42, rt: 58, rk: 6, lt: 4, lk: 16, tor: 2, ru: -36, re: 20, lu: 34, le: 25, bx: 140, by: BALL_Y, bf: 1, bo: 1 },
      { t: 0.5, rt: 80, rk: 4, lt: 2, lk: 14, tor: -4, ru: -40, re: 20, lu: 40, le: 20, bx: 150, by: 138, bf: 1, bo: 1 },
      { t: 0.62, rt: 66, rk: 12, lt: 2, lk: 12, tor: -2, ru: -30, re: 20, lu: 30, le: 20, bx: 184, by: 98, bf: 1, bo: 1 },
      { t: 0.7, rt: 30, rk: 25, lt: 2, lk: 10, tor: 2, ru: -16, re: 20, lu: 16, le: 20, bx: 200, by: 70, bf: 1, bo: 0 },
      { t: 0.84, rt: 6, rk: 10, lt: -2, lk: 6, bx: 140, by: BALL_Y, bf: 1, bo: 0 },
      { t: 0.93, bx: 140, by: BALL_Y, bf: 1, bo: 1 },
    ],
  },
  'sport-basketball': {
    ball: 'basket', scene: 'basketball',
    keys: [
      { t: 0, rt: 30, rk: 60, lt: 24, lk: 54, tor: 16, hd: -6, ru: 62, re: 96, lu: 50, le: 100, bf: 0, bo: 1 },
      { t: 0.28, rt: 44, rk: 82, lt: 36, lk: 74, tor: 22, hd: -8, ru: 58, re: 100, lu: 48, le: 104, bf: 0, bo: 1 },
      { t: 0.42, rt: 4, rk: 6, lt: 0, lk: 4, tor: 2, jump: 14, hd: -10, ru: 150, re: 30, lu: 130, le: 50, bf: 0, bo: 1 },
      { t: 0.5, rt: 0, rk: 4, lt: -4, lk: 3, tor: 0, jump: 20, hd: -12, ru: 168, re: 6, lu: 150, le: 20, bf: 0, bo: 1, bx: 150, by: 52, arc: 26 },
      { t: 0.68, rt: 12, rk: 20, lt: 8, lk: 16, tor: 4, jump: 6, ru: 160, re: 4, lu: 120, le: 30, bf: 0.92, bo: 1, bx: 150, by: 52, arc: 26 },
      { t: 0.76, rt: 22, rk: 34, lt: 16, lk: 28, tor: 8, jump: 0, ru: 100, re: 40, lu: 80, le: 50, bf: 1, bo: 0, bx: 150, by: 70, arc: 0 },
      { t: 0.9, rt: 8, rk: 14, lt: 4, lk: 10, tor: 6, ru: 40, re: 70, lu: 40, le: 80, bf: 0, bo: 0, arc: 0 },
    ],
  },
  'sport-swimming': {
    ball: null, scene: 'swimming',
    keys: [{ t: 0 }],
    over: t => {
      const stroke = (t * 2) % 1
      const arm = ph => { const k = (stroke + ph) % 1; return { u: 110 - 360 * k, e: k < 0.55 ? 28 : 70 } }
      const r = arm(0), l = arm(0.5)
      const kick = sin(TAU * 6 * t)
      return { hx: 100, hy: 104 + 2 * sin(TAU * 2 * t), tor: 86 + 2.5 * sin(TAU * 2 * t + 1), hd: -2, ru: r.u, re: r.e, lu: l.u, le: l.e,
        rt: -83 + 7 * kick, rk: 10 + 10 * Math.max(0, kick), lt: -83 - 7 * kick, lk: 10 + 10 * Math.max(0, -kick) }
    },
  },
  'sport-tennis': {
    ball: 'tennis', racket: 'tennis', scene: 'tennis',
    keys: [
      { t: 0, hx: 66, rt: 16, rk: 30, lt: 10, lk: 24, tor: 10, ru: 40, re: 60, lu: 55, le: 40, ra: -20, ro: 1, bx: 134, by: 14, bf: 1, bo: 0 },
      { t: 0.14, hx: 66, rt: 16, rk: 32, lt: 10, lk: 26, tor: 4, ru: -10, re: 70, lu: 62, le: 40, ra: -10, ro: 1, bx: 138, by: 24, bf: 1, bo: 1 },
      { t: 0.26, hx: 66, rt: 18, rk: 40, lt: 8, lk: 28, tor: -10, ru: -46, re: 72, lu: 66, le: 36, ra: -6, ro: 1, bx: 142, by: 54, bf: 1, bo: 1 },
      { t: 0.42, hx: 66, rt: 14, rk: 26, lt: 8, lk: 20, tor: 24, ru: 78, re: 10, lu: 20, le: 40, ra: -26, ro: 1, bx: 150, by: 86, bf: 1, bo: 1 },
      { t: 0.52, hx: 66, rt: 10, rk: 18, lt: 6, lk: 14, tor: 34, ru: 120, re: 40, lu: 10, le: 50, ra: 10, ro: 1, bx: 200, by: 66, bf: 1, bo: 1 },
      { t: 0.6, hx: 66, rt: 8, rk: 14, lt: 4, lk: 10, tor: 26, ru: 150, re: 50, lu: 20, le: 50, ra: 30, ro: 1, bx: 220, by: 58, bf: 1, bo: 0 },
      { t: 0.8, hx: 66, rt: 14, rk: 26, lt: 8, lk: 22, tor: 12, ru: 60, re: 60, lu: 50, le: 40, ra: -10, ro: 1, bx: 134, by: 14, bf: 1, bo: 0 },
    ],
  },
  'sport-padel': {
    ball: 'tennis', racket: 'padel', scene: 'padel',
    keys: [
      { t: 0, hx: 66, rt: 20, rk: 40, lt: 12, lk: 32, tor: 12, ru: 40, re: 70, lu: 55, le: 40, ra: -15, ro: 1, bx: 140, by: 40, bf: 1, bo: 0 },
      { t: 0.14, hx: 66, rt: 20, rk: 42, lt: 12, lk: 34, tor: 6, ru: -6, re: 74, lu: 62, le: 40, ra: -8, ro: 1, bx: 144, by: 54, bf: 1, bo: 1 },
      { t: 0.28, hx: 66, rt: 22, rk: 48, lt: 10, lk: 36, tor: -6, ru: -40, re: 76, lu: 66, le: 36, ra: -4, ro: 1, bx: 146, by: 84, bf: 1, bo: 1 },
      { t: 0.44, hx: 66, rt: 18, rk: 36, lt: 10, lk: 28, tor: 24, ru: 74, re: 14, lu: 20, le: 40, ra: -24, ro: 1, bx: 152, by: 104, bf: 1, bo: 1 },
      { t: 0.54, hx: 66, rt: 14, rk: 28, lt: 8, lk: 22, tor: 30, ru: 100, re: 30, lu: 14, le: 50, ra: 4, ro: 1, bx: 172, by: 80, bf: 1, bo: 1 },
      { t: 0.64, hx: 66, rt: 12, rk: 24, lt: 6, lk: 18, tor: 24, ru: 130, re: 44, lu: 20, le: 50, ra: 20, ro: 1, bx: 150, by: 60, bf: 1, bo: 1 },
      { t: 0.74, hx: 66, rt: 14, rk: 28, lt: 8, lk: 22, tor: 16, ru: 90, re: 60, lu: 40, le: 40, ra: 0, ro: 1, bx: 120, by: 80, bf: 1, bo: 0 },
      { t: 0.88, hx: 66, rt: 20, rk: 40, lt: 12, lk: 32, tor: 12, ru: 40, re: 70, lu: 55, le: 40, ra: -15, ro: 1, bx: 140, by: 40, bf: 1, bo: 0 },
    ],
  },
  'sport-volleyball': {
    ball: 'volley', scene: 'volleyball',
    keys: [
      { t: 0, hx: 80, rt: 22, rk: 36, lt: 16, lk: 30, tor: 8, ru: 30, re: 40, lu: 30, le: 40, bx: 40, by: 8, bf: 1, bo: 0 },
      { t: 0.16, hx: 80, rt: 24, rk: 40, lt: 18, lk: 34, tor: 8, hd: -8, ru: 60, re: 40, lu: 60, le: 40, bx: 96, by: 20, bf: 1, bo: 1 },
      { t: 0.32, hx: 80, rt: 40, rk: 74, lt: 34, lk: 68, tor: 18, hd: -8, ru: -34, re: 18, lu: -38, le: 20, bx: 112, by: 22, bf: 1, bo: 1 },
      { t: 0.44, hx: 80, rt: 6, rk: 10, lt: 2, lk: 8, tor: 0, jump: 22, hd: -12, ru: 140, re: 100, lu: 150, le: 20, bx: 114, by: 22, bf: 1, bo: 1 },
      { t: 0.5, hx: 80, rt: 8, rk: 14, lt: 6, lk: 16, tor: 6, jump: 24, hd: -14, ru: 172, re: 4, lu: 120, le: 30, bx: 118, by: 22, bf: 1, bo: 1 },
      { t: 0.6, hx: 80, rt: 12, rk: 20, lt: 8, lk: 18, tor: 12, jump: 14, hd: -6, ru: 140, re: 10, lu: 80, le: 40, bx: 160, by: 100, bf: 1, bo: 1 },
      { t: 0.68, hx: 80, rt: 24, rk: 38, lt: 18, lk: 32, tor: 10, jump: 0, ru: 70, re: 30, lu: 60, le: 30, bx: 172, by: 140, bf: 1, bo: 0 },
      { t: 0.86, hx: 80, rt: 22, rk: 36, lt: 16, lk: 30, tor: 8, ru: 30, re: 40, lu: 30, le: 40, bx: 40, by: 8, bf: 1, bo: 0 },
    ],
  },
  'sport-rugby': {
    ball: 'rugby', scene: 'rugby',
    keys: [
      { t: 0, tor: 14, ru: 38, re: 82, lu: 40, le: 84, bf: 0, bo: 1, bx: 190, by: 80, arc: 14 },
      { t: 0.5, tor: 14, ru: 38, re: 82, lu: 40, le: 84, bf: 0, bo: 1, bx: 190, by: 80, arc: 14 },
      { t: 0.62, tor: 26, ru: 84, re: 24, lu: 90, le: 26, bf: 0, bo: 1, bx: 190, by: 80, arc: 14 },
      { t: 0.74, tor: 22, ru: 96, re: 14, lu: 96, le: 16, bf: 0.45, bo: 1, bx: 190, by: 80, arc: 14 },
      { t: 0.82, tor: 18, ru: 70, re: 30, lu: 70, le: 30, bf: 1, bo: 0, bx: 190, by: 80, arc: 14 },
      { t: 0.92, tor: 14, ru: 38, re: 82, lu: 40, le: 84, bf: 0, bo: 0, bx: 190, by: 80, arc: 14 },
    ],
    over: t => stride(t, 2, { amp: 34, bend: 70, lean: null }),
  },
  'sport-handball': {
    ball: 'handball', scene: 'handball',
    keys: [
      { t: 0, hx: 70, rt: 22, rk: 40, lt: -16, lk: 40, tor: 12, ru: 130, re: 100, lu: 60, le: 40, bf: 0, bo: 1, bx: 176, by: 96, arc: 24 },
      { t: 0.22, hx: 70, rt: 36, rk: 70, lt: -8, lk: 60, tor: 14, ru: 140, re: 110, lu: 80, le: 40, bf: 0, bo: 1, bx: 176, by: 96, arc: 24 },
      { t: 0.38, hx: 70, rt: 62, rk: 96, lt: -4, lk: 14, tor: 2, jump: 18, hd: -8, ru: 150, re: 100, lu: 100, le: 40, bf: 0, bo: 1, bx: 176, by: 96, arc: 24 },
      { t: 0.5, hx: 70, rt: 40, rk: 60, lt: -6, lk: 10, tor: 12, jump: 22, hd: -8, ru: 170, re: 8, lu: 70, le: 40, bf: 0.1, bo: 1, bx: 176, by: 96, arc: 24 },
      { t: 0.62, hx: 70, rt: 24, rk: 40, lt: 2, lk: 12, tor: 16, jump: 14, ru: 130, re: 10, lu: 50, le: 40, bf: 0.8, bo: 1, bx: 176, by: 96, arc: 24 },
      { t: 0.7, hx: 70, rt: 20, rk: 36, lt: 4, lk: 20, tor: 14, jump: 6, ru: 80, re: 20, lu: 40, le: 40, bf: 1, bo: 0, bx: 176, by: 96, arc: 0 },
      { t: 0.86, hx: 70, rt: 20, rk: 36, lt: -14, lk: 36, tor: 12, ru: 130, re: 100, lu: 60, le: 40, bf: 0, bo: 0, bx: 176, by: 96, arc: 0 },
    ],
  },
  'sport-badminton': {
    ball: null, racket: 'badminton', scene: 'badminton',
    keys: [
      { t: 0, hx: 80, rt: 14, rk: 26, lt: 8, lk: 20, tor: 6, ru: 70, re: 70, lu: 50, le: 30, ra: -30, ro: 1, sx: 100, sy: 6, so: 0, sa: 20 },
      { t: 0.14, hx: 80, rt: 18, rk: 32, lt: 10, lk: 24, tor: 2, hd: -8, ru: 120, re: 80, lu: 100, le: 20, ra: -20, ro: 1, sx: 108, sy: 12, so: 1, sa: 20 },
      { t: 0.3, hx: 80, rt: 30, rk: 60, lt: 22, lk: 50, tor: -4, hd: -12, ru: 150, re: 100, lu: 120, le: 20, ra: -20, ro: 1, sx: 112, sy: 24, so: 1, sa: 20 },
      { t: 0.44, hx: 80, rt: 6, rk: 10, lt: 2, lk: 8, tor: 6, jump: 16, hd: -14, ru: 170, re: 10, lu: 100, le: 30, ra: -8, ro: 1, sx: 116, sy: 24, so: 1, sa: 20 },
      { t: 0.52, hx: 80, rt: 8, rk: 14, lt: 4, lk: 12, tor: 10, jump: 14, ru: 150, re: 20, lu: 70, le: 30, ra: 14, ro: 1, sx: 150, sy: 74, so: 1, sa: 130 },
      { t: 0.6, hx: 80, rt: 12, rk: 20, lt: 8, lk: 16, tor: 10, jump: 6, ru: 110, re: 30, lu: 60, le: 30, ra: 20, ro: 1, sx: 176, sy: 126, so: 0, sa: 130 },
      { t: 0.8, hx: 80, rt: 14, rk: 26, lt: 8, lk: 20, tor: 6, ru: 70, re: 70, lu: 50, le: 30, ra: -30, ro: 1, sx: 100, sy: 6, so: 0, sa: 20 },
    ],
  },
  'sport-table-tennis': {
    ball: 'tt', racket: 'tt', scene: 'tabletennis',
    keys: [
      { t: 0, hx: 40, rt: 22, rk: 40, lt: 14, lk: 32, tor: 22, hd: 6, ru: 50, re: 80, lu: 40, le: 50, ra: -10, ro: 1, bx: 178, by: 62, bf: 1, bo: 0 },
      { t: 0.1, hx: 40, rt: 22, rk: 40, lt: 14, lk: 32, tor: 22, hd: 6, ru: 44, re: 84, lu: 40, le: 50, ra: -10, ro: 1, bx: 176, by: 70, bf: 1, bo: 1 },
      { t: 0.22, hx: 40, rt: 22, rk: 40, lt: 14, lk: 32, tor: 18, hd: 6, ru: 14, re: 84, lu: 44, le: 50, ra: -10, ro: 1, bx: 150, by: 104, bf: 1, bo: 1 },
      { t: 0.36, hx: 40, rt: 22, rk: 40, lt: 14, lk: 32, tor: 26, hd: 6, ru: 56, re: 50, lu: 30, le: 50, ra: -14, ro: 1, bx: 100, by: 84, bf: 1, bo: 1 },
      { t: 0.46, hx: 40, rt: 20, rk: 38, lt: 12, lk: 30, tor: 30, hd: 6, ru: 76, re: 30, lu: 24, le: 50, ra: -10, ro: 1, bx: 90, by: 88, bf: 1, bo: 1 },
      { t: 0.56, hx: 40, rt: 22, rk: 40, lt: 14, lk: 32, tor: 24, hd: 6, ru: 66, re: 50, lu: 34, le: 50, ra: -10, ro: 1, bx: 116, by: 104, bf: 1, bo: 1 },
      { t: 0.74, hx: 40, rt: 22, rk: 40, lt: 14, lk: 32, tor: 22, hd: 6, ru: 50, re: 70, lu: 40, le: 50, ra: -10, ro: 1, bx: 164, by: 78, bf: 1, bo: 1 },
      { t: 0.84, hx: 40, ru: 50, re: 80, lu: 40, le: 50, rt: 22, rk: 40, lt: 14, lk: 32, tor: 22, hd: 6, ra: -10, ro: 1, bx: 190, by: 70, bf: 1, bo: 0 },
    ],
  },
  'sport-climbing': {
    ball: null, scene: 'climbing',
    keys: [
      { t: 0, hx: 84, hy: 96, tor: 12, hd: -10, rt: 52, rk: 96, lt: 6, lk: 40, ru: 168, re: 6, lu: 100, le: 70, scroll: 0 },
      { t: 0.25, hx: 84, hy: 90, tor: 14, hd: -10, rt: 26, rk: 50, lt: 6, lk: 40, ru: 160, re: 10, lu: 128, le: 40, scroll: 0.25 },
      { t: 0.5, hx: 84, hy: 96, tor: 12, hd: -10, rt: 6, rk: 40, lt: 52, lk: 96, ru: 100, re: 70, lu: 168, le: 6, scroll: 0.5 },
      { t: 0.75, hx: 84, hy: 90, tor: 14, hd: -10, rt: 6, rk: 40, lt: 26, lk: 50, ru: 128, re: 40, lu: 160, le: 10, scroll: 0.75 },
    ],
  },
  'sport-hiking': {
    ball: null, scene: 'hiking',
    keys: [{ t: 0, tor: 12, hd: 2, scroll: 0 }, { t: 0.5, tor: 12, hd: 2, scroll: 0.5 }],
    over: t => ({ ...stride(t, 2, { amp: 24, bend: 36 }), tor: 11, ru: 26 * sin(TAU * 2 * t + Math.PI), re: 14, lu: 26 * sin(TAU * 2 * t), le: 14, scroll: t }),
  },
  'sport-skiing': {
    ball: null, scene: 'skiing',
    keys: [
      { t: 0, hx: 82, rt: 44, rk: 62, lt: 38, lk: 54, tor: 30, hd: -14, ru: 60, re: 40, lu: 50, le: 40, scroll: 0 },
      { t: 0.5, hx: 98, rt: 50, rk: 70, lt: 44, lk: 62, tor: 34, hd: -14, ru: 70, re: 40, lu: 40, le: 40, scroll: 0.5 },
    ],
  },
}
