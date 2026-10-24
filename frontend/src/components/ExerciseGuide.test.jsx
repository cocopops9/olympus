// @vitest-environment happy-dom
// The picker opens on the body: a tap on a muscle lists its exercises, the tiles list cardio and
// the rest, the + adds at once, and "Search by name" opens the full search list.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { DEF, useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { exercisePicker } from '../sheets.jsx'

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
const button = (host, text) => [...host.querySelectorAll('button')].find(b => b.textContent.includes(text))
const names = host => [...host.querySelectorAll('.eg-row .tt')].map(el => el.textContent)
async function bodyReady(host) {
  for (let i = 0; i < 50 && !host.querySelector('.eg-map path[aria-label]'); i++) await act(() => new Promise(r => setTimeout(r, 20)))
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  globalThis.__olympusGuide = true
  useUI.setState({ sheets: [], toastMsg: '' })
  useStore.setState({ S: structuredClone(DEF), user: null })
  document.body.innerHTML = ''
})
afterEach(() => {
  delete globalThis.__olympusGuide
  act(() => { mounted.splice(0).forEach(root => root.unmount()) })
})

describe('body-first exercise picker', () => {
  it('a tap on the chest lists the bench press first, and + adds it at once', async () => {
    const onPick = vi.fn()
    exercisePicker(onPick)
    const host = renderTop()
    expect(host.textContent).toContain('Tap the muscle you want to train')
    await bodyReady(host)
    const chest = host.querySelector('.eg-map path[aria-label="Chest"]')
    await act(async () => { chest.dispatchEvent(new MouseEvent('click', { bubbles: true })); await new Promise(r => setTimeout(r, 250)) })
    expect(host.querySelector('h3').textContent).toBe('Chest')
    expect(names(host).slice(0, 2)).toEqual(['barbell bench press', 'dumbbell bench press'])
    act(() => host.querySelector('.eg-add').click())
    expect(onPick).toHaveBeenCalledTimes(1)
    expect(onPick.mock.calls[0][0].n).toBe('barbell bench press')
    expect(onPick.mock.calls[0][1]).toBe(true)
    // Back to the body.
    act(() => host.querySelector('.eg-top .iconbtn').click())
    expect(host.textContent).toContain('Tap the muscle you want to train')
  })

  it('the cardio tile lists running, and the search bar opens the full list', () => {
    exercisePicker(() => {})
    const host = renderTop()
    act(() => button(host, 'Cardio').click())
    expect(names(host)).toContain('run')
    act(() => host.querySelector('.eg-top .iconbtn').click())
    act(() => host.querySelector('.eg-search').click())
    expect(host.querySelector('input.input').placeholder).toMatch(/^Search .* exercises/)
    act(() => button(host, 'Body').click())
    expect(host.textContent).toContain('Tap the muscle you want to train')
  })

  it('a swap still opens on the search list', () => {
    exercisePicker(() => {}, { like: useStore.getState().S.routines[0]?.ex[0]?.id || '0025' })
    const host = renderTop()
    expect(host.querySelector('.eg-map')).toBeNull()
    expect(host.querySelector('input.input')).not.toBeNull()
  })
})
