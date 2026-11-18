// @vitest-environment happy-dom
// The sheet a tapped muscle opens on the Profile map: the week's exercises for that muscle,
// biggest contribution first, each with its share of the muscle's effective sets.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../sheets.jsx', () => ({ exerciseHistorySheet: vi.fn() }))
vi.mock('./Media.jsx', () => ({ Thumb: () => null }))

const { MuscleWeek } = await import('./MuscleWeek.jsx')
const { exerciseHistorySheet } = await import('../sheets.jsx')

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container, root
beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => { act(() => root.unmount()); container.remove() })

const sets = n => Array.from({ length: n }, () => ({ w: 50, r: 8, done: true }))
const WEEK = [{ id: 'w1', entries: [
  { id: 'x-bench', exercise: { n: 'Bench', muscleWeights: { chest: 1, triceps: 0.4 } }, sets: sets(5) },
  { id: 'x-pushdown', exercise: { n: 'Pushdown', muscleWeights: { triceps: 1 } }, sets: sets(3) },
] }]

describe('MuscleWeek', () => {
  it('lists the exercises by contribution with their share, and opens a history on tap', async () => {
    const close = vi.fn()
    await act(async () => { root.render(<MuscleWeek slug="triceps" workouts={WEEK} close={close} />) })
    const items = [...container.querySelectorAll('.item')]
    // pushdown: 3 x 1 = 3; bench: 5 x 0.4 = 2; shares 60% and 40%.
    expect(items.map(i => i.querySelector('.tt').textContent)).toEqual(['Pushdown', 'Bench'])
    expect(items.map(i => i.querySelector('.tag').textContent)).toEqual(['60%', '40%'])
    await act(async () => { items[1].click() })
    expect(close).toHaveBeenCalled()
    expect(exerciseHistorySheet).toHaveBeenCalledWith('x-bench')
  })

  it('says so when nothing trained the muscle', async () => {
    await act(async () => { root.render(<MuscleWeek slug="calves" workouts={WEEK} close={() => {}} />) })
    expect(container.querySelectorAll('.item')).toHaveLength(0)
    expect(container.querySelector('.empty')).toBeTruthy()
  })
})
