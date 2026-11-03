// Olympus: draws the sports animations (engine.mjs, sports.mjs) into frontend/src/assets/sports/:
// <id>.mp4 (180 px, 10 frames a second, 3 s loop, like the exercise clips) and <id>.webp (the still).
// Run: NODE_PATH=$(npm root -g) node scripts/sports-media/render.mjs [sport-id ...] [--sheet]
// (Playwright draws the frames, ffmpeg joins them). --sheet writes a contact sheet to look at instead.
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { SIZE, GROUND, poseAt, skeleton, figureSvg, partWeights } from './engine.mjs'
import { SPORTS as SPORT_DEFS } from './sports.mjs'
import { SPORTS as CATALOGUE } from '../../frontend/src/lib/sports.js'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const here = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.resolve(here, '../../frontend/src/assets/sports')
const FRAMES = 30

const SCENE = '#cfd3d8', SCENE2 = '#e6e8eb', WATER = '#9ec5e3'
const line = (x1, y1, x2, y2, c = SCENE, w = 2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/>`
const net = (x, top, bottom, w = 24) => {
  let s = line(x, top, x, bottom, '#b9bec5', 3)
  for (let y = top + 4; y < bottom; y += 6) s += line(x - w * 0.0, y, x + w, y + 2, SCENE2, 1)
  for (let dx = 4; dx <= w; dx += 6) s += line(x + dx, top, x + dx, bottom, SCENE2, 1)
  return s
}
const ground = (c = SCENE) => line(6, GROUND + 3, SIZE - 6, GROUND + 3, c, 2.5)
const mesh = (x1, y1, x2, y2, step = 7) => {
  let s = ''
  for (let x = x1; x <= x2; x += step) s += line(x, y1, x, y2, SCENE2, 1)
  for (let y = y1; y <= y2; y += step) s += line(x1, y, x2, y, SCENE2, 1)
  return s
}
const goal = (x, top) => line(x, top, x, GROUND + 3, '#b9bec5', 3) + line(x, top, SIZE - 2, top, '#b9bec5', 3) + mesh(x + 3, top + 3, SIZE - 4, GROUND, 8)

const SCENES = {
  football: () => ground() + goal(150, 96),
  basketball: () => ground() + line(170, 28, 170, 62, '#b9bec5', 4) + line(172, 60, 172, 152, SCENE, 3)
    + `<rect x="164" y="30" width="8" height="30" rx="1.5" fill="#eef0f2" stroke="#b9bec5" stroke-width="1.5"/>`
    + line(150, 50, 165, 50, '#d97b2f', 3) + line(150, 50, 154, 66, SCENE, 1.2) + line(158, 50, 156, 66, SCENE, 1.2) + line(154, 66, 156, 66, SCENE, 1.2),
  swimming: t => {
    let w = ''
    for (let i = 0; i < 5; i++) { const y = 108 + i * 12, off = ((t * 2 + i * 0.3) % 1) * 24; let d = `M${-24 + off} ${y}`; for (let x = -24 + off; x < 210; x += 24) d += ` q6 -4 12 0 t12 0`; w += `<path d="${d}" fill="none" stroke="${WATER}" stroke-width="1.6" opacity="${0.8 - i * 0.1}"/>` }
    return w
  },
  tennis: () => ground() + net(168, 106, 152, 10) + line(168, 104, 178, 104, '#b9bec5', 3),
  padel: () => ground() + `<rect x="168" y="40" width="10" height="112" fill="#e9f1f7" stroke="#c3d3e0" stroke-width="1.5"/>` + line(173, 40, 173, 152, '#fff', 1.5) + line(10, GROUND + 3, 168, GROUND + 3, SCENE, 2.5),
  volleyball: () => ground() + line(150, 66, 150, 152, '#b9bec5', 3) + mesh(150, 70, 176, 96, 6) + line(150, 70, 176, 70, '#b9bec5', 3) + line(150, 96, 176, 96, '#c9cdd2', 1.5),
  rugby: t => ground() + (() => { let s = ''; for (let i = 0; i < 4; i++) { const x = ((i * 50 - t * 100) % 200 + 200) % 200 - 10; s += line(x, GROUND + 9, x + 14, GROUND + 9, SCENE2, 2) } return s })(),
  handball: () => ground() + goal(158, 98) + line(112, GROUND + 3, 112, GROUND - 3, SCENE, 1.5),
  badminton: () => ground() + line(150, 104, 150, 152, '#b9bec5', 3) + mesh(150, 104, 176, 118, 5) + line(150, 104, 176, 104, '#f2f2f2', 3) + line(150, 104, 176, 104, '#c9cdd2', 1),
  tabletennis: () => line(6, GROUND + 3, SIZE - 6, GROUND + 3, SCENE, 2.5)
    + `<rect x="82" y="108" width="98" height="5" rx="1.5" fill="#6f94b0"/>` + line(88, 113, 88, 152, '#b9bec5', 3) + line(172, 113, 172, 152, '#b9bec5', 3)
    + line(131, 98, 131, 108, '#b9bec5', 2.5) + line(131, 98, 131, 108, '#fff', 1),
  climbing: t => {
    let s = `<rect x="126" y="0" width="60" height="180" fill="#eceef1"/>` + line(126, 0, 126, 180, '#b9bec5', 2)
    const cols = ['#e9b8b3', '#b5cde6', '#bfe0b0', '#f1d9a3', '#cbbbe6']
    for (let r = -1; r < 9; r++) for (const [dx, off] of [[142, 0], [164, 14], [152, 30]]) {
      const y = ((r * 28 + off + t * 56 * 2) % 252) - 12
      s += `<circle cx="${dx}" cy="${y}" r="4.6" fill="${cols[(r + dx) % 5 < 0 ? 0 : (r + dx) % 5]}" stroke="#b9bec5" stroke-width="1"/>`
    }
    return s + line(6, GROUND + 3, 126, GROUND + 3, SCENE, 2.5)
  },
  hiking: t => {
    let s = `<path d="M-4 112 L40 64 L74 104 L104 74 L150 114 L190 80 L190 120 L-4 120Z" fill="#eceef1"/>` + ground()
    for (let i = 0; i < 6; i++) { const x = (((i * 36 - t * 108) % 216) + 216) % 216 - 18; s += `<ellipse cx="${x}" cy="${GROUND + 8}" rx="5" ry="2" fill="${SCENE2}"/>` + line(x - 4, GROUND - 4, x - 4, GROUND, '#c9d2c0', 2) }
    return s
  },
  skiing: t => {
    let s = ground('#dfe6ee')
    for (let i = 0; i < 4; i++) { const x = (((i * 60 - t * 120) % 240) + 240) % 240 - 20; s += `<path d="M${x} ${GROUND - 2} l8 -34 l8 34Z" fill="#d6dde3"/>` + line(x + 8, GROUND - 2, x + 8, GROUND + 3, '#b9bec5', 2) }
    return s
  },
}

function ball(kind, x, y, s, o) {
  if (!kind || o <= 0.01) return ''
  const r = { soccer: 8, basket: 8.5, volley: 8.5, handball: 7.5, tennis: 4.4, tt: 3.4, rugby: 0 }[kind] * s
  const g = (inner) => `<g opacity="${o.toFixed(2)}">${inner}</g>`
  if (kind === 'soccer') return g(`<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" stroke="#6b7078" stroke-width="1.6"/><path d="M${x} ${y - 3.2} l3 2.2 -1.2 3.4 h-3.6 l-1.2 -3.4Z" fill="#4b5058"/>`)
  if (kind === 'basket') return g(`<circle cx="${x}" cy="${y}" r="${r}" fill="#e98a3c" stroke="#8a4a14" stroke-width="1.4"/><path d="M${x - r} ${y} h${2 * r} M${x} ${y - r} v${2 * r}" stroke="#8a4a14" stroke-width="1.1"/><path d="M${x - r * 0.7} ${y - r * 0.7} q${r * 0.7} ${r * 0.7} 0 ${r * 1.4} M${x + r * 0.7} ${y - r * 0.7} q${-r * 0.7} ${r * 0.7} 0 ${r * 1.4}" fill="none" stroke="#8a4a14" stroke-width="1"/>`)
  if (kind === 'volley') return g(`<circle cx="${x}" cy="${y}" r="${r}" fill="#f4e7a8" stroke="#8c8a6c" stroke-width="1.4"/><path d="M${x - r} ${y} q${r} -${r * 0.8} ${2 * r} 0 M${x - r * 0.6} ${y - r * 0.8} q${r * 0.8} ${r * 0.9} ${r * 0.2} ${r * 1.7}" fill="none" stroke="#6f9ac7" stroke-width="1.5"/>`)
  if (kind === 'handball') return g(`<circle cx="${x}" cy="${y}" r="${r}" fill="#dfe8f4" stroke="#5f7b9c" stroke-width="1.5"/><path d="M${x - r} ${y} h${2 * r}" stroke="#5f7b9c" stroke-width="1.1"/>`)
  if (kind === 'tennis') return g(`<circle cx="${x}" cy="${y}" r="${r}" fill="#d6e84a" stroke="#8a9a1c" stroke-width="1.1"/><path d="M${x - r * 0.8} ${y - r * 0.5} q${r * 0.8} ${r * 0.5} ${r * 1.6} 0" fill="none" stroke="#fff" stroke-width="1"/>`)
  if (kind === 'tt') return g(`<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" stroke="#9aa0a8" stroke-width="1.1"/>`)
  if (kind === 'rugby') return g(`<ellipse cx="${x}" cy="${y}" rx="${10 * s}" ry="${6 * s}" fill="#b9753e" stroke="#6d3f17" stroke-width="1.4" transform="rotate(-18 ${x} ${y})"/><path d="M${x - 3} ${y + 1} l6 -2.2 M${x - 1.5} ${y + 3} l1.4 -5" stroke="#f2e6d6" stroke-width="1.1" transform="rotate(-18 ${x} ${y})"/>`)
  return ''
}

function racket(kind, s, p) {
  if (!kind || p.ro <= 0.01) return ''
  const w = s.RA.wrist, phi = (s.RA.fa + p.ra) * Math.PI / 180
  const d = [Math.sin(phi), Math.cos(phi)]
  const at = k => [w[0] + d[0] * k, w[1] + d[1] * k]
  const shaft = { tennis: 24, padel: 14, badminton: 34, tt: 9 }[kind]
  const head = at(shaft + { tennis: 14, padel: 12, badminton: 12, tt: 6 }[kind])
  const ang = Math.atan2(d[1], d[0]) * 180 / Math.PI
  const frame = '#6b7078'
  let out = `<line x1="${w[0].toFixed(1)}" y1="${w[1].toFixed(1)}" x2="${at(shaft).map(v => v.toFixed(1)).join('" y2="')}" stroke="${frame}" stroke-width="2.4" stroke-linecap="round"/>`
  const el = (rx, ry, fill) => `<ellipse cx="${head[0].toFixed(1)}" cy="${head[1].toFixed(1)}" rx="${rx}" ry="${ry}" transform="rotate(${ang.toFixed(1)} ${head[0].toFixed(1)} ${head[1].toFixed(1)})" fill="${fill}" stroke="${frame}" stroke-width="2.2"/>`
  if (kind === 'tennis') out += el(14, 10, '#f3f5f7')
  if (kind === 'padel') out += el(12, 12, '#d9dde2') + `<circle cx="${head[0].toFixed(1)}" cy="${head[1].toFixed(1)}" r="3" fill="none" stroke="#fff" stroke-width="1.6"/>`
  if (kind === 'badminton') out += el(12, 8, '#f3f5f7')
  if (kind === 'tt') out += el(6.2, 6.2, '#c94a42')
  return out
}

function shuttle(x, y, a, o) {
  if (o <= 0.01) return ''
  return `<g opacity="${o.toFixed(2)}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${a})"><path d="M0 -3 L-4 5 L4 5Z" fill="#fff" stroke="#8a9098" stroke-width="1.2" stroke-linejoin="round"/><circle cx="0" cy="-4" r="2.4" fill="#e3b96b" stroke="#8a9098" stroke-width="1"/></g>`
}

function framesOf(id) {
  const def = SPORT_DEFS[id]
  const w = partWeights(CATALOGUE.find(s => s.id === id).muscleWeights)
  const out = []
  for (let i = 0; i < FRAMES; i++) {
    const t = i / FRAMES
    let p = poseAt(def.keys, t)
    if (def.over) { const o = def.over(t, p); p = { ...p, ...(Object.fromEntries(Object.entries({ hx: o.hx, hy: o.hy, tor: o.tor, hd: o.hd, rt: o.rt, rk: o.rk, lt: o.lt, lk: o.lk, ru: o.ru, re: o.re, lu: o.lu, le: o.le, scroll: o.scroll }).filter(([, v]) => v !== undefined))) } }
    const { svg, s } = figureSvg(p, w)
    const back = (SCENES[def.scene] || (() => ground()))(p.scroll ?? t)
    // a soft shadow under the feet
    const shadow = def.scene === 'swimming' || def.scene === 'climbing' ? '' : `<ellipse cx="${s.hip[0].toFixed(1)}" cy="${GROUND + 3}" rx="${22}" ry="3" fill="#000" opacity=".07"/>`
    // the ball: held (bf 0) or flying (bf 1), the flight an arc
    let balls = ''
    if (def.ball) {
      const attached = [s.RA.wrist[0] + Math.sin(s.RA.fa * Math.PI / 180) * 6, s.RA.wrist[1] + Math.cos(s.RA.fa * Math.PI / 180) * 6 - 4]
      const k = p.bf
      const x = attached[0] * (1 - k) + p.bx * k
      const y = attached[1] * (1 - k) + p.by * k - (p.arc || 0) * Math.sin(Math.PI * k)
      balls = ball(def.ball, x.toFixed(1), y.toFixed(1), p.bs, Math.max(0, Math.min(1, p.bo)))
    }
    let extra = ''
    if (def.scene === 'hiking') {
      const pole = (A, tilt) => line(A.wrist[0].toFixed(1), A.wrist[1].toFixed(1), (A.wrist[0] - 16 + tilt).toFixed(1), GROUND + 3, '#8a9098', 2)
      extra = pole(s.LA, -6) + pole(s.RA, 2) + `<rect x="${(s.sh[0] - 17).toFixed(1)}" y="${(s.sh[1] - 2).toFixed(1)}" width="11" height="26" rx="4" transform="rotate(${(p.tor * 0.6).toFixed(1)} ${s.sh[0].toFixed(1)} ${s.sh[1].toFixed(1)})" fill="#c98f6a" stroke="#8a5a3a" stroke-width="1.2"/>`
    }
    if (def.scene === 'skiing') {
      const pole = A => line(A.wrist[0].toFixed(1), A.wrist[1].toFixed(1), (A.wrist[0] - 26).toFixed(1), GROUND + 2, '#8a9098', 2)
      const ski = (x, y) => line(x - 30, y, x + 36, y, '#7d848d', 3.2)
      extra = pole(s.LA) + pole(s.RA) + ski(s.L.ankle[0], GROUND + 2) + ski(s.R.ankle[0] + 2, GROUND + 3)
    }
    const front = def.scene === 'swimming' ? `<rect x="0" y="${(106 + 1.2 * Math.sin(TAU(t))).toFixed(1)}" width="${SIZE}" height="80" fill="${WATER}" opacity=".32"/>` : ''
    const svgFull = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}"><rect width="${SIZE}" height="${SIZE}" fill="#fff"/>${back}${shadow}${extra}${svg}${racket(def.racket, s, p)}${shuttle(p.sx, p.sy, p.sa, p.so)}${balls}${front}</svg>`
    out.push(svgFull)
  }
  return out
}
const TAU = t => t * Math.PI * 4

async function main() {
  const args = process.argv.slice(2)
  const sheet = args.includes('--sheet')
  const ids = args.filter(a => !a.startsWith('--'))
  const list = ids.length ? ids : Object.keys(SPORT_DEFS)
  fs.mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE }, deviceScaleFactor: 2 })
  const tmp = fs.mkdtempSync('/tmp/claude-0/sportframes-')
  for (const id of list) {
    const frames = framesOf(id)
    const dir = path.join(tmp, id)
    fs.mkdirSync(dir, { recursive: true })
    for (let i = 0; i < frames.length; i++) {
      await page.setContent(`<body style="margin:0">${frames[i]}</body>`)
      await page.screenshot({ path: path.join(dir, String(i).padStart(3, '0') + '.png') })
    }
    if (sheet) {
      const pick = [0, 4, 8, 12, 16, 20, 24, 27].map(i => path.join(dir, String(i).padStart(3, '0') + '.png'))
      execFileSync('ffmpeg', ['-v', 'error', '-y', ...pick.flatMap(f => ['-i', f]), '-filter_complex', `${pick.map((_, i) => `[${i}:v]scale=180:180[v${i}]`).join(';')};${pick.map((_, i) => `[v${i}]`).join('')}xstack=inputs=8:layout=0_0|180_0|360_0|540_0|0_180|180_180|360_180|540_180`, '-frames:v', '1', path.join(tmp, id + '-sheet.png')])
      console.log('sheet', path.join(tmp, id + '-sheet.png'))
      continue
    }
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', '10', '-i', path.join(dir, '%03d.png'), '-vf', 'scale=180:180:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-preset', 'veryslow', '-crf', '24', '-movflags', '+faststart', '-an', path.join(OUT, id + '.mp4')])
    const still = Math.round(FRAMES * (SPORT_DEFS[id].still ?? 0))
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', path.join(dir, String(still).padStart(3, '0') + '.png'), '-vf', 'scale=180:180:flags=lanczos', '-quality', '82', path.join(OUT, id + '.webp')])
    // The Android release plays its clips as animated WebP (see CLIP_EXT in lib/exercises.js).
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', '10', '-i', path.join(dir, '%03d.png'), '-vf', 'scale=180:180:flags=lanczos', '-loop', '0', '-quality', '70', '-an', path.join(OUT, id + '.anim.webp')])
    console.log('wrote', id, fs.statSync(path.join(OUT, id + '.mp4')).size, 'bytes')
  }
  await browser.close()
}
main()
