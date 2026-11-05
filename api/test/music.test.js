import { test } from 'node:test';
import assert from 'node:assert/strict';
import { topSongs, searchSongs, trackOf, cleanAppleSong, countryOf, _clearMusicCache, deezerPreview, cleanDeezerSong, weave } from '../music.js';

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

const DZ = 'https://cdnt-preview.dzcdn.net/api/1/1/a/b/c/0/abc.mp3?hdnea=exp=1~acl=x~hmac=y';
const dz = (id, title, artist) => ({ id, title, title_short: title, preview: DZ, readable: true, artist: { name: artist }, album: { cover_medium: 'https://e-cdns-images.dzcdn.net/images/cover/x/250x250.jpg' } });

test('search weaves Apple and Deezer together and shows a song both know once', async () => {
  _clearMusicCache();
  const calls = [];
  const fetchImpl = async url => {
    calls.push(url);
    if (url.includes('itunes.apple.com/search')) return { ok: true, json: async () => ({ results: [track(7, 'Found'), track(8, 'Other')] }) };
    if (url.includes('api.deezer.com/search')) return { ok: true, json: async () => ({ data: [dz(70, 'Found (Remastered)', 'Artist 7'), dz(71, 'Only On Deezer', 'Someone')] }) };
    return { ok: false, status: 404 };
  };
  const tracks = await searchSongs('found', 'it', { fetchImpl });
  assert.deepEqual(tracks.map(t => t.src + ':' + t.id), ['apple:7', 'apple:8', 'deezer:71']);
  assert.equal(tracks[2].artist, 'Someone');
});

test('search still answers when one of the two catalogues is down', async () => {
  _clearMusicCache();
  const fetchImpl = async url => (url.includes('deezer') ? { ok: true, json: async () => ({ data: [dz(5, 'Song', 'A')] }) } : { ok: false, status: 503 });
  assert.deepEqual((await searchSongs('song', 'it', { fetchImpl })).map(t => t.id), ['5']);
  await assert.rejects(searchSongs('nothing', 'it', { fetchImpl: async () => ({ ok: false, status: 503 }) }));
});

test('a Deezer song gets a fresh preview address, kept a few minutes', async () => {
  _clearMusicCache();
  let n = 0;
  const fetchImpl = async url => { n++; assert.ok(url.endsWith('/track/42')); return { ok: true, json: async () => dz(42, 'X', 'Y') }; };
  assert.equal(await deezerPreview('42', { fetchImpl, now: 0 }), DZ);
  assert.equal(await deezerPreview('42', { fetchImpl, now: 60000 }), DZ);
  assert.equal(n, 1);
  assert.equal(await deezerPreview('../x', { fetchImpl }), null);
});

test('a post keeps a Deezer song without its expiring preview', () => {
  const str = (v, n) => String(v || '').slice(0, n);
  const s = cleanDeezerSong({ id: '42', title: 'X', artist: 'Y', art: 'https://e-cdns-images.dzcdn.net/images/cover/x/250x250.jpg', preview: DZ, from: 5, to: 20 }, str);
  assert.deepEqual(s, { src: 'deezer', id: '42', title: 'X', artist: 'Y', art: 'https://e-cdns-images.dzcdn.net/images/cover/x/250x250.jpg', from: 5, to: 20 });
  assert.equal(cleanDeezerSong({ id: 'abc' }, str), null);
  assert.equal(cleanDeezerSong({ id: '1', art: 'https://evil.example/x.jpg' }, str).art, undefined);
});

test('weave alternates the two lists', () => {
  const a = [{ title: 'A1', artist: 'x' }, { title: 'A2', artist: 'x' }];
  const b = [{ title: 'B1', artist: 'y' }];
  assert.deepEqual(weave(a, b).map(t => t.title), ['A1', 'B1', 'A2']);
});
