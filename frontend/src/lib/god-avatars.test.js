// The portraits of gods and heroes (lib/god-avatars.js).
import { describe, it, expect } from 'vitest'
import { GOD_AVATARS, avatarUrl, godFor, portraitSexOf } from './god-avatars.js'

describe('the portraits', () => {
  it('offers ten, each with a picture', () => {
    expect(GOD_AVATARS.map(g => g.id)).toEqual(['apollo', 'achilles', 'artemis', 'atalanta', 'hermes', 'poseidon', 'hippolyta', 'ares', 'perseus', 'nike'])
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
  it('has four women and six men', () => {
    expect(GOD_AVATARS.filter(g => g.sex === 'female').map(g => g.id)).toEqual(['artemis', 'atalanta', 'hippolyta', 'nike'])
    expect(GOD_AVATARS.filter(g => g.sex === 'male')).toHaveLength(6)
  })
  it('gives a woman a woman and a man a man, whoever the profile is', () => {
    for (let i = 0; i < 60; i++) {
      expect(godFor('u' + i, 'female').sex).toBe('female')
      expect(godFor('u' + i, 'male').sex).toBe('male')
    }
  })
  it('spreads profiles with no sex over all ten', () => {
    const seen = new Set()
    for (let i = 0; i < 400; i++) seen.add(godFor('user-' + i).id)
    expect(seen.size).toBe(10)
  })
  it('knows the sex only when it was given', () => {
    expect(portraitSexOf({ body: 'female' })).toBe('female')
    expect(portraitSexOf({ body: 'male', birth: '1990-01-01' })).toBe('male')
    expect(portraitSexOf({ body: 'male' })).toBe(null)   // the starting value, not an answer
    expect(portraitSexOf({})).toBe(null)
  })
})
