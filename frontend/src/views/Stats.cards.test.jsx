// @vitest-environment happy-dom
// The Stats page shows the statistics chosen in the picker (lib/stats-cards.js), in that order,
// and invites to the ones left out; with nothing chosen it opens on the short default set.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Stats from './Stats.jsx'

const mocks = vi.hoisted(() => ({ S: null }))
vi.mock('../store/useStore.js', () => ({ useStore: Object.assign(selector => selector({ S: mocks.S }), { getState: () => ({ S: mocks.S, update: () => {} }) }) }))
vi.mock('react-router-dom', () => ({ useNavigate: () => () => {} }))
vi.mock('../sheets.jsx', () => ({ calendarSheet: () => {}, dayOverrideSheet: () => {}, workoutDetailSheet: () => {}, exerciseHistorySheet: () => {}, WorkoutRow: () => null }))
vi.mock('../components/LineChart.jsx', () => ({ default: () => null }))
vi.mock('../components/Heatmap.jsx', () => ({ default: () => null }))
vi.mock('../components/BodyMap.jsx', () => ({ default: () => null, BodyMapLegend: () => null }))

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const start = Date.now() - 86400000
const workout = { id: 'w1', d: new Date(start).toISOString().slice(0, 10), start, end: start + 3600000, name: 'Push',
  entries: [{ id: '0025', target: { id: '0025', sets: 1, reps: 5 }, sets: [{ w: 80, r: 5, done: true }] }] }
let root, host
afterEach(() => { act(() => root.unmount()); host.remove() })
function mount(extra) {
  mocks.S = { body: 'male', effort: 'none', unit: 'kg', targetW: null, bodyweight: [], routines: [], exWeights: {}, workouts: [workout], ...extra }
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root.render(<Stats />))
}
const headings = () => [...host.querySelectorAll('.card h2, h4.sec')].map(h => h.textContent.trim().split(' ·')[0])

describe('Stats: chosen cards', () => {
  it('nothing chosen: the default set, and the rest offered at the bottom', () => {
    mount({ statsCards: null })
    expect(headings()).toContain('Exercise progress')
    expect(headings()).not.toContain('Progress photos')
    expect(host.querySelector('.stats-more').textContent).toMatch(/more statistic/)
  })
  it('a choice shows only those cards, in its order', () => {
    mount({ statsCards: ['recent', 'activity'] })
    expect(headings()).toEqual(['Recent workouts', 'Activity'])
    expect(host.querySelector('.tiles')).toBe(null)
  })
  it('every card chosen: no invitation', () => {
    mount({ statsCards: ['summary', 'activity', 'progress', 'muscles', 'weekly', 'effort', 'structural', 'photos', 'recent'] })
    expect(host.querySelector('.stats-more')).toBe(null)
    expect(headings()).toContain('Progress photos')
  })
})
