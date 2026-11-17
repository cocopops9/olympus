// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { coverOf, setCover, learnCovers, isVideoCover, _resetCovers } from './workout-cover.js'

describe('workout covers', () => {
  beforeEach(() => { localStorage.clear(); _resetCovers() })

  it('a photo is the cover, a video is marked with a tilde', () => {
    learnCovers([{ wid: 'w1', photos: ['ph1'] }, { wid: 'w2', photos: [], video: { id: 'vid9', secs: 8 } }])
    expect(coverOf('w1')).toBe('ph1')
    expect(coverOf('w2')).toBe('~vid9')
    expect(isVideoCover(coverOf('w1'))).toBe(false)
    expect(isVideoCover(coverOf('w2'))).toBe(true)
  })

  it('a photo wins when a post somehow has both', () => {
    learnCovers([{ wid: 'w3', photos: ['ph3'], video: { id: 'vid3', secs: 5 } }])
    expect(coverOf('w3')).toBe('ph3')
  })

  it('a post that lost its video forgets the cover', () => {
    learnCovers([{ wid: 'w4', video: { id: 'v4', secs: 5 } }])
    expect(coverOf('w4')).toBe('~v4')
    learnCovers([{ wid: 'w4', photos: [] }])
    expect(coverOf('w4')).toBe(null)
  })

  it('setCover takes a video marker and refuses a junk one', () => {
    setCover('w5', '~vidX')
    expect(coverOf('w5')).toBe('~vidX')
    setCover('w5', '~a b')
    expect(coverOf('w5')).toBe(null)
  })
})
