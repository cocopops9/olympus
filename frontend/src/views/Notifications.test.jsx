// @vitest-environment happy-dom
// The notifications screen: requests to answer first, then what happened, words and links, and
// everything marked read once seen.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { useStore } from '../store/useStore.js'
import { useSocial } from '../store/useSocial.js'

const mocks = vi.hoisted(() => ({ nav: vi.fn(), notes: vi.fn(), reqs: vi.fn(), answer: vi.fn(), read: vi.fn() }))
vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.nav, Navigate: () => null }))
vi.mock('../lib/social.js', async importOriginal => ({
  ...(await importOriginal()),
  fetchNotifications: (...a) => mocks.notes(...a), fetchRequests: (...a) => mocks.reqs(...a),
  answerRequest: (...a) => mocks.answer(...a), markNotificationsRead: (...a) => mocks.read(...a),
}))
import Notifications from './Notifications.jsx'

const ben = { id: 'u_b', name: 'Ben' }
let host, root
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
  Object.values(mocks).forEach(m => m.mockReset())
  useStore.setState({ user: { id: 'u_a', name: 'Anna' } })
})
afterEach(() => { act(() => root.unmount()); host.remove(); useStore.setState({ user: null }) })
const flush = () => act(async () => { await new Promise(r => setTimeout(r, 0)) })
const button = label => [...host.querySelectorAll('button')].find(b => b.textContent === label)

describe('Notifications', () => {
  it('lists what happened, opens the post or the person, and marks it all read', async () => {
    mocks.notes.mockResolvedValue({ unread: 2, requests: 0, items: [
      { id: 'n1', kind: 'comment', ts: Date.now(), read: false, postId: 'p1', text: 'beast', from: ben },
      { id: 'n2', kind: 'follow', ts: Date.now(), read: true, postId: null, text: '', from: ben },
    ] })
    mocks.reqs.mockResolvedValue([])
    mocks.read.mockResolvedValue({ unread: 0, requests: 0, items: [] })
    useSocial.setState({ unread: 2 })
    await act(async () => root.render(<Notifications />))
    await flush()
    expect(host.textContent).toContain('Ben commented: beast')
    expect(host.textContent).toContain('Ben started following you')
    expect(host.querySelectorAll('.note.unread')).toHaveLength(1)
    expect(mocks.read).toHaveBeenCalled()
    expect(useSocial.getState().unread).toBe(0)
    act(() => host.querySelectorAll('.note')[0].click())
    expect(mocks.nav).toHaveBeenLastCalledWith('/post/p1')
    act(() => host.querySelectorAll('.note')[1].click())
    expect(mocks.nav).toHaveBeenLastCalledWith('/u/u_b')
  })

  it('answers follow requests', async () => {
    // The waiting request is shown once, with its buttons; an older one from someone else stays.
    mocks.notes.mockResolvedValue({ unread: 0, requests: 1, items: [
      { id: 'n1', kind: 'request', ts: Date.now(), read: false, postId: null, text: '', from: ben },
      { id: 'n2', kind: 'request', ts: Date.now(), read: true, postId: null, text: '', from: { id: 'u_c', name: 'Cleo' } },
    ] })
    mocks.reqs.mockResolvedValue([{ ...ben, bio: '', followers: 0, posts: 0, isFollowing: false, me: false }])
    mocks.read.mockResolvedValue({ unread: 0, requests: 1, items: [] })
    mocks.answer.mockResolvedValue([])
    await act(async () => root.render(<Notifications />))
    await flush()
    expect(host.textContent).toContain('Follow requests')
    expect(host.textContent).not.toContain('Ben wants to follow you')
    expect(host.textContent).toContain('Cleo wants to follow you')
    await act(async () => button('Accept').click())
    await flush()
    expect(mocks.answer).toHaveBeenCalledWith('u_b', true)
    expect(host.textContent).not.toContain('Follow requests')
    expect(useSocial.getState().requests).toBe(0)
  })

  it('says when there is nothing new', async () => {
    mocks.notes.mockResolvedValue({ unread: 0, requests: 0, items: [] })
    mocks.reqs.mockResolvedValue([])
    mocks.read.mockResolvedValue({ unread: 0, requests: 0, items: [] })
    await act(async () => root.render(<Notifications />))
    await flush()
    expect(host.textContent).toContain('Nothing new')
  })
})
