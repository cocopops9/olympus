// @vitest-environment happy-dom
// The Stats page shows the statistics chosen in the picker (lib/stats-cards.js), in that order,
// and invites to the ones left out; with nothing chosen it opens on the short default set.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Stats from './Stats.jsx'
import { useUI } from '../store/useUI.js'

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
    mount({ statsCards: ['highlights', 'summary', 'activity', 'progress', 'muscles', 'weekly', 'effort', 'structural', 'photos', 'recent'] })
    expect(host.querySelector('.stats-more')).toBe(null)
    expect(headings()).toContain('Progress photos')
  })
})

// Simple (the default) or Detailed (S.statsDetail): Simple keeps one curve and says in a sentence
// what it did; Detailed has every view. Each card explains itself behind its ⓘ.
describe('Stats: simple and detailed', () => {
  const earlier = { ...workout, id: 'w0', start: start - 10 * 86400000, d: new Date(start - 10 * 86400000).toISOString().slice(0, 10),
    entries: [{ ...workout.entries[0], sets: [{ w: 70, r: 5, done: true }] }] }
  const metricButtons = () => [...host.querySelectorAll('.seg button')].map(b => b.textContent)

  it('opens on Simple: the highlights, one curve and what it did, in words', () => {
    mount({ statsCards: null, workouts: [earlier, workout] })
    expect(host.querySelector('[data-stats-detail]').dataset.statsDetail).toBe('simple')
    expect(headings()).toContain('Highlights')
    expect(metricButtons()).not.toContain('Est. 1RM')
    expect(host.querySelector('[data-trend]').textContent).toContain('Better by 10 kg')
  })
  it('Detailed brings every view back, without the sentence', () => {
    mount({ statsCards: null, statsDetail: 'detailed', workouts: [earlier, workout] })
    expect(metricButtons()).toEqual(expect.arrayContaining(['Top set', 'Est. 1RM']))
    expect(host.querySelector('[data-trend]')).toBe(null)
  })
  it('a card\'s ⓘ opens what it shows, with the method folded under it', () => {
    mount({ statsCards: ['progress'] })
    act(() => host.querySelector('#stats-progress .guide-info').click())
    const sheet = useUI.getState().sheets.at(-1)
    expect(sheet).toBeTruthy()
    act(() => useUI.getState().closeAll())
  })
})
