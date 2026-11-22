// The sports' pictures. Unlike the exercise catalogue, whose still and clip files sit next to the
// app (or on a CDN), the sports' drawings are small original files bundled with the app, so Vite
// hands out their URLs here: `<id>.webp` the still, `<id>.mp4` the loop, `<id>.anim.webp` the loop
// as an animated image for the Android release. Plain Node (a script that imports exercises.js
// without Vite) has no import.meta.glob and gets no media, which only matters to a browser.
//
// Vite replaces the import.meta.glob(...) call at build time but leaves import.meta.glob itself
// undefined at run time, so the call is tried rather than tested with typeof: a typeof test is
// false in the built app, which then had no sports pictures at all.
let FILES = {}
try {
  FILES = import.meta.glob('../assets/sports/*', { eager: true, query: '?url', import: 'default' })
} catch {
  FILES = {}
}

const BY_NAME = {}
for (const [path, url] of Object.entries(FILES)) BY_NAME[path.split('/').pop()] = url

/** URL of a sport's still, loop or animated loop, or '' when the file is not there. */
export const sportStill = id => BY_NAME[id + '.webp'] || ''
export const sportClip = id => BY_NAME[id + '.mp4'] || ''
export const sportAnimation = id => BY_NAME[id + '.anim.webp'] || ''
