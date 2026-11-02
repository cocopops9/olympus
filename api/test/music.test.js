import { test } from 'node:test';
import assert from 'node:assert/strict';
import { topSongs, searchSongs, trackOf, cleanAppleSong, countryOf, _clearMusicCache } from '../music.js';

const PREVIEW = 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview/x/mzaf_1.plus.aac.p.m4a';
const ART = 'https://is1-ssl.mzstatic.com/image/thumb/Music/x/100x100bb.jpg';
const track = (id, name) => ({ trackId: id, trackName: name, artistName: 'Artist ' + id, previewUrl: PREVIEW, artworkUrl100: ART, trackExplicitness: 'notExplicit' });

function fakeFetch(calls) {
  return async url => {
    calls.push(url);
    if (url.includes('marketingtools')) return { ok: true, json: async () => ({ feed: { results: [{ id: '2' }, { id: '1' }, { id: '3' }] } }) };
    if (url.includes('/lookup')) return { ok: true, json: async () => ({ results: [track(1, 'One'), track(2, 'Two'), { trackId: 3, trackName: 'No preview' }] }) };
    if (url.includes('/search')) return { ok: true, json: async () => ({ results: [track(7, 'Found')] }) };
    return { ok: false, status: 404 };
  };
}

test('the chart keeps its order and drops songs without a preview', async () => {
  _clearMusicCache();
  const calls = [];
  const tracks = await topSongs('IT', { fetchImpl: fakeFetch(calls) });
  assert.deepEqual(tracks.map(t => t.title), ['Two', 'One']);
  assert.equal(tracks[0].src, 'apple');
  assert.match(tracks[0].art, /300x300bb/);
  assert.ok(calls[0].includes('/it/music/most-played/'));
  // Kept an hour: a second ask does not reach Apple.
  await topSongs('it', { fetchImpl: fakeFetch(calls) });
  assert.equal(calls.length, 2);
});

test('search, and an unknown country falls back to us', async () => {
  _clearMusicCache();
  const calls = [];
  assert.deepEqual((await searchSongs('found', 'xx1', { fetchImpl: fakeFetch(calls) })).map(t => t.id), ['7']);
  assert.ok(calls[0].includes('country=us'));
  assert.deepEqual(await searchSongs('  ', 'it', { fetchImpl: fakeFetch(calls) }), []);
  assert.equal(countryOf('GB'), 'gb');
});

test('a post keeps only songs whose preview and cover are Apple addresses', () => {
  const str = (v, n) => String(v ?? '').slice(0, n);
  assert.equal(trackOf({ trackId: 1, previewUrl: 'https://evil.example/a.m4a' }), null);
  assert.equal(cleanAppleSong({ id: '5', title: 'T', artist: 'A', preview: 'http://audio-ssl.itunes.apple.com/x' }, str), null);
  const s = cleanAppleSong({ id: '5', title: 'T', artist: 'A', art: 'https://evil.example/x.jpg', preview: PREVIEW }, str);
  assert.deepEqual(s, { src: 'apple', id: '5', title: 'T', artist: 'A', preview: PREVIEW });
});

test('the server keeps the last chart and serves it when Apple does not answer', async () => {
  const { createApp, memoryStore, memoryPhotos } = await import('../../supabase/functions/olympus/core.js');
  const { _clearMusicCache } = await import('../music.js');
  _clearMusicCache();
  let up = true, t = Date.parse('2026-11-02T10:00:00Z');
  const fetchImpl = async url => {
    if (!up) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    if (/rss\.marketingtools/.test(url)) return { ok: true, json: async () => ({ feed: { results: [{ id: '111' }] } }) };
    return { ok: true, json: async () => ({ results: [{ trackId: 111, trackName: 'Song', artistName: 'Artist', previewUrl: 'https://audio-ssl.itunes.apple.com/p.m4a', artworkUrl100: 'https://is1-ssl.mzstatic.com/a/100x100bb.jpg' }] }) };
  };
  const app = createApp({ store: memoryStore(), photos: memoryPhotos(), now: () => t, fetchImpl });
  const call = async (method, path, body, token) => {
    const res = await app.handle(new Request('https://x.test/functions/v1/olympus' + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined }));
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  const token = (await call('POST', '/api/app/signup', { name: 'ada_lifts', email: 'ada@example.com', password: 'correct horse battery staple' })).body?.token;
  const first = await call('GET', '/api/music/top?country=it', null, token);
  assert.equal(first.status, 200);
  assert.equal(first.body.tracks[0].title, 'Song');
  _clearMusicCache(); up = false; t += 3 * 60 * 60 * 1000;
  const later = await call('GET', '/api/music/top?country=it', null, token);
  assert.equal(later.status, 200);
  assert.equal(later.body.tracks[0].title, 'Song');
  const other = await call('GET', '/api/music/top?country=fr', null, token);
  assert.equal(other.status, 502);
  _clearMusicCache();
});
