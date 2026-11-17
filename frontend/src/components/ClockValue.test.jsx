// @vitest-environment happy-dom
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { useUI } from '../store/useUI.js'
import ClockValue from './ClockValue.jsx'

const mounted = []
const mount = node => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push(root)
  act(() => root.render(node))
  return host
}
const topSheet = () => {
  const sheet = useUI.getState().sheets.at(-1)
  return mount(sheet.render(() => useUI.getState().closeSheet(sheet.id)))
}
const type = (input, value) => {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  act(() => { set.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })) })
}

describe('ClockValue', () => {
  beforeEach(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true; useUI.setState({ sheets: [] }); document.body.innerHTML = '' })
  afterEach(() => { act(() => mounted.splice(0).forEach(r => r.unmount())) })

  it('shows whole minutes as the plain number and seconds as a clock', () => {
    expect(mount(<ClockValue value={30} onChange={() => {}} title="Duration" />).textContent).toBe('30')
    expect(mount(<ClockValue value={30.2667} onChange={() => {}} title="Duration" />).textContent).toBe('30:16')
    expect(mount(<ClockValue value={90.2667} onChange={() => {}} title="Duration" />).textContent).toBe('1:30:16')
  })

  it('one hour, 30 minutes and 16 seconds typed in the sheet is saved as minutes', () => {
    const onChange = vi.fn()
    const host = mount(<ClockValue value={20} onChange={onChange} title="Duration" />)
    act(() => host.querySelector('button.clk-val').click())
    const sheet = topSheet()
    const [h, m, s] = sheet.querySelectorAll('input.num')
    expect([h.value, m.value, s.value]).toEqual(['0', '20', '0'])
    type(h, '1'); type(m, '30'); type(s, '16')
    expect(sheet.querySelector('.dw-read').textContent).toBe('1:30:16')
    const done = [...sheet.querySelectorAll('button')].find(b => b.textContent === 'Done')
    act(() => done.click())
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(Math.round(onChange.mock.calls[0][0] * 60)).toBe(5416)
  })

  it('seconds over 59 are carried into the minutes', () => {
    const onChange = vi.fn()
    const host = mount(<ClockValue value={0} onChange={onChange} title="Duration" />)
    act(() => host.querySelector('button.clk-val').click())
    const sheet = topSheet()
    type(sheet.querySelectorAll('input.num')[2], '90')
    expect(sheet.querySelector('.dw-read').textContent).toBe('1:30')
    act(() => [...sheet.querySelectorAll('button')].find(b => b.textContent === 'Done').click())
    expect(onChange.mock.calls[0][0]).toBe(1.5)
  })
})
