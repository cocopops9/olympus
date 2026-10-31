// Olympus: songs for a post, the way Instagram offers them: what is popular now where the person
// lives, and any song by search, each with its official 30-second preview. The catalogue is
// Apple's (charts and previews), asked through the Olympus server (api/music.js), which keeps the
// answers an hour. A post keeps which track it is, its title, artist, cover and preview address;
// the phone plays the preview straight from Apple.
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
export const songOf = tr => ({ src: 'apple', id: String(tr.id), title: tr.title, artist: tr.artist, ...(tr.art ? { art: tr.art } : {}), preview: tr.preview })

/** The address a post's song plays from, for songs of the catalogue (null for a song from the phone). */
export const onlineSource = song => (song?.src === 'apple' && typeof song.preview === 'string' ? song.preview : null)
