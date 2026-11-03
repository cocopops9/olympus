// Olympus: a finished workout as a story card, 1080 x 1920 (the size of an Instagram story), to
// share from the finish screen or the workout's details. Instagram has no way for an app to post
// to a person's story for them (its API publishes to business accounts only), so the card goes
// through the phone's share sheet, where "Instagram Stories" is one of the choices; each card
// shared counts towards the story medals (lib/medals.js).
import { t } from './i18n.js'
import { fmtNum, fmtDur } from './format.js'
import { EXIDX } from './exercises.js'
import { exerciseNameFor } from './i18n.js'
import { funOf } from './medals.js'
import logoUrl from '../assets/logo.png'

const W = 1080, H = 1920
const GOLD = '#f2b51c'
const LB = 0.45359237

function img(src) {
  return new Promise(resolve => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => resolve(null); i.src = src })
}

function fit(ctx, text, max, size, weight = 700) {
  let s = size
  do { ctx.font = `${weight} ${s}px -apple-system, "Segoe UI", Roboto, system-ui, sans-serif`; s -= 4 } while (ctx.measureText(text).width > max && s > 24)
}

/** The best set of each exercise of `w`, at most `n`: [{ name, line }]. */
function topSets(w, unit, n = 5) {
  const out = []
  for (const e of w.entries || []) {
    const done = (e.sets || []).filter(s => s.done && (s.w > 0 || s.r > 0 || s.min > 0))
    if (!done.length) continue
    const best = done.reduce((a, b) => ((b.w || 0) * (b.r || 1) > (a.w || 0) * (a.r || 1) ? b : a))
    const ex = EXIDX[e.id]
    const line = best.min > 0 ? `${fmtNum(best.min)} min` : best.w > 0 ? `${fmtNum(best.w)} ${unit} × ${best.r || 0}` : `${best.r || 0} ${t('reps')}`
    out.push({ name: ex ? exerciseNameFor(ex) : String(e.id), line: `${done.length} × · ${line}` })
    if (out.length >= n) break
  }
  return out
}

/** The card of workout `w` as a PNG Blob. */
export async function storyCard(w, { unit = 'kg' } = {}) {
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const ctx = c.getContext('2d')
  // Background: night with a glow of gold.
  const bg = ctx.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, '#16120a'); bg.addColorStop(0.5, '#0b0a08'); bg.addColorStop(1, '#000')
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H)
  const glow = ctx.createRadialGradient(W * 0.7, 420, 40, W * 0.7, 420, 900)
  glow.addColorStop(0, 'rgba(242,181,28,0.35)'); glow.addColorStop(1, 'rgba(242,181,28,0)')
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H)

  // Brand
  const logo = await img(logoUrl)
  if (logo) {
    ctx.save(); ctx.beginPath(); ctx.roundRect(80, 120, 120, 120, 28); ctx.clip(); ctx.drawImage(logo, 80, 120, 120, 120); ctx.restore()
  }
  ctx.fillStyle = '#f4efe3'; ctx.font = '800 52px Georgia, serif'; ctx.textBaseline = 'middle'
  ctx.fillText('OLYMPUS', 230, 182)

  // Title and date
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = GOLD; ctx.font = '700 40px -apple-system, "Segoe UI", Roboto, sans-serif'
  ctx.fillText(t('Workout complete!').toUpperCase(), 80, 400)
  ctx.fillStyle = '#fff'
  const title = String(w.title || w.name || t('Workout'))
  fit(ctx, title, W - 160, 96, 800)
  ctx.fillText(title, 80, 510)
  ctx.fillStyle = '#a59c88'; ctx.font = '500 38px -apple-system, "Segoe UI", Roboto, sans-serif'
  ctx.fillText(new Date((w.start || Date.now())).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }), 80, 575)

  // The volume, big, with what it weighs like.
  const vol = Number(w.vol) || 0
  ctx.fillStyle = '#fff'; ctx.font = '900 190px -apple-system, "Segoe UI", Roboto, sans-serif'
  const v = fmtNum(Math.round(vol))
  ctx.fillText(v, 80, 820)
  const vw = ctx.measureText(v).width
  ctx.fillStyle = GOLD; ctx.font = '800 70px -apple-system, "Segoe UI", Roboto, sans-serif'
  ctx.fillText(unit, 80 + vw + 24, 820)
  ctx.fillStyle = '#d8cfbb'; ctx.font = '600 44px -apple-system, "Segoe UI", Roboto, sans-serif'
  ctx.fillText(t('lifted'), 84, 912)
  const fun = funOf(unit === 'lb' ? vol * LB : vol)
  if (fun) { ctx.fillStyle = GOLD; fit(ctx, fun, W - 160, 46, 700); ctx.fillText(fun, 84, 975) }

  // Three tiles
  const sets = (w.entries || []).reduce((n, e) => n + (e.sets || []).filter(s => s.done).length, 0)
  const tiles = [[t('Duration'), w.end && w.start ? fmtDur(w.end - w.start) : '–'], [t('Sets'), String(sets)], [t('PRs'), String((w.prs || []).length || '–')]]
  const tw = (W - 160 - 40) / 3
  tiles.forEach(([l, val], i) => {
    const x = 80 + i * (tw + 20), y = 1030
    ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.beginPath(); ctx.roundRect(x, y, tw, 190, 36); ctx.fill()
    ctx.fillStyle = '#a59c88'; ctx.font = '600 32px -apple-system, "Segoe UI", Roboto, sans-serif'; ctx.fillText(l, x + 34, y + 66)
    ctx.fillStyle = '#fff'; fit(ctx, val, tw - 68, 64, 800); ctx.fillText(val, x + 34, y + 148)
  })

  // The exercises
  let y = 1330
  for (const row of topSets(w, unit)) {
    ctx.fillStyle = '#a59c88'; ctx.font = '600 36px -apple-system, "Segoe UI", Roboto, sans-serif'
    const lw = ctx.measureText(row.line).width
    ctx.fillText(row.line, W - 80 - lw, y)
    const name = row.name.charAt(0).toUpperCase() + row.name.slice(1)
    ctx.fillStyle = '#f4efe3'; fit(ctx, name, W - 160 - lw - 30, 40, 700); ctx.fillText(name, 80, y)
    y += 74
  }

  // Footer
  ctx.fillStyle = GOLD; ctx.fillRect(80, H - 210, 120, 8)
  ctx.fillStyle = '#f4efe3'; ctx.font = '700 40px -apple-system, "Segoe UI", Roboto, sans-serif'
  ctx.fillText(t('Train with me on Olympus'), 80, H - 130)
  ctx.fillStyle = '#a59c88'; ctx.font = '500 34px -apple-system, "Segoe UI", Roboto, sans-serif'
  ctx.fillText('cocopops9.github.io/olympus', 80, H - 80)

  return await new Promise(resolve => c.toBlob(b => resolve(b), 'image/png'))
}

const toBase64 = blob => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result).split(',')[1]); r.onerror = () => reject(r.error); r.readAsDataURL(blob) })

/**
 * Shares the card of `w` through the share sheet (Instagram Stories is one of its choices).
 * Resolves to 'shared', 'cancelled', 'saved' (downloaded where nothing can share a file) or 'failed'.
 */
export async function shareStory(w, { unit = 'kg', mobile = false } = {}) {
  let blob
  try { blob = await storyCard(w, { unit }) } catch { return 'failed' }
  if (!blob) return 'failed'
  const text = t('Train with me on Olympus') + ': https://cocopops9.github.io/olympus/'
  if (mobile) {
    try {
      const { Filesystem, Directory } = await import('@capacitor/filesystem')
      const name = `olympus-${w.id || Date.now()}.png`
      await Filesystem.writeFile({ path: name, data: await toBase64(blob), directory: Directory.Cache })
      const { uri } = await Filesystem.getUri({ path: name, directory: Directory.Cache })
      const { Share } = await import('@capacitor/share')
      await Share.share({ title: 'Olympus', text, files: [uri], dialogTitle: t('Share to your story') })
      return 'shared'
    } catch (e) {
      if (/cancel/i.test(String(e?.message || e))) return 'cancelled'
      // The web build of the app (iPhone) has no native files: the browser's own sharing below.
    }
  }
  const file = new File([blob], 'olympus-workout.png', { type: 'image/png' })
  if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], text }); return 'shared' } catch (e) { return e?.name === 'AbortError' ? 'cancelled' : 'failed' }
  }
  try {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob); a.download = 'olympus-workout.png'
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 4000)
    return 'saved'
  } catch { return 'failed' }
}
