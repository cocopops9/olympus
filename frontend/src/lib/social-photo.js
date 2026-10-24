// A photo picked for a post, made ready to upload: decoded, scaled so its longer side is at
// most 1600 px (lib/social.js fitWithin) and re-encoded as JPEG. Re-encoding through a canvas is
// also what removes the photo's metadata (EXIF: where and when it was taken, the camera) before
// it leaves the phone; the server strips it again for any other client (api/social.js).
import { fitWithin } from './social.js'

const MAX_SIDE = 1600
const QUALITY = 0.82

function decode(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(Object.assign(new Error('not an image'), { code: 'photo-type' })) }
    img.src = url
  })
}

/** A File from an <input type="file"> as a JPEG data URL ready for uploadPhoto. */
export async function preparePhoto(file) {
  const img = await decode(file)
  const { w, h } = fitWithin(img.naturalWidth || img.width, img.naturalHeight || img.height, MAX_SIDE)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  // A transparent PNG would turn black as a JPEG; white reads as paper instead.
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(img, 0, 0, w, h)
  return canvas.toDataURL('image/jpeg', QUALITY)
}

const AVATAR_SIDE = 512

/** A File as a profile picture: the centre square, 512 px, JPEG (metadata dropped the same way). */
export async function prepareAvatar(file) {
  const img = await decode(file)
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height
  const side = Math.min(w, h)
  const out = Math.min(AVATAR_SIDE, side)
  const canvas = document.createElement('canvas')
  canvas.width = out
  canvas.height = out
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, out, out)
  ctx.drawImage(img, (w - side) / 2, (h - side) / 2, side, side, 0, 0, out, out)
  return canvas.toDataURL('image/jpeg', QUALITY)
}
