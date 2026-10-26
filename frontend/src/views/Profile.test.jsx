// @vitest-environment happy-dom
// Olympus Profile: the header and its counts, the Overview / Stats tabs (Posts only with a
// server profile), the calendar behind its header button, and the rows that reach the screens
// that used to be tabs.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { useStore } from '../store/useStore.js'
import { todayISO } from '../lib/format.js'

const mocks = vi.hoisted(() => ({ nav: vi.fn(), params: new URLSearchParams(), profile: vi.fn(), calendar: vi.fn() }))
vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.nav,
  useSearchParams: () => [mocks.params, next => { mocks.params = new URLSearchParams(next) }],
}))
vi.mock('../lib/social.js', async importOriginal => ({ ...(await importOriginal()), fetchProfile: (...a) => mocks.profile(...a) }))
// The three embedded screens have suites of their own; here only that the right one is shown.
vi.mock('./Stats.jsx', () => ({ default: ({ embedded }) => <div data-testid="stats">{embedded ? 'embedded stats' : 'stats'}</div> }))
vi.mock('./Measurements.jsx', () => ({ default: () => <div data-testid="measurements">measurements</div> }))
vi.mock('./Home.jsx', () => ({ BodyWeightCard: () => <div data-testid="bw">body weight</div> }))
vi.mock('../sheets.jsx', () => ({
  WorkoutRow: ({ w }) => <div className="wrow">{w.name}</div>,
  workoutDetailSheet: vi.fn(), logPastWorkoutSheet: vi.fn(), calendarSheet: mocks.calendar,
}))
import Profile from './Profile.jsx'

let host, root
const render = () => act(async () => root.render(<Profile />))
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  mocks.params = new URLSearchParams()
  mocks.nav.mockReset(); mocks.profile.mockReset()
  useStore.setState(s => ({ S: { ...s.S, workouts: [{ id: 'w1', name: 'Push', d: todayISO(), start: 0, end: 0, entries: [] }], bodyweight: [] } }))
})
afterEach(() => { act(() => root.unmount()); host.remove(); useStore.setState({ user: null }) })
const button = label => [...host.querySelectorAll('button')].find(b => b.textContent === label || b.textContent.endsWith(label))

describe('Profile on a device kept local', () => {
  beforeEach(() => useStore.setState({ user: null }))

  it('shows training counts, this week and its workouts, and no Posts tab; the calendar is a button away', async () => {
    await render()
    expect(host.textContent).toContain('This week')
    expect(host.querySelector('.ov-day.on.now')).toBeTruthy()
    expect(host.querySelector('.wrow').textContent).toBe('Push')
    expect(host.textContent).toContain('Training on this device only.')
    expect([...host.querySelectorAll('.seg button')].map(b => b.textContent)).toEqual(['Overview', 'Stats'])
    act(() => host.querySelector('button[aria-label="Calendar"]').click())
    expect(mocks.calendar).toHaveBeenCalled()
    expect(mocks.profile).not.toHaveBeenCalled()
  })

  it('reaches Plan, Exercises, Body & wellbeing and Settings from its Training section', async () => {
    await render()
    for (const [label, to] of [['Plan', '/plan'], ['Exercises', '/library'], ['Today’s training', '/today'], ['Body & wellbeing', '/body']]) {
      const row = [...host.querySelectorAll('.lrow')].find(r => r.querySelector('.lrow-t')?.textContent === label)
      act(() => row.click())
      expect(mocks.nav).toHaveBeenLastCalledWith(to)
    }
  })

  it('opens the tab the address names; the old Body tab is gone from the profile', async () => {
    mocks.params = new URLSearchParams('tab=body')
    await render()
    expect(host.querySelector('[data-testid="bw"]')).toBeNull()
    expect(host.querySelector('[data-testid="measurements"]')).toBeNull()
    expect(host.textContent).toContain('This week')
    mocks.params = new URLSearchParams('tab=stats')
    await render()
    expect(host.textContent).toContain('embedded stats')
  })
})

describe('Profile with a server profile', () => {
  it('shows followers, following and posts from the server, and a Posts tab', async () => {
    useStore.setState({ user: { id: 'u_a', name: 'Anna Rossi' } })
    mocks.profile.mockResolvedValue({ user: { id: 'u_a', name: 'Anna Rossi', bio: 'Powerlifting', followers: 3, following: 2, posts: 1, me: true }, posts: [], next: null })
    await render()
    await act(async () => { await new Promise(r => setTimeout(r, 0)) })
    expect(mocks.profile).toHaveBeenCalledWith('')
    expect(host.textContent).toContain('Powerlifting')
    const counts = [...host.querySelectorAll('.prof-counts button')].map(b => b.textContent)
    expect(counts).toEqual(['1Workouts', '3Followers', '2Following', '1Posts'])
    expect([...host.querySelectorAll('.seg button')].map(b => b.textContent)).toContain('Posts')
    expect(host.querySelector('.avatar').textContent).toBe('AR')
  })
})
