// Olympus: songs for a post from a free catalogue online, the way Instagram offers music: Audius
// (audius.co), an open music service whose public API needs no key, only the app's name. The
// phone asks it directly for what is trending and for a search, and plays a track from its
// stream address; nothing of the song goes through or stays on the Olympus server, the post only
// keeps which track it is, its title, artist and cover, and where its 30 seconds start.
//
//   GET https://api.audius.co/v1/tracks/trending?app_name=…        { data: [track] }
//   GET https://api.audius.co/v1/tracks/search?query=…&app_name=… { data: [track] }
//   https://api.audius.co/v1/tracks/<id>/stream?app_name=…         the audio (a redirect to it)
const BASE = 'https://api.audius.co/v1'
const APP = 'Olympus'
const TIMEOUT_MS = 12000

export const CATALOGUE_CLIP_SEC = 30

/** A track as the app keeps it: { src: 'audius', id, title, artist, art, duration } or null. */
export function trackOf(t) {
  if (!t || typeof t.id !== 'string' || !/^[A-Za-z0-9]{1,32}$/.test(t.id)) return null
  // Only what anyone may play: not gated behind a purchase or a follow, and streamable.
  if (t.is_streamable === false || t.stream_conditions || t.is_stream_gated) return null
  const art = t.artwork?.['150x150'] || t.artwork?.['480x480'] || null
  return {
    src: 'audius',
    id: t.id,
    title: String(t.title || '').slice(0, 80),
    artist: String(t.user?.name || t.user?.handle || '').slice(0, 60),
    art: typeof art === 'string' && art.startsWith('https://') ? art.slice(0, 300) : null,
    duration: Number(t.duration) || 0,
  }
}

async function get(path, params = {}, fetchImpl = globalThis.fetch) {
  const q = new URLSearchParams({ ...params, app_name: APP })
  const ctl = typeof AbortController === 'function' ? new AbortController() : null
  const timer = setTimeout(() => ctl?.abort(), TIMEOUT_MS)
  try {
    const r = await fetchImpl(`${BASE}${path}?${q}`, { signal: ctl?.signal, headers: { Accept: 'application/json' } })
    if (!r.ok) throw Object.assign(new Error('catalogue ' + r.status), { code: 'catalogue-down' })
    const body = await r.json()
    return (Array.isArray(body?.data) ? body.data : []).map(trackOf).filter(Boolean)
  } catch (e) {
    throw e?.code ? e : Object.assign(new Error('catalogue unreachable'), { code: 'catalogue-down' })
  } finally { clearTimeout(timer) }
}

/** What is trending now (`genre` optional), at most `limit`. */
export const trendingTracks = ({ genre, limit = 30 } = {}, fetchImpl) =>
  get('/tracks/trending', { limit: String(limit), ...(genre ? { genre } : {}) }, fetchImpl)

/** Tracks matching `query`. */
export const searchTracks = (query, fetchImpl) =>
  get('/tracks/search', { query: String(query || '').slice(0, 80), limit: '30' }, fetchImpl)

/** The address the phone plays the track from. */
export const streamUrl = id => `${BASE}/tracks/${encodeURIComponent(id)}/stream?app_name=${APP}`

/** Genres to browse, as the catalogue names them, with the words the app shows. */
export const GENRES = [
  { id: '', label: 'Trending' },
  { id: 'Hip-Hop/Rap', label: 'Hip-hop' },
  { id: 'Electronic', label: 'Electronic' },
  { id: 'Rock', label: 'Rock' },
  { id: 'Pop', label: 'Pop' },
  { id: 'Metal', label: 'Metal' },
  { id: 'Dance & EDM', label: 'Dance' },
  { id: 'House', label: 'House' },
  { id: 'Lo-Fi', label: 'Lo-fi' },
]

/** Where a 30-second clip may start in a track `duration` long, and a good default (a third in). */
export const catalogueStartMax = duration => Math.max(0, Math.floor((Number(duration) || 0) - CATALOGUE_CLIP_SEC))
export const catalogueDefaultStart = duration => Math.min(catalogueStartMax(duration), Math.round((Number(duration) || 0) / 3))
