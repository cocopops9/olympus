// Olympus: songs for a post, the way Instagram offers them: what is popular now where the person
// lives, and any song by search, each with its official 30-second preview. The catalogue is
// Apple's charts, and a search of Apple's and Deezer's catalogues together, asked through the
// Olympus server (api/music.js), which keeps the answers an hour. A post keeps which track it is,
// its title, artist and cover; an Apple song also its preview address, which lasts, while a
// Deezer song's preview address expires and is asked for again when it plays (songSource).
import { api } from './api.js'
import { getLang } from './i18n.js'

export const PREVIEW_SEC = 30

// The country whose chart to show: the phone's region when it says one (it-IT), otherwise the
// country most people speaking the app's language live in.
const LANG_COUNTRY = { en: 'us', it: 'it', es: 'es', fr: 'fr', de: 'de', pt: 'br', 'pt-br': 'br', nl: 'nl', pl: 'pl', ru: 'ru', uk: 'ua', tr: 'tr', ja: 'jp', ko: 'kr', zh: 'cn', ar: 'sa', hi: 'in', id: 'id', sv: 'se' }
export function musicCountry(locale = typeof navigator !== 'undefined' ? navigator.language : '', lang = safeLang()) {
  const region = String(locale || '').split(/[-_]/)[1]
  if (region && /^[a-z]{2}$/i.test(region)) return region.toLowerCase()
  const l = String(lang || '').toLowerCase()
  return LANG_COUNTRY[l] || LANG_COUNTRY[l.split('-')[0]] || 'us'
}
function safeLang() { try { return getLang() } catch { return 'en' } }

const asked = (path, params) => api(path + '?' + new URLSearchParams(params)).then(r => (Array.isArray(r?.tracks) ? r.tracks : []))
  .catch(e => { throw Object.assign(e instanceof Error ? e : new Error('catalogue'), { code: e?.code || 'catalogue-down' }) })

/** The songs most played now in the person's country, in chart order. */
export const topSongs = (country = musicCountry()) => asked('/api/music/top', { country })

/** Songs matching `query`. */
export const searchSongs = (query, country = musicCountry()) => asked('/api/music/search', { q: String(query || '').slice(0, 80), country })

/** What a post keeps of a catalogue song. */
export const songOf = tr => tr.src === 'deezer'
  ? { src: 'deezer', id: String(tr.id), title: tr.title, artist: tr.artist, ...(tr.art ? { art: tr.art } : {}) }
  : { src: 'apple', id: String(tr.id), title: tr.title, artist: tr.artist, ...(tr.art ? { art: tr.art } : {}), preview: tr.preview }

/** The address a post's song plays from, when the post itself has it (an Apple song). */
export const onlineSource = song => (song?.src === 'apple' && typeof song.preview === 'string' ? song.preview : null)

/** The address a catalogue song plays from now: a Deezer one is asked for fresh. Null otherwise. */
export async function songSource(song) {
  const own = onlineSource(song)
  if (own) return own
  if (song?.src === 'deezer') {
    const r = await api('/api/music/track?' + new URLSearchParams({ src: 'deezer', id: String(song.id) }))
    return typeof r?.preview === 'string' ? r.preview : null
  }
  return null
}
