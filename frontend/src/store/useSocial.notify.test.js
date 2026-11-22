// The notification sound while the app is open: once when news or a message arrives, never for
// what was already waiting when the app opened, and the kinds switched off neither count nor sound.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ items: [], requests: 0, messages: 0, S: {}, sound: [] }))
vi.mock('../lib/social.js', () => ({
  fetchNotifications: () => Promise.resolve({ items: m.items, unread: m.items.filter(n => !n.read).length, requests: m.requests }),
  fetchChatUnread: () => Promise.resolve(m.messages),
  saveProfile: vi.fn(),
}))
vi.mock('../lib/portrait-sync.js', () => ({ syncPortrait: vi.fn() }))
vi.mock('./useStore.js', () => ({ useStore: { getState: () => ({ user: { id: 'u1' }, S: m.S }) } }))
vi.mock('../lib/sound.js', () => ({ notifySound: id => m.sound.push(id) }))

import { useSocial } from './useSocial.js'

const tick = async () => { await useSocial.getState().refresh(); await new Promise(r => setTimeout(r, 0)) }

describe('notification sound in the app', () => {
  beforeEach(() => {
    useSocial.getState().reset()
    Object.assign(m, { items: [{ kind: 'like', read: false }], requests: 0, messages: 2, S: {}, sound: [] })
  })

  it('stays quiet for what was waiting, then plays once for something new', async () => {
    await tick()
    expect(m.sound).toEqual([])
    expect(useSocial.getState().unread).toBe(1)
    await tick()
    expect(m.sound).toEqual([])
    m.items = [...m.items, { kind: 'comment', read: false }, { kind: 'follow', read: false }]
    await tick()
    expect(m.sound).toEqual(['kymbala'])
    m.messages = 3
    m.S = { notifySound: 'tetrachord' }
    await tick()
    expect(m.sound).toEqual(['kymbala', 'tetrachord'])
  })

  it('does not count or sound a kind switched off, nor follow requests when those are off', async () => {
    m.S = { newsOff: ['like', 'request'] }
    await tick()
    expect(useSocial.getState().unread).toBe(0)
    m.items = [...m.items, { kind: 'like', read: false }]
    m.requests = 1
    await tick()
    expect(useSocial.getState()).toMatchObject({ unread: 0, requests: 0 })
    expect(m.sound).toEqual([])
  })
})
