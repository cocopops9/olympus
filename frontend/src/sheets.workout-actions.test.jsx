// @vitest-environment happy-dom
// A finished workout's actions (2026-11-24): one column of eleven look-alike buttons was hard to
// read, so they now come as the main action, then groups with a header each (details, training
// from it again, sharing), and deleting it last, apart from the rest.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRoot } from 'react-dom/client'
import { DEF, useStore } from './store/useStore.js'
import { useUI } from './store/useUI.js'
import { workoutDetailSheet } from './sheets.jsx'

const clone = v => JSON.parse(JSON.stringify(v))
let root, host
const w = { id: 'w1', d: '2026-09-15', start: Date.UTC(2026, 8, 15, 17), end: Date.UTC(2026, 8, 15, 18), name: 'Push', vol: 0, prs: [], routineIds: [], entries: [] }

function mountWith(state) {
  const S = clone(DEF)
  Object.assign(S, { unit: 'kg', routines: [], workouts: [w], active: null }, state)
  useStore.setState({ S, user: null })
  workoutDetailSheet(w)
  const sheet = useUI.getState().sheets.at(-1)
  act(() => root.render(sheet.render(() => useUI.getState().closeSheet(sheet.id))))
}
const groups = () => [...host.querySelectorAll('.wd-actions .menu-group')].map(g => [
  g.querySelector('.menu-sec').textContent,
  [...g.querySelectorAll('button.menu-item')].map(b => b.textContent.trim()),
])

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  useUI.setState({ sheets: [] })
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove() })

describe('finished workout actions', () => {
  it('come grouped and in order: edit first, then details, train again, share, and delete last', () => {
    mountWith({})
    expect(groups()).toEqual([
      ['Details', ['Change date & time', 'Change duration']],
      ['Train again', ['Resume workout', 'Repeat today', 'Save as routine']],
      ['Share', ['Share as image', 'Copy as text', 'Export as .fit file']],
    ])
    const buttons = [...host.querySelectorAll('button')].map(b => b.textContent.trim())
    const at = label => buttons.indexOf(label)
    expect(at('Edit workout')).toBeGreaterThan(-1)
    expect(at('Edit workout')).toBeLessThan(at('Change date & time'))
    expect(buttons.at(-1)).toBe('Delete workout')
    expect(host.querySelector('.btn.primary').textContent.trim()).toBe('Edit workout')
  })

  it('keeps the rows that start a session disabled while another workout is running', () => {
    mountWith({ active: { entries: [] } })
    const row = label => [...host.querySelectorAll('button.menu-item')].find(b => b.textContent.trim() === label)
    expect(row('Resume workout').disabled).toBe(true)
    expect(row('Repeat today').disabled).toBe(true)
    expect(row('Change duration').disabled).toBe(false)
  })
})
