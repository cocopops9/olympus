// @vitest-environment happy-dom
// Another person's page: posts when allowed, a lock and Requested for a private profile, the
// blocked state with Unblock, and Block behind the ⋯ menu.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'

const mocks = vi.hoisted(() => ({ nav: vi.fn(), profile: vi.fn(), follow: vi.fn(), block: vi.fn() }))
vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.nav, useParams: () => ({ id: 'u_b' }), Navigate: () => null,
}))
vi.mock('../lib/social.js', async importOriginal => ({
  ...(await importOriginal()),
  fetchProfile: (...a) => mocks.profile(...a), setFollow: (...a) => mocks.follow(...a), setBlock: (...a) => mocks.block(...a),
}))
import UserProfile from './UserProfile.jsx'

const ben = extra => ({ id: 'u_b', name: 'Ben', bio: '', followers: 1, following: 0, posts: 2, isFollowing: false, requested: false, private: false, blockedByMe: false, followsMe: false, canSeePosts: true, me: false, ...extra })
const post = { id: 'p1', ts: Date.now(), text: 'bench day', author: { id: 'u_b', name: 'Ben' }, likes: 0, liked: false, comments: [], mine: false, photos: [] }

let host, root
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
  Object.values(mocks).forEach(m => m.mockReset())
  useStore.setState({ user: { id: 'u_a', name: 'Anna' } })
})
afterEach(() => { act(() => root.unmount()); host.remove(); useStore.setState({ user: null }); useUI.setState({ sheets: [] }) })
const flush = () => act(async () => { await new Promise(r => setTimeout(r, 0)) })
const button = label => [...document.querySelectorAll('button')].find(b => b.textContent === label || b.getAttribute('aria-label') === label)
const render = async () => { await act(async () => root.render(<UserProfile />)); await flush() }

describe('UserProfile', () => {
  it('shows the posts of a public profile', async () => {
    mocks.profile.mockResolvedValue({ user: ben(), posts: [post], next: null })
    await render()
    expect(host.textContent).toContain('bench day')
    expect(button('Follow')).toBeTruthy()
  })

  it('locks a private profile, and reads Requested once asked', async () => {
    mocks.profile.mockResolvedValue({ user: ben({ private: true, canSeePosts: false }), posts: [], next: null })
    mocks.follow.mockResolvedValue(ben({ private: true, canSeePosts: false, requested: true }))
    await render()
    expect(host.textContent).toContain('This profile is private.')
    expect(host.textContent).toContain('Follow Ben to ask to see their posts.')
    await act(async () => button('Follow').click())
    await flush()
    expect(mocks.follow).toHaveBeenCalledWith('u_b', true)
    expect(button('Requested')).toBeTruthy()
    expect(host.textContent).toContain('Your request is waiting for Ben to answer.')
  })

  it('blocks from the menu after asking, and offers Unblock', async () => {
    mocks.profile.mockResolvedValue({ user: ben(), posts: [post], next: null })
    mocks.block.mockResolvedValue(ben({ blockedByMe: true, canSeePosts: false }))
    await render()
    const modals = document.createElement('div'); document.body.appendChild(modals)
    // The sheets render through the Modals component in the app; here their render functions are called directly.
    await act(async () => button('More').click())
    const sheets = useUI.getState().sheets
    expect(sheets.length).toBe(1)
    const r2 = createRoot(modals)
    await act(async () => r2.render(sheets[0].render(() => {})))
    await act(async () => button('Block').click())
    const confirm = useUI.getState().sheets.at(-1)
    await act(async () => r2.render(confirm.render(() => {})))
    expect(modals.textContent).toContain('They are not told.')
    await act(async () => [...modals.querySelectorAll('button')].find(b => b.textContent === 'Block').click())
    await flush()
    expect(mocks.block).toHaveBeenCalledWith('u_b', true)
    expect(host.textContent).toContain('You blocked Ben')
    expect(button('Unblock')).toBeTruthy()
    act(() => r2.unmount()); modals.remove()
  })
})
