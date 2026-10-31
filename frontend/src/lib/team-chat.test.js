// @vitest-environment happy-dom
// Hercules and Athena in one conversation (lib/hercules.js): the shared list, and the other
// coach's answers marked when a conversation is sent. With them, the workout's picture in the
// lists (lib/workout-cover.js) and the song clip of a post (lib/song.js).
import { describe, it, expect, vi, beforeEach } from 'vitest'
const sent = vi.hoisted(() => ({ calls: [] }))
vi.mock('./api.js', async orig => ({ ...(await orig()), api: vi.fn(async (path, init) => { sent.calls.push([path, JSON.parse(init?.body || '{}')]); return { reply: 'ok', left: 1, perDay: 2 } }) }))
import { askHercules, chatBucket, BOTH, lastCoach, setLastCoach } from './hercules.js'
import { setCover, coverOf, learnCovers, _resetCovers } from './workout-cover.js'
import { clipSamples, wavBytes, titleFromFile, clipStartMax, defaultStart } from './song.js'

beforeEach(() => { sent.calls = []; localStorage.clear(); _resetCovers() })

describe('one conversation for Hercules and Athena', () => {
  it('keeps both, and Both, in the shared list; your own coaches apart', () => {
    expect(chatBucket('hercules')).toBe('team')
    expect(chatBucket('athena')).toBe('team')
    expect(chatBucket(BOTH)).toBe('team')
    expect(chatBucket('chiron')).toBe('chiron')
    expect(chatBucket('own_abc')).toBe('own_abc')
  })
  it('marks the other coach\'s answers, never the asked coach\'s own', async () => {
    const list = [
      { role: 'user', content: 'Squat or deadlift first?' },
      { role: 'assistant', content: 'Squat first.', coach: 'hercules' },
      { role: 'assistant', content: 'Deadlift on its own day.', coach: 'athena' },
      { role: 'user', content: 'Athena?' },
    ]
    await askHercules(list, 'athena')
    const [path, body] = sent.calls[0]
    expect(path).toBe('/api/athena')
    expect(body.messages.map(m => m.content)).toEqual(['Squat or deadlift first?', '[Hercules answered this one] Squat first.', 'Deadlift on its own day.', 'Athena?'])
    // his answer is a message of the conversation for her, not one of her own turns
    expect(body.messages.map(m => m.role)).toEqual(['user', 'user', 'assistant', 'user'])
    expect(body.messages.every(m => !('coach' in m))).toBe(true)
  })
  it('asked right after the other coach (Both), the conversation still ends on a message to answer', async () => {
    await askHercules([{ role: 'user', content: 'Plan?' }, { role: 'assistant', content: 'Squats.', coach: 'hercules' }], 'athena')
    expect(sent.calls[0][1].messages.at(-1)).toEqual({ role: 'user', content: '[Hercules answered this one] Squats.' })
  })
  it('a "both" kept by the version before reads as Hercules', () => {
    localStorage.setItem('olympus_coach_last_u1', 'both')
    expect(lastCoach('u1')).toBe('hercules')
  })
})

describe('the picture of a workout', () => {
  it('learns your posts\' first photos, and forgets one taken off', () => {
    learnCovers([{ wid: 'w1', photos: ['ph1abc', 'ph2abc'] }, { wid: 'w2', photos: [] }, { photos: ['x1y2z3'] }])
    expect(coverOf('w1')).toBe('ph1abc')
    expect(coverOf('w2')).toBe(null)
    setCover('w2', 'ph3abc')
    expect(coverOf('w2')).toBe('ph3abc')
    learnCovers([{ wid: 'w1', photos: [] }])
    expect(coverOf('w1')).toBe(null)
    expect(JSON.parse(localStorage.getItem('olympus_wcover'))).toEqual({ w2: 'ph3abc' })
  })
})

describe('the song clip', () => {
  const buffer = (seconds, rate = 44100, channels = 2) => {
    const len = seconds * rate
    const data = Array.from({ length: channels }, (_, c) => Float32Array.from({ length: len }, (_, i) => (c ? -0.5 : 0.5) + 0.25 * Math.sin(i / 10)))
    return { sampleRate: rate, length: len, duration: seconds, numberOfChannels: channels, getChannelData: c => data[c] }
  }
  it('cuts 30 seconds, mono, at 22050 a second, faded at both ends', () => {
    const s = clipSamples(buffer(120), 40)
    expect(s.length).toBe(30 * 22050)
    expect(Math.abs(s[0])).toBeLessThan(1e-6)
    expect(Math.abs(s[s.length - 1])).toBeLessThan(0.05)
    // the two channels averaged: the opposite offsets cancel, the shared wave stays
    expect(Math.max(...s.slice(30000, 31000).map(Math.abs))).toBeLessThanOrEqual(0.26)
  })
  it('a short song gives what it has', () => {
    expect(clipSamples(buffer(10), 0).length).toBe(10 * 22050)
    expect(clipStartMax(10)).toBe(0)
    expect(clipStartMax(200)).toBe(170)
    expect(defaultStart(200)).toBe(67)
  })
  it('writes a WAV the server accepts: RIFF, WAVE, 16-bit mono', () => {
    const bytes = wavBytes(new Float32Array([0, 1, -1, 0.5]), 22050)
    const text = (a, b) => String.fromCharCode(...bytes.subarray(a, b))
    expect(text(0, 4)).toBe('RIFF'); expect(text(8, 12)).toBe('WAVE'); expect(text(36, 40)).toBe('data')
    const v = new DataView(bytes.buffer)
    expect(v.getUint16(22, true)).toBe(1)
    expect(v.getUint32(24, true)).toBe(22050)
    expect(v.getInt16(46, true)).toBe(32767)
    expect(v.getInt16(48, true)).toBe(-32768)
    expect(bytes.length).toBe(44 + 8)
  })
  it('titles a song from its file name', () => {
    expect(titleFromFile('02 - Eye of the Tiger.mp3')).toBe('Eye of the Tiger')
    expect(titleFromFile('Till_I_Collapse.m4a')).toBe('Till I Collapse')
  })
})
