// The portraits of gods and heroes (lib/god-avatars.js).
import { describe, it, expect } from 'vitest'
import { GOD_AVATARS, avatarUrl, godFor } from './god-avatars.js'

describe('the portraits', () => {
  it('offers eight, each with a picture', () => {
    expect(GOD_AVATARS.map(g => g.id)).toEqual(['apollo', 'achilles', 'artemis', 'hermes', 'poseidon', 'ares', 'perseus', 'nike'])
    for (const g of GOD_AVATARS) expect(avatarUrl('god:' + g.id)).toBe(g.url)
  })
  it('still shows a picture picked from the first set', () => {
    expect(avatarUrl('god:demeter')).toMatch(/^data:image\/svg\+xml/)
    expect(avatarUrl('god:hephaestus')).toMatch(/^data:image\/svg\+xml/)
    expect(avatarUrl('god:zeus')).toBe(null)
  })
  it('gives a profile without a picture the same portrait every time', () => {
    expect(godFor('u_anna')).toBe(godFor('u_anna'))
    expect(GOD_AVATARS).toContain(godFor('u_anna'))
  })
})
