// Olympus: turns two key poses of a sport or drill into its clip, in the style of the exercise GIFs.
// The poses are anatomical illustrations made in Canva (white background, grey figure, worked
// muscles in red), kept in scripts/sports-media/poses/ as <id>.a.png and <id>.b.png. Each pose is held, then
// shown into the other (cross-faded or cut, see CUT_ABOVE), and the loop goes back.
// Writes <id>.mp4, <id>.anim.webp and <id>.webp (the still, pose A) into frontend/src/assets/sports/.
// Run: node scripts/sports-media/keyframes.mjs scripts/sports-media/poses [id ...]   (every pair when no id is given)
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.resolve(here, '../../frontend/src/assets/sports')
const SIZE = 180 // the exercise clips' size
const FPS = 10
const HOLD = 9 // frames each pose is held
const FADE = 3 // frames of cross-fade between poses that mostly overlap
// A cross-fade reads as motion only while the two silhouettes mostly overlap; past this share of
// changed pixels it shows two ghost figures at once, so the poses cut instead (the start/end look).
const CUT_ABOVE = 0.12

const [dir, ...only] = process.argv.slice(2)
if (!dir) throw new Error('usage: keyframes.mjs <dir> [id ...]')
const ids = only.length ? only : fs.readdirSync(dir).filter(f => f.endsWith('.a.png')).map(f => f.slice(0, -6))

// share of pixels whose grey level differs by more than 40 of 255 between the two poses
function changedShare(a, b) {
  const raw = f => execFileSync('ffmpeg', ['-v', 'error', '-i', f, '-f', 'rawvideo', '-pix_fmt', 'gray', '-'])
  const A = raw(a), B = raw(b)
  let n = 0
  for (let i = 0; i < A.length; i++) if (Math.abs(A[i] - B[i]) > 40) n++
  return n / A.length
}

const ff = args => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args])

for (const id of ids) {
  const a = path.join(dir, id + '.a.png'), b = path.join(dir, id + '.b.png')
  if (!fs.existsSync(a) || !fs.existsSync(b)) { console.warn('skip', id, '(missing a pose)'); continue }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kf-'))
  const frame = i => path.join(tmp, String(i).padStart(3, '0') + '.png')
  let n = 0
  // the poses at clip size, on white (an image may come with transparency)
  const scaled = src => { const f = path.join(tmp, path.basename(src)); ff(['-i', src, '-vf', `scale=${SIZE}:${SIZE}:flags=lanczos,format=rgb24`, f]); return f }
  const A = scaled(a), B = scaled(b)
  const hold = f => { for (let i = 0; i < HOLD; i++) fs.copyFileSync(f, frame(n++)) }
  const fade = (from, to) => {
    for (let i = 1; i <= FADE; i++) {
      const w = (i / (FADE + 1)).toFixed(3)
      ff(['-i', from, '-i', to, '-filter_complex', `[0][1]blend=all_expr='A*(1-${w})+B*${w}'`, frame(n++)])
    }
  }
  const fades = changedShare(A, B) <= CUT_ABOVE
  hold(A); if (fades) fade(A, B); hold(B); if (fades) fade(B, A)
  const seq = path.join(tmp, '%03d.png')
  ff(['-framerate', String(FPS), '-i', seq, '-vf', 'format=yuv420p', '-c:v', 'libx264', '-preset', 'veryslow', '-crf', '24', '-movflags', '+faststart', '-an', path.join(OUT, id + '.mp4')])
  ff(['-framerate', String(FPS), '-i', seq, '-loop', '0', '-quality', '75', '-an', path.join(OUT, id + '.anim.webp')])
  ff(['-i', A, '-quality', '85', path.join(OUT, id + '.webp')])
  fs.rmSync(tmp, { recursive: true, force: true })
  console.log(id, n, 'frames', fades ? 'cross-faded' : 'cut')
}
