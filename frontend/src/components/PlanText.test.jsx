// @vitest-environment happy-dom
// "Write a workout or a plan" (components/PlanText.jsx): the text goes to the chosen coach, the
// draft shows what was matched and what was not, and saving adds routines on their weekdays or
// starts the workout at once.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { DEF, useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'

const mocks = vi.hoisted(() => ({ calls: [], plan: null, fail: null }))
vi.mock('../lib/api.js', async importOriginal => ({
  ...(await importOriginal()),
  api: vi.fn(async (path, opts) => {
    mocks.calls.push({ path, body: opts?.body ? JSON.parse(opts.body) : null })
    if (path === '/api/hercules' || path === '/api/athena') return { on: true, perDay: 20, left: 7 }
    if (mocks.fail) throw Object.assign(new Error('x'), { status: 422, data: { code: mocks.fail } })
    return { plan: mocks.plan, missed: mocks.missed || [], left: 6, perDay: 20 }
  }),
}))

const { planTextSheet } = await import('./PlanText.jsx')

const ex = (name, more = {}) => ({ name, sets: 3, reps: 10, repsMin: 0, weight: 0, seconds: 0, minutes: 0, superset: '', note: '', ...more })
const mounted = []
function Host() {
  const sheets = useUI(s => s.sheets)
  return <>{sheets.map(s => <div key={s.id} className="sheet-host">{s.render(() => useUI.getState().closeSheet(s.id))}</div>)}</>
}
function render() {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push(root)
  act(() => root.render(<MemoryRouter><Host /></MemoryRouter>))
  return host
}
const button = (host, text) => [...host.querySelectorAll('button')].find(b => b.textContent.includes(text))
const flush = () => act(() => new Promise(r => setTimeout(r, 0)))
const type = (el, value) => {
  const set = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
  act(() => { set.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })) })
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  mocks.calls = []; mocks.fail = null; mocks.missed = []
  localStorage.clear()
  useUI.setState({ sheets: [], toastMsg: '' })
  const S = structuredClone(DEF)
  S.weighIn = false
  S.routines = [{ id: 'mine', name: 'Legs', emoji: 'legs', ex: [{ id: '0043', sets: 3, reps: 8 }] }]
  S.week = { 1: ['mine'] }
  useStore.setState({ S, user: { id: 'u1', name: 'ada' } })
  document.body.innerHTML = ''
})
afterEach(() => { act(() => { mounted.splice(0).forEach(r => r.unmount()) }) })

describe('a plan written as text', () => {
  it('goes to the chosen coach, and comes back as routines to check', async () => {
    mocks.plan = { kind: 'plan', name: 'PPL', comment: 'Weights guessed.', routines: [
      { name: 'Push', days: [1, 4], exercises: [ex('barbell bench press', { sets: 4, reps: 8, weight: 80 }), ex('qqqqzzzz xxyyww')] },
      { name: 'Pull', days: [2], exercises: [ex('pull-up', { sets: 4, reps: 8 })] },
    ] }
    const host = render()
    act(() => planTextSheet())
    await flush()
    act(() => button(host, 'Athena').click())
    type(host.querySelector('textarea'), 'Push lunedì e giovedì: panca 4x8 80 kg...')
    await act(async () => { button(host, 'Turn it into routines').click() })
    await flush()
    const ask = mocks.calls.find(c => c.path === '/api/athena/plan')
    expect(ask.body).toMatchObject({ text: 'Push lunedì e giovedì: panca 4x8 80 kg...', unit: 'kg' })
    expect(host.textContent).toContain('Your plan')
    expect(host.textContent).toContain('Weights guessed.')
    expect(host.textContent).toContain('Not found: 1')
    expect(host.querySelectorAll('.pt-routine')).toHaveLength(2)
    expect(host.querySelector('.pt-item.missing')).not.toBeNull()

    // Monday already has "Legs": saving asks first, then replaces only Monday
    act(() => button(host, 'Save the plan').click())
    const confirm = [...document.querySelectorAll('button')].find(b => b.textContent === 'Replace')
    expect(confirm).toBeTruthy()
    act(() => confirm.click())
    const S = useStore.getState().S
    expect(S.routines.map(r => r.name)).toEqual(['Legs', 'Push', 'Pull'])
    const push = S.routines[1]
    expect(push.ex.map(e => e.id)).toEqual(['0025'])
    expect(S.week[1]).toEqual([push.id])
    expect(S.week[4]).toEqual([push.id])
    expect(S.week[2]).toEqual([S.routines[2].id])
  })

  it('a single workout starts at once, without saving a routine', async () => {
    mocks.plan = { kind: 'workout', name: 'Quick', routines: [{ name: 'Quick', days: [], exercises: [ex('barbell bench press', { sets: 2, reps: 5, weight: 60 }), ex('plank', { reps: 0, seconds: 40 })] }] }
    const host = render()
    act(() => planTextSheet())
    await flush()
    type(host.querySelector('textarea'), 'bench 2x5 60, plank 40s')
    await act(async () => { button(host, 'Turn it into routines').click() })
    await flush()
    expect(host.textContent).toContain('Your workout')
    act(() => button(host, 'Start now').click())
    const S = useStore.getState().S
    expect(S.routines).toHaveLength(1)
    expect(S.active.name).toBe('Quick')
    expect(S.active.routineIds).toEqual([])
    expect(S.active.entries.map(e => e.id)).toEqual(['0025', expect.any(String)])
    expect(S.active.entries.every(e => !e.rid)).toBe(true)
    expect(useUI.getState().sheets).toHaveLength(0)
  })

  it('says so when the coach finds no workout, and keeps the text', async () => {
    mocks.fail = 'plan-text-unclear'
    const host = render()
    act(() => planTextSheet())
    await flush()
    type(host.querySelector('textarea'), 'hello')
    await act(async () => { button(host, 'Turn it into routines').click() })
    await flush()
    expect(host.querySelector('.pt-err').textContent).toContain('could not find a workout')
    expect(host.querySelector('textarea').value).toBe('hello')
  })

  it('a dated plan is saved as one week on its dates, and Undo takes it all back', async () => {
    const item = (line, name, more = {}) => ({ line, name, sets: 3, reps: 10, repsMin: 0, weight: 0, seconds: 0, minutes: 0, restSec: 0, warmupSets: 0, group: '', note: '', ...more })
    mocks.plan = { kind: 'plan', name: 'Nov 10 to 15', comment: '', sessions: [
      { name: 'A Push + lats', date: '2026-11-10', days: [2], items: [item(2, 'lever incline chest press', { restSec: 90, warmupSets: 2, group: 'A' }), item(3, 'lever front pulldown', { restSec: 90, group: 'A' })] },
      { name: 'Football', date: '2026-11-12', days: [4], items: [item(5, 'football', { activity: true, sets: 1, reps: 0, minutes: 60 })] },
      { name: 'Rest', date: '2026-11-14', days: [6], rest: true, items: [] },
    ] }
    mocks.missed = [{ line: 4, text: '* B Shoulder press machine: 2 × 6 to 10, rest 2 min, 84 kg.' }]
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-10T09:00:00'))
    try {
      const host = render()
      act(() => planTextSheet())
      await flush()
      type(host.querySelector('textarea'), 'Tuesday Nov 10: A, Push + lats...')
      await act(async () => { button(host, 'Turn it into routines').click() })
      await flush()
      expect(mocks.calls.find(c => c.path === '/api/hercules/plan').body.today).toBe('2026-11-10')
      expect(host.querySelectorAll('.pt-routine')).toHaveLength(2)
      expect(host.querySelectorAll('.pt-restday')).toHaveLength(1)
      expect(host.querySelectorAll('.pt-date')).toHaveLength(2)
      expect(host.textContent).toContain('Lines left out: 1')
      expect(host.textContent).toContain('Left out by Hercules')
      expect(host.textContent).toContain('1:30 rest')
      expect(host.textContent).toContain('2 warm-up sets')
      expect(host.textContent).toContain('Put it on its dates')
      expect(host.querySelectorAll('.pt-ss')).toHaveLength(2)
      act(() => button(host, 'Save the plan').click())
      let S = useStore.getState().S
      expect(S.routines.map(r => r.name)).toEqual(['Legs', 'A Push + lats', 'Football'])
      expect(S.queue).toMatchObject({ label: 'Nov 10 to 15', startsOn: '2026-11-10', ids: [S.routines[1].id, S.routines[2].id] })
      expect(S.dayPlan['2026-11-10']).toBe(S.routines[1].id)
      expect(S.dayPlan['2026-11-14']).toBe('rest')
      expect(S.week).toEqual({ 1: ['mine'] })
      const toast = useUI.getState()
      expect(toast.toastMsg).toContain('Plan saved: Nov 10 to 15')
      act(() => toast.toastAction.run())
      S = useStore.getState().S
      expect(S.routines.map(r => r.name)).toEqual(['Legs'])
      expect(S.queue ?? null).toBeNull()
      expect(S.dayPlan['2026-11-10']).toBeUndefined()
    } finally { vi.useRealTimers() }
  })

  it('needs a server account', () => {
    useStore.setState({ user: null })
    act(() => planTextSheet())
    expect(useUI.getState().sheets).toHaveLength(0)
    expect(useUI.getState().toastMsg).toContain('Sign in')
  })
})
