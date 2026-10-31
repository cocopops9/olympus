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
