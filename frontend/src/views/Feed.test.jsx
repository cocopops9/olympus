// @vitest-environment happy-dom
// Olympus Home (the feed): without a server profile it explains what the feed needs; with one it
// loads the Following feed, switches to Discover, opens the people search, and keeps a like the
// server confirmed.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { useStore } from '../store/useStore.js'

const mocks = vi.hoisted(() => ({
  nav: vi.fn(),
  feed: vi.fn(), discover: vi.fn(), search: vi.fn(), like: vi.fn(), suggested: vi.fn(), profile: vi.fn(),
}))
vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.nav }))
vi.mock('../lib/social.js', async importOriginal => ({
  ...(await importOriginal()),
  fetchFeed: (...a) => mocks.feed(...a),
  fetchDiscover: (...a) => mocks.discover(...a),
  searchUsers: (...a) => mocks.search(...a),
  setLike: (...a) => mocks.like(...a),
  fetchSuggested: (...a) => mocks.suggested(...a),
  fetchProfile: (...a) => mocks.profile(...a),
}))
import Feed from './Feed.jsx'

const post = (id, extra = {}) => ({
  id, ts: Date.now() - 60000, text: 'Leg day ' + id, author: { id: 'u_b', name: 'Ben' },
  likes: 0, liked: false, comments: [], mine: false,
  workout: { name: 'Legs', d: '2026-10-20', durMs: 3600000, vol: 4200, unit: 'kg', sets: 15, prs: 1, exercises: [{ n: 'Squat', sets: 5, best: '100×5' }] },
  ...extra,
})

let host, root
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  Object.values(mocks).forEach(m => m.mockReset())
  // Someone who already follows people: Home opens on Following, as it always has.
  mocks.profile.mockResolvedValue({ user: { id: 'u_a', following: 3 } })
  mocks.suggested.mockResolvedValue([])
})
afterEach(() => { act(() => root.unmount()); host.remove(); useStore.setState({ user: null }) })

const flush = () => act(async () => { await new Promise(r => setTimeout(r, 0)) })
const text = () => host.textContent
const button = label => [...host.querySelectorAll('button')].find(b => b.textContent === label || b.getAttribute('aria-label') === label)

describe('Feed without a server profile', () => {
  it('explains that the feed lives on a server, and asks nothing of it', async () => {
    useStore.setState({ user: null })
    await act(async () => root.render(<Feed />))
    expect(text()).toContain('Train together')
    expect(button('Connect to a server')).toBeTruthy()
    expect(mocks.feed).not.toHaveBeenCalled()
  })
})

describe('Feed with a server profile', () => {
  beforeEach(() => useStore.setState({ user: { id: 'u_a', name: 'Anna' } }))

  it('shows the Following feed with its workouts, and Discover on request', async () => {
    mocks.feed.mockResolvedValue({ posts: [post('p1')], next: null })
    mocks.discover.mockResolvedValue({ posts: [post('p2'), post('p3')], next: null })
    await act(async () => root.render(<Feed />))
    await flush()
    expect(text()).toContain('Leg day p1')
    expect(text()).toContain('Squat')
    expect(text()).toContain('100×5')
    await act(async () => button('Discover').click())
    await flush()
    expect(mocks.discover).toHaveBeenCalled()
    expect(text()).toContain('Leg day p3')
  })

  it('offers to find people when the feed is empty', async () => {
    mocks.feed.mockResolvedValue({ posts: [], next: null })
    mocks.search.mockResolvedValue([{ id: 'u_b', name: 'Ben', bio: '', followers: 0, following: 0, posts: 1, isFollowing: false, me: false }])
    await act(async () => root.render(<Feed />))
    await flush()
    expect(text()).toContain('Your feed is empty')
    await act(async () => button('Find people').click())
    await act(async () => { await new Promise(r => setTimeout(r, 300)) })
    expect(mocks.search).toHaveBeenCalledWith('')
    expect(text()).toContain('Ben')
    expect(button('Follow')).toBeTruthy()
  })

  it('likes at once and keeps what the server answers', async () => {
    mocks.feed.mockResolvedValue({ posts: [post('p1')], next: null })
    mocks.like.mockResolvedValue(post('p1', { likes: 1, liked: true }))
    await act(async () => root.render(<Feed />))
    await flush()
    await act(async () => button('Like').click())
    await flush()
    expect(mocks.like).toHaveBeenCalledWith('p1', true, 'heart')
    expect(button('Unlike')).toBeTruthy()
  })

  it('holding the like opens the reactions, and one is sent as the reaction', async () => {
    mocks.feed.mockResolvedValue({ posts: [post('p1')], next: null })
    mocks.like.mockResolvedValue(post('p1', { likes: 1, liked: true, reaction: 'fire', reactions: { fire: 1 } }))
    await act(async () => root.render(<Feed />))
    await flush()
    await act(async () => { button('Like').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })) })
    expect(document.querySelectorAll('.react-opt')).toHaveLength(6)
    await act(async () => button('On fire').click())
    await flush()
    expect(mocks.like).toHaveBeenCalledWith('p1', true, 'fire')
    expect(document.querySelector('.react-btn .react-emoji').textContent).toBe('\u{1F525}')
  })

  it('says why it could not load, with a way to try again', async () => {
    mocks.feed.mockRejectedValueOnce(Object.assign(new Error('x'), { status: undefined }))
    await act(async () => root.render(<Feed />))
    await flush()
    expect(text()).toContain('The server could not be reached.')
    mocks.feed.mockResolvedValue({ posts: [post('p9')], next: null })
    await act(async () => button('Try again').click())
    await flush()
    expect(text()).toContain('Leg day p9')
  })
})

describe('Suggested people (Olympus)', () => {
  beforeEach(() => useStore.setState({ user: { id: 'u_a', name: 'Anna' } }))

  it('opens on Suggested for someone who follows nobody, with the founder first', async () => {
    mocks.profile.mockResolvedValue({ user: { id: 'u_a', following: 0 } })
    mocks.feed.mockResolvedValue({ posts: [], next: null })
    mocks.suggested.mockResolvedValue([
      { id: 'u_c', name: 'Chaos', founder: true, followers: 12, posts: 3 },
      { id: 'u_b', name: 'Ben', followers: 4, posts: 1 },
    ])
    await act(async () => root.render(<Feed />))
    await flush(); await flush()
    expect(text()).toContain('Suggested for you')
    const names = [...host.querySelectorAll('.person-n')].map(n => n.textContent)
    expect(names[0]).toContain('Chaos')
    expect(names[1]).toContain('Ben')
  })

  it('stays on Following for someone who follows people, with Suggested one tap away', async () => {
    mocks.feed.mockResolvedValue({ posts: [post('p1')], next: null })
    mocks.suggested.mockResolvedValue([{ id: 'u_c', name: 'Chaos', founder: true, followers: 12, posts: 3 }])
    await act(async () => root.render(<Feed />))
    await flush()
    expect(text()).toContain('Leg day p1')
    expect(text()).not.toContain('Suggested for you')
    await act(async () => button('Suggested').click())
    await flush()
    expect(text()).toContain('Suggested for you')
    expect(text()).toContain('Chaos')
  })
})
