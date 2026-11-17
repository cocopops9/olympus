// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { frameOf, setFrame, captureMissing, _resetFrames } from './video-frame.js'

vi.mock('./social.js', () => ({ videoBlob: vi.fn() }))

const URL_OK = 'data:image/jpeg;base64,AAAA'

describe('video frames', () => {
  beforeEach(() => { localStorage.clear(); _resetFrames() })
  afterEach(() => { localStorage.clear(); _resetFrames() })

  it('keeps a frame and hands it back, also after a reload', () => {
    setFrame('vid1', URL_OK)
    expect(frameOf('vid1')).toBe(URL_OK)
    _resetFrames()
    expect(frameOf('vid1')).toBe(URL_OK)
  })

  it('refuses ids and data that are not what a frame is', () => {
    setFrame('../x', URL_OK)
    setFrame('vid2', 'http://evil.example/x.jpg')
    expect(frameOf('../x')).toBe(null)
    expect(frameOf('vid2')).toBe(null)
  })

  it('keeps the newest 40 frames', () => {
    for (let i = 0; i < 45; i++) setFrame('v' + i, URL_OK + i)
    expect(frameOf('v0')).toBe(null)
    expect(frameOf('v44')).toBe(URL_OK + '44')
  })

  it('captureMissing fetches only videos without a frame, newest few, and survives a failed fetch', async () => {
    setFrame('have', URL_OK)
    const get = vi.fn().mockRejectedValue(new Error('offline'))
    const n = await captureMissing([{ video: { id: 'have' } }, { video: { id: 'a' } }, { text: 'no video' }, { video: { id: 'b' } }], 4, get)
    expect(n).toBe(0)
    expect(get.mock.calls.map(c => c[0])).toEqual(['a', 'b'])
  })

  it('captureMissing ignores a list that is not one', async () => {
    expect(await captureMissing(null)).toBe(0)
  })
})
