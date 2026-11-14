// @vitest-environment happy-dom
// Olympus: the owner's dashboard (views/Owner.jsx): the tabs, one person in parts, and the posts
// the owner can remove. What stays private stays out: no training for someone who does not share
// statistics, and never a message.
import React, { act } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRoot } from 'react-dom/client'

const mocks = vi.hoisted(() => ({ nav: vi.fn(), calls: [], replies: {} }))
vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.nav }))
vi.mock('../lib/api.js', () => ({
  api: vi.fn(async (path, init) => {
    mocks.calls.push({ path, body: init?.body ? JSON.parse(init.body) : null })
    const key = Object.keys(mocks.replies).find(k => path.startsWith(k))
    if (!key) { const e = new Error('not found'); e.status = 404; throw e }
    return mocks.replies[key]
  }),
}))

import Owner from './Owner.jsx'
import { useUI } from '../store/useUI.js'

const NOW = Date.now()
const iso = ts => new Date(ts).toISOString()
const person = (id, name, extra = {}) => ({
  id, name, created: iso(NOW - 90 * 86400000), email: null, referredBy: null, invited: 0, shares: true, lastSeen: NOW - 3600000,
  platform: 'android', version: '1.0', sessions: 12, seconds: 5400, activeDays: 9, seconds7: 600, sessions7: 3, posts: 0, ...extra,
})
const dashboard = () => ({
  at: NOW, today: iso(NOW).slice(0, 10),
  totals: { users: 3, sharing: 2, active1: 1, active7: 2, active30: 2, signups30: 1, referred: 0, avgSessionMin: 7.5 },
  series: [{ day: iso(NOW).slice(0, 10), active: 1, sessions: 2, minutes: 14, signups: 0 }],
  screens: [{ path: '/home', seconds: 900, users: 2 }],
  events: [{ name: 'workout.finish', n: 4, users: 2 }],
  people: [
    person('ann', 'Ann', { posts: 2 }),
    person('bob', 'Bob', { shares: false, lastSeen: null, created: iso(NOW - 2 * 86400000) }),
    person('cat', 'Cat', { lastSeen: NOW - 40 * 86400000 }),
  ],
  referrals: [],
  feedback: { count: 1, ratings: { clarity: 4, enjoy: 5, useful: 4, recommend: 9 }, nps: 100, items: [{ id: 'f1', name: 'Ann', at: NOW - 1000, ratings: { recommend: 9 }, text: 'Love the coaches' }] },
  community: { posts: 5, postsPeriod: 3, workoutPosts: 1, comments: 4, commentsPeriod: 2, likes: 9, follows: 6, posters: 2, privateProfiles: 1 },
})
const post = (id, text, extra = {}) => ({ id, ts: NOW - 60000, text, photos: 0, video: false, song: null, workout: null, likes: 1, comments: 0, ...extra })
const detail = (extra = {}) => ({
  id: 'ann', name: 'Ann', days: [{ day: iso(NOW).slice(0, 10), sessions: 2, minutes: 14 }], screens: [{ path: '/home', seconds: 600 }],
  events: [{ name: 'workout.finish', n: 4 }], recent: [{ t: NOW - 5000, type: 'open' }],
  social: { posts: 2, followers: 3, following: 1, private: false, bio: '', commentsWritten: 5, likesGiven: 7, blocked: 0, latest: [post('p1', 'Leg day done')] },
  training: { finished: 21, started: 24, discarded: 2, fromRoutine: 18, routines: 2, exercises: 1, first: '2026-08-01', last: '2026-11-13', weeks: [0, 2, 3, 3, 2, 3, 3, 1], days: [{ day: '2026-11-13', finished: 1 }, { day: '2026-11-11', finished: 2 }] },
  conversations: 4, coachesToday: { hercules: 3, athena: 0, chiron: 0, calliope: 0 },
  ...extra,
})

// The sheets the page opens, drawn the way the app's own host does: the latest one, with close.
function Sheets() {
  const sheets = useUI(s => s.sheets)
  const top = sheets[sheets.length - 1]
  return top ? <div data-testid="sheet">{top.render(() => useUI.getState().closeSheet(top.id))}</div> : null
}

let host, root
const flush = () => act(async () => { await new Promise(r => setTimeout(r, 0)) })
const show = async () => { await act(async () => root.render(<><Owner /><Sheets /></>)); await flush() }
const within = el => ({
  click: async label => {
    const b = [...el.querySelectorAll('button')].find(x => (typeof label === 'string' ? x.textContent.trim() === label : label.test(x.textContent)))
    if (!b) throw new Error('no button ' + label + ' in: ' + [...el.querySelectorAll('button')].map(x => x.textContent.trim()).join(' | '))
    await act(async () => b.click()); await flush()
  },
})
const page = () => within(host)
const sheet = () => host.querySelector('[data-testid="sheet"]')
const tab = name => page().click(name)

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
  mocks.calls.length = 0; mocks.nav.mockReset()
  mocks.replies = { '/api/owner/dashboard': dashboard(), '/api/owner/person': detail(), '/api/owner/posts': { posts: [post('p9', 'Spam here', { uid: 'ann', name: 'Ann' })], more: false }, '/api/social/posts/delete': { ok: true } }
  useUI.setState({ sheets: [] })
})
afterEach(() => { act(() => root.unmount()); host.remove(); useUI.setState({ sheets: [] }) })

describe('the owner dashboard', () => {
  it('opens on the overview, with the people to look at', async () => {
    await show()
    expect(host.textContent).toContain('active today')
    expect(host.querySelector('[role="tab"][aria-selected="true"]').textContent).toBe('Overview')
    expect(host.textContent).toContain('New this week (1)')
    expect(host.textContent).toContain('Gone quiet (1)')
    expect(host.textContent).not.toContain('Latest posts')
  })

  it('filters the people, and shows one person in parts', async () => {
    await show()
    await tab('People')
    expect(host.textContent).toContain('People (3)')
    await page().click(/^No statistics/)
    expect(host.textContent).toContain('People (1 of 3)')
    await page().click(/^Everyone/)
    await page().click(/^Ann/)
    expect(sheet().textContent).toContain('Minutes per day, last 30 days')
    await within(sheet()).click('Training')
    expect(sheet().textContent).toContain('workouts finished')
    expect(sheet().textContent).toContain('2 workouts')
    expect(sheet().textContent).toContain('18 started from a routine')
    expect(sheet().textContent).toContain('never shown')
    await within(sheet()).click('Community')
    expect(sheet().textContent).toContain('Leg day done')
    expect(sheet().textContent).toContain('conversations')
    expect(sheet().textContent).toContain('Hercules: 3 today')
    expect(sheet().textContent).toContain('never what they say')
    await within(sheet()).click('Open their profile')
    expect(mocks.nav).toHaveBeenLastCalledWith('/u/ann')
    expect(sheet()).toBeNull()
  })

  it('keeps the training of someone who does not share statistics private', async () => {
    mocks.replies['/api/owner/person'] = detail({ id: 'bob', name: 'Bob', days: [], screens: [], events: [], recent: [], training: null })
    await show()
    await tab('People')
    await page().click(/^Bob/)
    // Their public posts are what there is to see, so the sheet opens there.
    expect(sheet().textContent).toContain('Leg day done')
    await within(sheet()).click('Training')
    expect(sheet().textContent).toContain('does not share usage statistics')
    await within(sheet()).click('Usage')
    expect(sheet().textContent).toContain('does not share usage statistics')
  })

  it('does not show what a private profile posts', async () => {
    const d = detail()
    mocks.replies['/api/owner/person'] = { ...d, social: { ...d.social, private: true, latest: [] } }
    mocks.replies['/api/owner/posts'] = { posts: [], more: false, hidden: 3 }
    await show()
    await tab('People')
    await page().click(/^Ann/)
    await within(sheet()).click('Community')
    expect(sheet().textContent).toContain('only the followers it accepted see its posts')
    await within(sheet()).click('Done')
    await tab('Community')
    expect(host.textContent).toContain('3 posts of private profiles are not listed')
  })

  it('removes a post only after asking again', async () => {
    await show()
    await tab('Community')
    expect(host.textContent).toContain('Spam here')
    expect(host.textContent).toContain('posts in 30 d')
    await page().click('Remove')
    expect(mocks.calls.some(c => c.path === '/api/social/posts/delete')).toBe(false)
    expect(host.textContent).toContain('cannot be brought back')
    await page().click('Remove')
    expect(host.textContent).not.toContain('Spam here')
    expect(mocks.calls.find(c => c.path === '/api/social/posts/delete').body).toEqual({ id: 'p9' })
  })

  it('says so when the server is older than the page', async () => {
    delete mocks.replies['/api/owner/posts']
    const old = dashboard(); delete old.community
    mocks.replies['/api/owner/dashboard'] = old
    await show()
    await tab('Community')
    expect(host.textContent).toContain('The server has to be updated to show this.')
  })

  it('shows the feedback and the export in tabs of their own, and comes back to the last tab', async () => {
    await show()
    await tab('Feedback')
    expect(host.textContent).toContain('Love the coaches')
    await tab('Export')
    expect(host.textContent).toContain('Everything (JSON)')
    act(() => root.unmount()); root = createRoot(host)
    await show()
    expect(host.querySelector('[role="tab"][aria-selected="true"]').textContent).toBe('Export')
    await tab('Overview')
  })
})
