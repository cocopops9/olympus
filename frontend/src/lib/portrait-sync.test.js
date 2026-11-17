// @vitest-environment happy-dom
// Telling the server which portrait a profile shows (lib/portrait-sync.js).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { syncPortrait, portraitIdFor } from './portrait-sync.js'
import { GOD_AVATARS } from './god-avatars.js'

const user = { id: 'u_anna', name: 'Anna' }
beforeEach(() => localStorage.clear())

describe('syncPortrait', () => {
  it('sends a portrait of the sex given, once', async () => {
    const save = vi.fn().mockResolvedValue({})
    expect(await syncPortrait(user, { body: 'female' }, save)).toBe(true)
    const sent = save.mock.calls[0][0].portrait
    expect(GOD_AVATARS.find(g => g.id === sent).sex).toBe('female')
    expect(await syncPortrait(user, { body: 'female' }, save)).toBe(false)
    expect(save).toHaveBeenCalledTimes(1)
  })
  it('sends again when the sex changes, and a man gets a man', async () => {
    const save = vi.fn().mockResolvedValue({})
    await syncPortrait(user, { body: 'female' }, save)
    expect(await syncPortrait(user, { body: 'male', birth: '1990-05-05' }, save)).toBe(true)
    expect(GOD_AVATARS.find(g => g.id === save.mock.calls[1][0].portrait).sex).toBe('male')
  })
  it('chooses among all of them when no sex was given', () => {
    const ids = new Set()
    for (let i = 0; i < 300; i++) ids.add(portraitIdFor('u' + i, { body: 'male' }))
    expect(ids.size).toBe(GOD_AVATARS.length)
  })
  it('tries again later when the server does not answer', async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({})
    expect(await syncPortrait(user, { body: 'female' }, save)).toBe(false)
    expect(await syncPortrait(user, { body: 'female' }, save)).toBe(true)
  })
  it('does nothing without a profile', async () => {
    const save = vi.fn()
    expect(await syncPortrait(null, {}, save)).toBe(false)
    expect(save).not.toHaveBeenCalled()
  })
})
