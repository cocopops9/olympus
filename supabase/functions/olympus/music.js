// Copied from api/music.js by scripts/supabase-bundle.mjs. Edit that file, then run the script.
// Olympus: the songs a post can carry, the way Instagram offers them: what is popular now in the
// person's country, and any song by search, each with its official 30-second preview. Apple's
// public catalogue, which needs no key:
//
//   charts  https://rss.marketingtools.apple.com/api/v2/<cc>/music/most-played/50/songs.json
//   search  https://itunes.apple.com/search?term=…&entity=song&country=<cc>
//   preview https://itunes.apple.com/lookup?id=…,…&country=<cc>  (previewUrl, the 30 seconds)
//
// Search also asks Deezer's public API (no key either), which knows many songs Apple's search
// misses and forgives typos; the two lists are woven together and a song both know is shown once:
//
//   search  https://api.deezer.com/search?q=…
//   track   https://api.deezer.com/track/<id>  (preview: a signed address that expires, so a post
//           keeps only the track and the app asks for a fresh address when it plays, deezerPreview)
//
// Full songs are not offered by either: they are licensed, only the 30-second previews are free.
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
  const timer = setTimeout(() => ctl.abort(), 20000);
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

/** One track from Deezer as the app keeps it, or null. Its preview is fresh only for a while. */
export function deezerTrackOf(r) {
  const preview = typeof r?.preview === 'string' && /^https:\/\/[a-z0-9.-]+\.dzcdn\.net\//.test(r.preview) ? r.preview : null;
  const id = String(r?.id ?? '');
  if (!preview || !/^\d{1,15}$/.test(id) || r?.readable === false) return null;
  const cover = r.album?.cover_medium || r.album?.cover_big;
  const art = typeof cover === 'string' && /^https:\/\/[a-z0-9.-]+\.dzcdn\.net\//.test(cover) ? cover : null;
  return {
    src: 'deezer', id,
    title: String(r.title_short || r.title || '').slice(0, 80),
    artist: String(r.artist?.name ?? '').slice(0, 60),
    art, preview,
    explicit: r.explicit_lyrics === true,
  };
}

// The same song in both catalogues: title without what is in brackets, and the main artist.
const simple = v => String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s*[([].*?[)\]]/g, '').replace(/\s+-\s+.*$/, '').replace(/[^a-z0-9]+/g, ' ').trim();
const sameSong = tr => simple(tr.title) + '|' + simple(String(tr.artist).split(/,|&| feat\.? | ft\.? | x /i)[0]);

/** Two result lists woven together, each song once: the first of each, then the second of each... */
export function weave(a, b) {
  const out = [], seen = new Set();
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    for (const tr of [a[i], b[i]]) {
      if (!tr) continue;
      const k = sameSong(tr);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(tr);
    }
  }
  return out;
}

/** Songs matching `q` in country `cc`: Apple's and Deezer's results, woven. */
export function searchSongs(q, cc, { fetchImpl = globalThis.fetch, now = Date.now() } = {}) {
  const c = countryOf(cc);
  const term = String(q || '').trim().slice(0, 80);
  if (!term) return Promise.resolve([]);
  return cached('q:' + c + ':' + term.toLowerCase(), async () => {
    const [apple, deezer] = await Promise.allSettled([
      json(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=40&country=${c}`, fetchImpl)
        .then(r => (r?.results || []).map(trackOf).filter(Boolean)),
      json(`https://api.deezer.com/search?q=${encodeURIComponent(term)}&limit=40`, fetchImpl)
        .then(r => (r?.data || []).map(deezerTrackOf).filter(Boolean)),
    ]);
    if (apple.status === 'rejected' && deezer.status === 'rejected') throw apple.reason;
    return weave(apple.status === 'fulfilled' ? apple.value : [], deezer.status === 'fulfilled' ? deezer.value : []);
  }, now);
}

const previews = new Map();   // deezer id -> { at, url }
const PREVIEW_TTL_MS = 10 * 60 * 1000;

/** A fresh address of the preview of Deezer track `id`, or null when it has none. */
export async function deezerPreview(id, { fetchImpl = globalThis.fetch, now = Date.now() } = {}) {
  const key = String(id || '');
  if (!/^\d{1,15}$/.test(key)) return null;
  const hit = previews.get(key);
  if (hit && now - hit.at < PREVIEW_TTL_MS) return hit.url;
  const tr = deezerTrackOf(await json(`https://api.deezer.com/track/${key}`, fetchImpl));
  if (!tr) return null;
  previews.set(key, { at: now, url: tr.preview });
  if (previews.size > 500) previews.delete(previews.keys().next().value);
  return tr.preview;
}

/** A post's song from Deezer as sent by the app, checked, or null. No preview: it expires. */
export function cleanDeezerSong(v, str) {
  const id = String(v?.id ?? '');
  if (!/^\d{1,15}$/.test(id)) return null;
  const art = typeof v.art === 'string' && /^https:\/\/[a-z0-9.-]+\.dzcdn\.net\/[^\s"<>]{1,250}$/.test(v.art) ? v.art : null;
  const at = x => Math.min(30, Math.max(0, Math.round(Number(x) || 0)));
  const from = at(v.from), to = at(v.to);
  const part = to - from >= 2 && (from > 0 || to < 30) ? { from, to } : null;
  return { src: 'deezer', id, title: str(v.title, 80), artist: str(v.artist, 60), ...(art ? { art } : {}), ...(part || {}) };
}

/** A post's song from the catalogue as sent by the app, checked, or null. */
export function cleanAppleSong(v, str) {
  const t = trackOf({ trackId: v?.id, trackName: v?.title, artistName: v?.artist, artworkUrl100: v?.art, previewUrl: v?.preview });
  if (!t) return null;
  // The part of the 30-second preview the person chose to share: whole seconds, at least 2 of them.
  const at = x => Math.min(30, Math.max(0, Math.round(Number(x) || 0)));
  const from = at(v.from), to = at(v.to);
  const part = to - from >= 2 && (from > 0 || to < 30) ? { from, to } : null;
  return { src: 'apple', id: t.id, title: str(v.title, 80), artist: str(v.artist, 60), ...(t.art ? { art: v.art } : {}), preview: t.preview, ...(part || {}) };
}

export const _clearMusicCache = () => { cache.clear(); previews.clear(); };
