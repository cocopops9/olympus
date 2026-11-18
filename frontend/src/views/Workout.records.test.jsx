import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { parseHTML } from 'linkedom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Workout from './Workout.jsx'

// (Copied set-up from Workout.stepper.test.jsx.) This file checks that a ticked set's record is
// judged again when its numbers change afterwards. The original header follows.
// This suite pins down the superset stepper regression: one tap on a +/- button must move the
// value by exactly one step. The bug was a stale closure — in a superset both ExerciseBlock
// instances share the same store subscription, so updating one member's field re-renders the
// partner and replaces the render-time `s` snapshot the button handler had closed over. The
// fix reads the current value from the store at call time. The mocked `update` below clones the
// whole state on every write (structuredClone), which is exactly what invalidates those
// snapshots, so this environment reproduces the original two-taps-per-increment behaviour.
const mocks = vi.hoisted(() => {
  const state = {
    S: null,
    startRest: vi.fn(),
    stopRest: vi.fn(),
    stopWork: vi.fn(),
    toast: vi.fn(),
  }
  state.storeSnapshot = () => ({
    S: state.S,
    user: null,
    update: mut => {
      const next = structuredClone(state.S)
      mut(next)
      state.S = next
    },
  })
  state.uiSnapshot = () => ({
    timer: null,
    work: null,
    startRest: state.startRest,
    stopRest: state.stopRest,
    stopWork: state.stopWork,
    shiftRestOwner: vi.fn(),
    startWork: vi.fn(),
    toast: state.toast,
  })
  return state
})

vi.mock('../store/useStore.js', () => {
  const useStore = selector => selector(mocks.storeSnapshot())
  useStore.getState = mocks.storeSnapshot
  return { useStore }
})
vi.mock('../store/useUI.js', () => {
  const useUI = selector => selector ? selector(mocks.uiSnapshot()) : mocks.uiSnapshot()
  useUI.getState = mocks.uiSnapshot
  return { useUI }
})
vi.mock('react-router-dom', () => ({ useNavigate: () => () => {} }))
vi.mock('../sheets.jsx', () => ({
  startFlow: vi.fn(),
  exercisePicker: vi.fn(),
  exConfigSheet: vi.fn(),
  exerciseDetailSheet: vi.fn(),
  finishWorkout: vi.fn(),
  finishWorkoutSheet: vi.fn(),
  workoutCompleteSheet: vi.fn(),
  confirmSheet: vi.fn(),
  swapActiveWorkoutExercise: vi.fn(),
  barWeightSheet: vi.fn(),
  exerciseNoteSheet: vi.fn(),
  sessionNoteSheet: vi.fn(),
  renameWorkoutSheet: vi.fn(),
}))
vi.mock('../components/Media.jsx', () => ({ default: () => null }))
vi.mock('../lib/sound.js', async orig => ({ ...(await orig()), triumph: vi.fn() }))
vi.mock('../lib/api.js', () => ({
  api: vi.fn(() => Promise.resolve({})),
  IS_APPLE: false, IS_ANDROID: false, BIO: 'biometrics',
}))

let dom
let root
let container

function exercise(id, sets, extra = {}) {
  return {
    id,
    target: { mode: 'reps', reps: 5, weight: 60, bodyweight: false },
    sets: sets.map(done => ({ w: 60, r: 5, done })),
    ...extra,
  }
}

function workout(entries, cur = 0) {
  return {
    unit: 'kg', restSec: 90, sound: false, effort: 'none', gifSize: 'full',
    workouts: [], exWeights: {}, routines: [],
    active: { id: 'active', name: 'Test workout', start: Date.now(), cur, entries },
  }
}

function installDom() {
  const parsed = parseHTML('<!doctype html><html><body><div id="root"></div></body></html>')
  dom = parsed.window
  globalThis.window = dom
  globalThis.document = dom.document
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.navigator })
  for (const key of ['HTMLElement', 'Node', 'Element', 'Event', 'Blob']) globalThis[key] = dom[key]
  dom.Element.prototype.scrollIntoView = vi.fn()
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  container = document.getElementById('root')
  root = createRoot(container)
}

async function mount(entries, cur = 0) {
  mocks.S = workout(entries, cur)
  installDom()
  await act(async () => { root.render(React.createElement(Workout)) })
}

async function unmount() {
  if (!root) return
  await act(async () => { root.unmount() })
  root = null
  container = null
  dom = null
}

// The +/- controls live in `.stp` cells, one per editable column. For a plain reps set the
// order is [weight, reps]; this returns the Increase/Decrease button for a given column of a
// given set row inside a given exercise block (addressed by its data-exidx wrapper).
function stepperButton(exidx, setRow, col, direction) {
  const block = container.querySelector(`[data-exidx="${exidx}"]`)
  expect(block).toBeTruthy()
  const row = block.querySelectorAll('.setrow')[setRow]
  expect(row).toBeTruthy()
  const cell = row.querySelectorAll('.stp')[col]
  expect(cell).toBeTruthy()
  return cell.querySelector(`button[aria-label="${direction}"]`)
}

async function tap(button) {
  expect(button).toBeTruthy()
  await act(async () => { button.dispatchEvent(new dom.Event('click', { bubbles: true })) })
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(async () => {
  await unmount()
})


const PAST = { id: 'p1', d: '2026-11-10', start: Date.parse('2026-11-10T18:00:00'), end: Date.parse('2026-11-10T19:00:00'), name: 'Before',
  entries: [{ id: 'barbell-bench-press', target: { mode: 'reps' }, sets: [{ w: 80, r: 5, done: true }] }] }

async function rerender() { await act(async () => { root.render(React.createElement(Workout)) }) }

describe('a record is judged again when a ticked set changes', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }) })
  afterEach(() => { vi.useRealTimers() })

  it('70 kg ticked is no record; raised to 85 kg afterwards it is, and lowered again the medal goes', async () => {
    const e = exercise('barbell-bench-press', [true])
    e.sets[0].w = 70
    await mount([e])
    mocks.S.workouts = [PAST]
    await rerender()
    expect(mocks.S.active.entries[0].rec || []).toEqual([])

    mocks.S = structuredClone(mocks.S)
    mocks.S.active.entries[0].sets[0].w = 85
    await rerender()
    await act(async () => { vi.advanceTimersByTime(800) })
    expect(mocks.S.active.entries[0].rec).toContain('weight')
    expect(mocks.toast.mock.calls.some(c => /New record/.test(c[0]))).toBe(true)

    const toasts = mocks.toast.mock.calls.length
    mocks.S = structuredClone(mocks.S)
    mocks.S.active.entries[0].sets[0].w = 70
    await rerender()
    await act(async () => { vi.advanceTimersByTime(800) })
    expect(mocks.S.active.entries[0].rec).not.toContain('weight')
    expect(mocks.toast.mock.calls.length).toBe(toasts)          // taking a medal back is quiet
  })

  it('a set not ticked is not judged while it is typed', async () => {
    const e = exercise('barbell-bench-press', [false])
    await mount([e])
    mocks.S.workouts = [PAST]
    await rerender()
    mocks.S = structuredClone(mocks.S)
    mocks.S.active.entries[0].sets[0].w = 100
    await rerender()
    await act(async () => { vi.advanceTimersByTime(800) })
    expect(mocks.S.active.entries[0].rec || []).toEqual([])
    expect(mocks.toast).not.toHaveBeenCalled()
  })

  // The same path the phone takes: the row's own tick, then its own + button.
  const rows = () => container.querySelectorAll('.setrow')
  const plus = (row, col) => rows()[row].querySelectorAll('.stp')[col].querySelector('button[aria-label="Increase"]')
  const tick = row => rows()[row].querySelector('button.chk')
  const settle = async () => { await rerender(); await act(async () => { vi.advanceTimersByTime(800) }) }

  it('ticked at the old best, then one more kilo on its + button: a record', async () => {
    const e = exercise('barbell-bench-press', [false])
    e.sets[0].w = 80
    await mount([e])
    mocks.S.workouts = [PAST]
    await rerender()
    await tap(tick(0))
    await settle()
    expect(mocks.S.active.entries[0].rec || []).toEqual([])
    await tap(plus(0, 0))
    await settle()
    expect(mocks.S.active.entries[0].sets[0].w).toBeGreaterThan(80)
    expect(mocks.S.active.entries[0].rec).toContain('weight')
    expect(mocks.toast.mock.calls.some(c => /New record/.test(c[0]))).toBe(true)
  })

  it('ticked at the old best, then one more rep: a 1RM record, not a weight one', async () => {
    const e = exercise('barbell-bench-press', [false])
    e.sets[0].w = 80
    await mount([e])
    mocks.S.workouts = [PAST]
    await rerender()
    await tap(tick(0))
    await settle()
    await tap(plus(0, 1))
    await settle()
    expect(mocks.S.active.entries[0].rec).toContain('rm')
    expect(mocks.S.active.entries[0].rec).not.toContain('weight')
  })

  it('two exercises changed within the wait are both judged', async () => {
    const PAST2 = structuredClone(PAST)
    PAST2.entries.push({ id: 'barbell-curl', target: { mode: 'reps' }, sets: [{ w: 30, r: 8, done: true }] })
    const a = exercise('barbell-bench-press', [true]); a.sets[0].w = 70
    const b = exercise('barbell-curl', [true]); b.sets[0].w = 25
    await mount([a, b])
    mocks.S.workouts = [PAST2]
    await rerender()
    mocks.S = structuredClone(mocks.S)
    mocks.S.active.entries[0].sets[0].w = 85
    await rerender()
    await act(async () => { vi.advanceTimersByTime(300) })
    mocks.S = structuredClone(mocks.S)
    mocks.S.active.entries[1].sets[0].w = 35
    await settle()
    expect(mocks.S.active.entries[0].rec).toContain('weight')
    expect(mocks.S.active.entries[1].rec).toContain('weight')
  })
})
