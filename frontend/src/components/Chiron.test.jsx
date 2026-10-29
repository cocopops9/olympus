// @vitest-environment happy-dom
// Olympus: Chiron in the workout. Asleep in the header; three quick taps wake him, and his sheet
// says at once how long to rest (with a button that starts it) and what the next set is, with no
// network; a question goes to the chiron coach, and a voice question is answered aloud.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'

const mocks = vi.hoisted(() => ({ sent: [], coaches: [], spoken: [] }))
vi.mock('../lib/hercules.js', async orig => ({
  ...(await orig()),
  herculesStatus: vi.fn(async () => ({ on: true, perDay: 60, left: 60 })),
  askHercules: vi.fn(async (list, coach) => { mocks.sent.push(list); mocks.coaches.push(coach); return { reply: 'Rest **3 min**, then 102.5 kg × 5.', left: 59, perDay: 60 } }),
}))
vi.mock('../lib/social.js', async orig => ({ ...(await orig()), socialReady: () => true }))
vi.mock('../lib/voice.js', async orig => ({ ...(await orig()), canListen: async () => false, canSpeak: () => true, speak: vi.fn(async text => { mocks.spoken.push(text) }) }))
import { DEF, useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { EXDB } from '../lib/exercises-data.js'
import { WorkoutChiron } from './Chiron.jsx'

const squat = EXDB.find(e => e.n === 'barbell full squat') || EXDB.find(e => (e.sm || []).length >= 2)
const roots = []
const flush = () => act(() => new Promise(r => setTimeout(r, 0)))
function mount(el) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => root.render(el))
  return host
}
const topSheet = () => { const s = useUI.getState().sheets.at(-1); return mount(s.render(() => useUI.getState().closeSheet(s.id))) }

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  mocks.sent = []; mocks.coaches = []; mocks.spoken = []
  // Starting a rest asks the server for a push at its end: answered here, never sent.
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, headers: new Headers(), json: async () => ({}), text: async () => '{}' })))
  localStorage.clear()
  useUI.setState({ sheets: [] })
  const S = structuredClone(DEF)
  S.active = { start: Date.now() - 600000, name: 'Legs', cur: 0, entries: [{ id: squat.id, sets: [{ w: 100, r: 5, done: true }, { w: 100, r: 5 }, { w: 100, r: 5 }] }] }
  useStore.setState({ S, user: { id: 'u' + Math.random(), name: 'Ada' }, ready: true })
  document.body.innerHTML = ''
})
afterEach(() => { vi.unstubAllGlobals(); act(() => { roots.splice(0).forEach(r => r.unmount()) }); vi.useRealTimers() })

describe('Chiron', () => {
  it('sleeps until tapped three times in a row', async () => {
    const host = mount(<WorkoutChiron />)
    const btn = host.querySelector('.whdr-chiron')
    expect(btn.getAttribute('aria-label')).toMatch(/asleep/)
    act(() => btn.click()); act(() => btn.click())
    expect(useUI.getState().sheets).toHaveLength(0)
    expect(host.querySelectorAll('.chiron-taps i.on')).toHaveLength(2)
    act(() => btn.click())
    expect(useUI.getState().sheets).toHaveLength(1)
  })

  it('wakes up with the rest and the next set, no question asked', async () => {
    const host = mount(<WorkoutChiron />)
    const btn = host.querySelector('.whdr-chiron')
    act(() => { btn.click(); btn.click(); btn.click() })
    const sheet = topSheet()
    await flush()
    // 5 reps on a squat: the strength range, 3 to 5 minutes.
    expect(sheet.textContent).toContain('Rest 4:00')
    expect(sheet.textContent).toContain('3:00 to 5:00 for this set')
    expect(sheet.textContent).toContain('Next set: 100 kg × 5')
    expect(sheet.textContent).toContain('2 sets left')
    const start = [...sheet.querySelectorAll('button')].find(b => b.textContent === 'Start')
    act(() => start.click())
    expect(useUI.getState().timer?.left).toBe(240)
    act(() => useUI.getState().stopRest())
  })

  it('answers a one-tap question as the chiron coach, kept in the shared memory', async () => {
    const host = mount(<WorkoutChiron />)
    const btn = host.querySelector('.whdr-chiron')
    act(() => { btn.click(); btn.click(); btn.click() })
    const sheet = topSheet()
    await flush()
    act(() => [...sheet.querySelectorAll('.chs-q .chip')].find(b => b.textContent === 'How much weight on the next set?').click())
    await flush(); await flush()
    expect(mocks.coaches).toEqual(['chiron'])
    expect(mocks.sent[0].at(-1).content).toBe('How much weight on the next set?')
    expect(sheet.querySelector('.chs-m.him strong').textContent).toBe('3 min')
    expect(JSON.parse(localStorage.getItem('olympus_coach_memory_' + useStore.getState().user.id)).chats[0].coach).toBe('chiron')
    expect(mocks.spoken).toEqual([])
  })

  it('is not there when the coach is off for workouts, or for a past workout', () => {
    useStore.setState(st => ({ S: { ...st.S, coachInWorkout: false } }))
    expect(mount(<WorkoutChiron />).querySelector('.whdr-chiron')).toBeNull()
    useStore.setState(st => ({ S: { ...st.S, coachInWorkout: true, active: { ...st.S.active, backfill: true } } }))
    expect(mount(<WorkoutChiron />).querySelector('.whdr-chiron')).toBeNull()
  })
})
