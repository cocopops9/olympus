// Renders the Greek notification sounds (src/lib/notify-sounds.js) to the WAV files the Android
// notification channels play (android/app/src/main/res/raw/olympus_<id>.wav), through the app's
// own lib/sound.js in Chromium's OfflineAudioContext, so the phone's notification and the sound the
// app plays are one and the same. Run it after changing a sound, and bump that sound's channel id
// in NOTIFY_CHANNELS (a phone keeps the sound a channel was made with).
//
//   node scripts/render-notify-sounds.mjs [outDir]
//
// Needs Playwright with a Chromium; it is not one of the app's dependencies (install it globally,
// or run it where it is already installed). Prints each sound's peak, RMS and audible length.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const here = path.dirname(fileURLToPath(import.meta.url))
const src = path.resolve(here, '../src')
const outDir = path.resolve(process.argv[2] || path.join(here, '../android/app/src/main/res/raw'))
const RATE = 44100

let chromium
try { ({ chromium } = createRequire(import.meta.url)('playwright')) }
catch { console.error('Playwright is needed: npm i -g playwright'); process.exit(1) }

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0])
  if (url === '/') { res.setHeader('content-type', 'text/html'); res.end('<!doctype html><title>render</title>'); return }
  const file = path.join(src, url)
  if (!file.startsWith(src) || !fs.existsSync(file)) { res.statusCode = 404; res.end(); return }
  res.setHeader('content-type', 'text/javascript')
  res.end(fs.readFileSync(file))
})
await new Promise(r => server.listen(0, '127.0.0.1', r))
const base = `http://127.0.0.1:${server.address().port}`

const wav = samples => {
  const buf = Buffer.alloc(44 + samples.length * 2)
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + samples.length * 2, 4); buf.write('WAVE', 8)
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22)
  buf.writeUInt32LE(RATE, 24); buf.writeUInt32LE(RATE * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34)
  buf.write('data', 36); buf.writeUInt32LE(samples.length * 2, 40)
  samples.forEach((v, i) => buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), 44 + i * 2))
  return buf
}

const browser = await chromium.launch()
try {
  const page = await browser.newPage()
  await page.goto(base + '/')
  const rendered = await page.evaluate(async rate => {
    const { renderNotifySound } = await import('/lib/sound.js')
    const { GREEK_NOTIFY_IDS, notifySoundEnd } = await import('/lib/notify-sounds.js')
    const out = {}
    for (const id of GREEK_NOTIFY_IDS) {
      const ctx = new OfflineAudioContext(1, Math.ceil((notifySoundEnd(id) + 0.1) * rate), rate)
      renderNotifySound(ctx, id)
      out[id] = Array.from((await ctx.startRendering()).getChannelData(0))
    }
    return out
  }, RATE)
  fs.mkdirSync(outDir, { recursive: true })
  for (const [id, samples] of Object.entries(rendered)) {
    // The tail below -60 dBFS is cut, with a 10 ms fade, so the file is no longer than it sounds.
    let end = samples.length
    while (end > 0 && Math.abs(samples[end - 1]) < 0.001) end--
    const fade = Math.round(RATE * 0.01)
    const cut = samples.slice(0, Math.min(samples.length, end + fade)).map((v, i, a) => (i >= a.length - fade ? v * (a.length - i) / fade : v))
    const peak = Math.max(...cut.map(Math.abs))
    const rms = Math.sqrt(cut.reduce((s, v) => s + v * v, 0) / cut.length)
    const file = path.join(outDir, `olympus_${id}.wav`)
    fs.writeFileSync(file, wav(cut))
    console.log(`${id}: ${(cut.length / RATE).toFixed(2)} s, peak ${peak.toFixed(3)}, RMS ${rms.toFixed(3)} -> ${path.relative(process.cwd(), file)}`)
  }
} finally {
  await browser.close()
  server.close()
}
