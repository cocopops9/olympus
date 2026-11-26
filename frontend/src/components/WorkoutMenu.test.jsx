// @vitest-environment happy-dom
// The workout header's ⋯ sheet, drawn against the real store: what it shows for a running
// session and for the saved-workout editor, which taps close it (actions that open something
// else) and which keep it open (the layout and the switches, which change in place).
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEF, useStore } from '../store/useStore.js'
import { WorkoutMenu, sessionLayout, settingsSummary } from './WorkoutMenu.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root
let container
let close
let actions

const session = (extra = {}) => ({ id: 's', name: 'Leg Day', d: '2026-11-26', start: 0, cur: 0, entries: [{ id: 'a', sets: [] }, { id: 'b', sets: [] }], ...extra })
function render({ active = session(), S = {}, ...overrides } = {}) {
  useStore.setState({ S: { ...structuredClone(DEF), restSec: 90, sound: false, ...S, active }, user: null })
  close = vi.fn()
  actions = {
    onRename: vi.fn(), onAddExercise: vi.fn(), onAddRoutine: vi.fn(), onMarkAllDone: null,
    onLayout: vi.fn(), onToggleCollapse: vi.fn(), onNote: vi.fn(), onToggleNoProg: vi.fn(),
    onSettings: vi.fn(), onDiscard: vi.fn(), ...overrides,
  }
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root.render(<WorkoutMenu actions={actions} close={close} />))
}
const q = sel => container.querySelector(sel)
const all = sel => [...container.querySelectorAll(sel)]
const row = title => all('.lrow').find(r => r.querySelector('.lrow-t')?.textContent === title)
const tap = el => act(() => el.click())

beforeEach(() => { root = null; container = null })
afterEach(() => {
  if (root) act(() => root.unmount())
  if (container) container.remove()
})

describe('the workout ⋯ sheet', () => {
  it('titles itself with the workout, renames from the title, and lays out add, layout, this workout and discard', () => {
    render()
    expect(q('.wmenu-name').textContent).toBe('Leg Day')
    expect(q('.wmenu-sub').textContent).toBe('2 exercises')
    expect(all('.sect-t').map(h => h.textContent)).toEqual(['Add', 'Layout', 'This workout'])
    expect(all('.wmenu-tile').map(b => b.textContent)).toEqual(['Add exercise', 'Add routine'])
    expect(all('[role="radio"]').map(b => b.textContent)).toEqual(['Cards', 'List', 'Compact', 'Focus'])
    expect(all('.wmenu .lrow-t').map(t => t.textContent)).toEqual(['Add session note', 'Don’t count for progression', 'Workout settings'])
    expect(row('Workout settings').querySelector('.lrow-s').textContent).toBe('1:30 rest · Silent')
    expect(q('.wmenu-discard').textContent).toBe('Discard workout')
    expect(q('.wmenu-done')).toBeNull()

    tap(q('.wmenu-hd'))
    expect(close).toHaveBeenCalledOnce()
    expect(actions.onRename).toHaveBeenCalledOnce()
  })

  it('closes before each action that opens something else', () => {
    for (const [pick, fn] of [
      [() => all('.wmenu-tile')[0], 'onAddExercise'],
      [() => all('.wmenu-tile')[1], 'onAddRoutine'],
      [() => row('Add session note'), 'onNote'],
      [() => row('Workout settings'), 'onSettings'],
      [() => q('.wmenu-discard'), 'onDiscard'],
    ]) {
      render()
      tap(pick())
      expect(close, fn).toHaveBeenCalledOnce()
      expect(actions[fn], fn).toHaveBeenCalledOnce()
      act(() => root.unmount()); container.remove(); root = null
    }
  })

  it('picks a layout in place, marking this session’s own over the saved one', () => {
    render({ active: session({ workoutView: 'focus' }), S: { workoutView: 'list' } })
    expect(all('[aria-checked="true"][role="radio"]').map(b => b.textContent)).toEqual(['Focus'])
    tap(all('[role="radio"]')[2])
    expect(actions.onLayout).toHaveBeenCalledWith('compact')
    expect(close).not.toHaveBeenCalled()
  })

  it('offers collapsing completed exercises only in the layouts that stack them', () => {
    render({ active: session({ workoutView: 'cards' }) })
    expect(row('Collapse completed exercises')).toBeUndefined()
    act(() => useStore.setState({ S: { ...useStore.getState().S, active: session({ workoutView: 'list', collapseCompleted: true }) } }))
    const sw = row('Collapse completed exercises').querySelector('[role="switch"]')
    expect(sw.getAttribute('aria-checked')).toBe('true')
    tap(sw)
    expect(actions.onToggleCollapse).toHaveBeenCalledOnce()
    expect(close).not.toHaveBeenCalled()
  })

  it('shows the whole-workout progression state as a switch, and leaves it out when it cannot change', () => {
    render({ active: session({ noProg: true }) })
    const sw = row('Don’t count for progression').querySelector('[role="switch"]')
    expect(sw.getAttribute('aria-checked')).toBe('true')
    tap(sw)
    expect(actions.onToggleNoProg).toHaveBeenCalledOnce()
    expect(close).not.toHaveBeenCalled()
    act(() => root.unmount()); container.remove()
    render({ onToggleNoProg: null })
    expect(row('Don’t count for progression')).toBeUndefined()
  })

  it('previews the session note and says Edit once there is one', () => {
    render({ active: session({ note: '  Left knee a bit sore  ' }) })
    expect(row('Edit session note').querySelector('.lrow-s').textContent).toBe('Left knee a bit sore')
  })

  it('in the saved-workout editor: one add tile and no discard; logging a past workout leads with Mark all sets done', () => {
    render({ onAddRoutine: null, onDiscard: null })
    expect(all('.wmenu-tile').map(b => b.textContent)).toEqual(['Add exercise'])
    expect(q('.wmenu-add').classList.contains('one')).toBe(true)
    expect(q('.wmenu-discard')).toBeNull()
    act(() => root.unmount()); container.remove()
    render({ onMarkAllDone: vi.fn() })
    tap(q('.wmenu-done'))
    expect(actions.onMarkAllDone).toHaveBeenCalledOnce()
    expect(close).toHaveBeenCalledOnce()
  })
})

describe('helpers', () => {
  it('reads the session layout, unknown values as cards', () => {
    expect(sessionLayout({ workoutView: 'list', active: {} })).toBe('list')
    expect(sessionLayout({ workoutView: 'list', active: { workoutView: 'focus' } })).toBe('focus')
    expect(sessionLayout({ workoutView: 'grid', active: null })).toBe('cards')
  })
  it('sums up rest and sound', () => {
    expect(settingsSummary({ restSec: 0, sound: true })).toBe('No rest timer · Sound')
    expect(settingsSummary({ restSec: 150, sound: false })).toBe('2:30 rest · Silent')
  })
})
