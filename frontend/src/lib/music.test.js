// The free music catalogue for posts (lib/music.js): Audius, asked directly by the phone.
import { describe, it, expect, vi } from 'vitest'
import { trackOf, trendingTracks, searchTracks, streamUrl, catalogueStartMax, catalogueDefaultStart } from './music.js'

const raw = (id, extra = {}) => ({ id, title: 'Night Run', duration: 200, user: { name: 'Lumen' }, artwork: { '150x150': 'https://art.example/150.jpg' }, ...extra })

describe('music catalogue', () => {
  it('keeps a free track as the app needs it, and leaves out gated or odd ones', () => {
    expect(trackOf(raw('aB3'))).toEqual({ src: 'audius', id: 'aB3', title: 'Night Run', artist: 'Lumen', art: 'https://art.example/150.jpg', duration: 200 })
    expect(trackOf(raw('x1', { stream_conditions: { usdc_purchase: {} } }))).toBe(null)
    expect(trackOf(raw('x2', { is_streamable: false }))).toBe(null)
    expect(trackOf(raw('../x'))).toBe(null)
    expect(trackOf(raw('x3', { artwork: { '150x150': 'http://insecure/1.jpg' } })).art).toBe(null)
  })
  it('asks trending and search with the app name, and reads { data }', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ data: [raw('a1'), raw('a2', { is_streamable: false })] }) }))
    expect((await trendingTracks({ genre: 'Rock' }, fetchImpl)).map(t => t.id)).toEqual(['a1'])
    expect(fetchImpl.mock.calls[0][0]).toBe('https://api.audius.co/v1/tracks/trending?limit=30&genre=Rock&app_name=Olympus')
    await searchTracks('eye of the tiger', fetchImpl)
    expect(fetchImpl.mock.calls[1][0]).toContain('/tracks/search?query=eye+of+the+tiger')
  })
  it('says the catalogue is down rather than throwing a network error', async () => {
    await expect(trendingTracks({}, async () => { throw new TypeError('Failed to fetch') })).rejects.toMatchObject({ code: 'catalogue-down' })
    await expect(trendingTracks({}, async () => ({ ok: false, status: 503 }))).rejects.toMatchObject({ code: 'catalogue-down' })
  })
  it('plays from the stream address; a 30-second clip starts where it fits', () => {
    expect(streamUrl('aB3')).toBe('https://api.audius.co/v1/tracks/aB3/stream?app_name=Olympus')
    expect(catalogueStartMax(200)).toBe(170)
    expect(catalogueDefaultStart(200)).toBe(67)
    expect(catalogueStartMax(20)).toBe(0)
  })
})
