// @vitest-environment happy-dom
// Olympus: finishing a workout queues its post and the summary says where it stands; a workout
// with no set checked off is not posted, and the summary says so instead of staying silent.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'

vi.mock('./lib/social.js', async orig => ({
  ...(await orig()),
  createPost: vi.fn(() => new Promise(() => {})),   // the network never answers: stays waiting
  deletePost: vi.fn(async () => ({ ok: true })),
}))
import { DEF, useStore } from './store/useStore.js'
import { useUI } from './store/useUI.js'
import { finishWorkout } from './sheets.jsx'

const clone = v => JSON.parse(JSON.stringify(v))
const mounted = []
function renderTop() {
  const sheet = useUI.getState().sheets.at(-1)
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push(root)
  act(() => root.render(sheet.render(() => useUI.getState().closeSheet(sheet.id))))
  return host
}
function install(sets, extra = {}) {
  const st = clone(DEF)
  Object.assign(st, extra)
  st.active = {
    id: 'fin1', d: '2026-10-25', start: Date.now() - 20 * 60000, routineId: null, name: 'Freestyle', bw: null, cur: 0,
    entries: [{ id: '0025', target: { mode: 'reps', sets: sets.length, reps: 8, weight: 60 }, sets }],
  }
  useStore.setState({ S: st, user: { id: 'u1', name: 'Chaos' }, ready: true })
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  localStorage.clear()
  useUI.setState({ sheets: [], timer: null, work: null })
})
afterEach(() => {
  mounted.splice(0).forEach(r => act(() => r.unmount()))
  document.body.innerHTML = ''
})

describe('finishing a workout posts it', () => {
  it('queues the post, names the workout after its muscles, and says it is being posted', () => {
    install([{ w: 60, r: 8, done: true }, { w: 60, r: 8, done: true }])
    act(() => finishWorkout())
    const w = useStore.getState().S.workouts.at(-1)
    expect(w.name).toMatch(/^Chest /)
    expect(useStore.getState().S.wposts).toEqual({ fin1: '' })
    const host = renderTop()
    expect(host.querySelector('.post-status').textContent).toMatch(/Posting to your feed|posted when you are back online/)
  })

  it('a workout with no set checked off is not posted, and the summary says why', () => {
    install([{ w: 60, r: 8, done: false }])
    act(() => finishWorkout())
    // "Nothing logged yet": finish anyway
    const confirm = renderTop()
    act(() => [...confirm.querySelectorAll('button')].find(b => b.textContent.trim() === 'Finish anyway').click())
    expect(useStore.getState().S.wposts || {}).toEqual({})
    const host = renderTop()
    expect(host.querySelector('.post-status').textContent).toContain('Not posted: no set was checked off.')
  })

  it('with posting switched off, the summary offers to post it anyway', () => {
    install([{ w: 60, r: 8, done: true }], { autoPost: false })
    act(() => finishWorkout())
    const host = renderTop()
    expect(host.querySelector('.post-status').textContent).toContain('posting every workout is off')
    act(() => [...host.querySelectorAll('.post-status button')][0].click())
    expect(useStore.getState().S.wposts).toEqual({ fin1: '' })
  })
})
