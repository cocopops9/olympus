// Songs for a post (lib/music.js): Apple's charts and search, through the Olympus server.
import { describe, it, expect, vi } from 'vitest'

vi.mock('./api.js', () => ({ api: vi.fn() }))
import { api } from './api.js'
import { musicCountry, topSongs, searchSongs, songOf, onlineSource } from './music.js'

describe('music catalogue', () => {
  it('picks the chart of the phone’s region, else of the app’s language', () => {
    expect(musicCountry('it-IT', 'en')).toBe('it')
    expect(musicCountry('en_GB', 'en')).toBe('gb')
    expect(musicCountry('es', 'es')).toBe('es')
    expect(musicCountry('', 'pt-br')).toBe('br')
    expect(musicCountry('', 'xx')).toBe('us')
  })
  it('asks the server for the chart and for a search', async () => {
    api.mockResolvedValueOnce({ tracks: [{ id: '1' }] }).mockResolvedValueOnce({ tracks: [] })
    expect(await topSongs('it')).toEqual([{ id: '1' }])
    expect(api.mock.calls[0][0]).toBe('/api/music/top?country=it')
    await searchSongs('kid yugi', 'it')
    expect(api.mock.calls[1][0]).toBe('/api/music/search?q=kid+yugi&country=it')
  })
  it('says the catalogue is down when the server cannot answer', async () => {
    api.mockRejectedValueOnce(Object.assign(new Error('x'), { status: 502 }))
    await expect(topSongs('it')).rejects.toMatchObject({ code: 'catalogue-down' })
  })
  it('a post keeps the track and plays its preview', () => {
    const tr = { id: '9', title: 'Hit', artist: 'Star', art: 'https://is1-ssl.mzstatic.com/a.jpg', preview: 'https://audio-ssl.itunes.apple.com/p.m4a', explicit: false }
    const s = songOf(tr)
    expect(s).toEqual({ src: 'apple', id: '9', title: 'Hit', artist: 'Star', art: tr.art, preview: tr.preview })
    expect(onlineSource(s)).toBe(tr.preview)
    expect(onlineSource({ id: 'abc', title: 'mine' })).toBe(null)
  })
})
