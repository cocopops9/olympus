// Copied from api/music.js by scripts/supabase-bundle.mjs. Edit that file, then run the script.
// Olympus: the songs a post can carry, the way Instagram offers them: what is popular now in the
// person's country, and any song by search, each with its official 30-second preview. Apple's
// public catalogue, which needs no key:
//
//   charts  https://rss.marketingtools.apple.com/api/v2/<cc>/music/most-played/50/songs.json
//   search  https://itunes.apple.com/search?term=…&entity=song&country=<cc>
//   preview https://itunes.apple.com/lookup?id=…,…&country=<cc>  (previewUrl, the 30 seconds)
//
// Asked by the server (the phone's WebView would be refused across origins), kept an hour per
// country or search. A post keeps which track, its words, cover and preview address; the phone
// plays the preview from Apple. Shared by api/server.js and the Supabase function.

const TTL_MS = 60 * 60 * 1000;
const cache = new Map();   // key -> { at, tracks }
const CC = /^[a-z]{2}$/;

export const countryOf = v => (CC.test(String(v || '').toLowerCase()) ? String(v).toLowerCase() : 'us');

/** One track from the catalogue as the app keeps it, or null. */
export function trackOf(r) {
  const preview = typeof r?.previewUrl === 'string' && /^https:\/\/[a-z0-9.-]+\.apple\.com\//.test(r.previewUrl) ? r.previewUrl : null;
  const id = String(r?.trackId ?? r?.id ?? '');
  if (!preview || !/^\d{1,15}$/.test(id)) return null;
  const art = typeof r.artworkUrl100 === 'string' && /^https:\/\/[a-z0-9.-]+\.mzstatic\.com\//.test(r.artworkUrl100)
    ? r.artworkUrl100.replace(/\/\d+x\d+bb\./, '/300x300bb.') : null;
  return {
    src: 'apple', id,
    title: String(r.trackName ?? r.name ?? '').slice(0, 80),
    artist: String(r.artistName ?? '').slice(0, 60),
    art, preview,
    explicit: r.trackExplicitness === 'explicit' || r.contentAdvisoryRating === 'Explicit',
  };
}

async function json(url, fetchImpl) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 10000);
  try {
    const r = await fetchImpl(url, { signal: ctl.signal, headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error('catalogue ' + r.status);
    return await r.json();
  } finally { clearTimeout(timer); }
}

async function cached(key, make, now) {
  const hit = cache.get(key);
  if (hit && now - hit.at < TTL_MS) return hit.tracks;
  const tracks = await make();
  cache.set(key, { at: now, tracks });
  if (cache.size > 300) cache.delete(cache.keys().next().value);
  return tracks;
}

/** The most played songs in country `cc`, with their previews, in chart order. */
export function topSongs(cc, { fetchImpl = globalThis.fetch, now = Date.now() } = {}) {
  const c = countryOf(cc);
  return cached('top:' + c, async () => {
    const feed = await json(`https://rss.marketingtools.apple.com/api/v2/${c}/music/most-played/50/songs.json`, fetchImpl);
    const ids = (feed?.feed?.results || []).map(r => String(r.id)).filter(id => /^\d{1,15}$/.test(id));
    if (!ids.length) return [];
    const look = await json(`https://itunes.apple.com/lookup?id=${ids.join(',')}&country=${c}`, fetchImpl);
    const byId = new Map((look?.results || []).map(r => [String(r.trackId), r]));
    return ids.map(id => trackOf(byId.get(id))).filter(Boolean);
  }, now);
}

/** Songs matching `q` in country `cc`. */
export function searchSongs(q, cc, { fetchImpl = globalThis.fetch, now = Date.now() } = {}) {
  const c = countryOf(cc);
  const term = String(q || '').trim().slice(0, 80);
  if (!term) return Promise.resolve([]);
  return cached('q:' + c + ':' + term.toLowerCase(), async () => {
    const r = await json(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=40&country=${c}`, fetchImpl);
    return (r?.results || []).map(trackOf).filter(Boolean);
  }, now);
}

/** A post's song from the catalogue as sent by the app, checked, or null. */
export function cleanAppleSong(v, str) {
  const t = trackOf({ trackId: v?.id, trackName: v?.title, artistName: v?.artist, artworkUrl100: v?.art, previewUrl: v?.preview });
  if (!t) return null;
  return { src: 'apple', id: t.id, title: str(v.title, 80), artist: str(v.artist, 60), ...(t.art ? { art: v.art } : {}), preview: t.preview };
}

export const _clearMusicCache = () => cache.clear();
