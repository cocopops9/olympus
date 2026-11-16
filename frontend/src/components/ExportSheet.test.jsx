// @vitest-environment happy-dom
// Export data (components/ExportSheet.jsx): the choice of data, period and format, and the file.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { unzipSync } from 'fflate'

const saved = vi.hoisted(() => ({ files: [] }))
vi.mock('../lib/mobile.js', async importOriginal => ({ ...(await importOriginal()), MOBILE: true, shareExport: async (text, name) => { saved.files.push({ name, data: text }) }, shareExportBlob: async (blob, name) => { saved.files.push({ name, data: new Uint8Array(await blob.arrayBuffer()) }) } }))
import { ExportSheet } from './ExportSheet.jsx'
import { useStore } from '../store/useStore.js'
import { todayISO } from '../lib/format.js'

const today = todayISO()
const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10) }
let host, root, closed
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
  saved.files.length = 0; closed = 0
  useStore.setState(st => ({ S: { ...st.S, unit: 'kg',
    workouts: [
      { id: 'a', d: today, start: Date.now() - 3600000, end: Date.now(), name: 'Push', entries: [{ id: '0025', sets: [{ w: 80, r: 5, done: true }] }] },
      { id: 'b', d: daysAgo(60), start: 1, end: 2, name: 'Old', entries: [{ id: '0025', sets: [{ w: 70, r: 5, done: true }] }] },
    ],
    bodyweight: [{ d: daysAgo(2), w: 80 }], measurements: [], routines: [] } }))
})
afterEach(() => { act(() => root.unmount()); host.remove() })
const flush = () => act(async () => { await new Promise(r => setTimeout(r, 0)) })
const show = async () => { await act(async () => root.render(<ExportSheet close={() => { closed++ }} />)); await flush() }
const button = label => [...host.querySelectorAll('button')].find(b => b.textContent.trim() === label)
const click = async el => { await act(async () => el.click()); await flush() }

describe('Export data', () => {
  it('counts what the period holds and exports workouts of the last 30 days as CSV', async () => {
    await show()
    expect(host.textContent).toContain('Workouts: 1, sets: 1')
    await click(button('Export'))
    expect(saved.files).toHaveLength(1)
    expect(saved.files[0].name).toMatch(/^olympus-workouts-.*\.csv$/)
    expect(saved.files[0].data).toContain('Push')
    expect(saved.files[0].data).not.toContain('Old')
    expect(closed).toBe(1)
  })

  it('exports everything, two tables in Excel', async () => {
    await show()
    await click(button('Everything'))
    expect(host.textContent).toContain('Workouts: 2, sets: 2')
    const sw = host.querySelectorAll('[role="switch"], input[type="checkbox"]')
    await click(sw[1])
    await click(button('Excel'))
    expect(host.textContent).toContain('Excel workbook')
    await click(button('Export'))
    expect(saved.files[0].name).toMatch(/^olympus-data-all_.*\.xlsx$/)
    expect(Object.keys(unzipSync(saved.files[0].data))).toContain('xl/worksheets/sheet2.xml')
  })

  it('offers a range of dates of your own, and says when it holds nothing', async () => {
    await show()
    await click(button('Choose dates'))
    expect(host.querySelectorAll('input[type="date"]')).toHaveLength(2)
    await click(button('Last 7 days'))
    const sw = host.querySelectorAll('[role="switch"], input[type="checkbox"]')
    await click(sw[0])
    expect(button('Nothing to export in this period').disabled).toBe(true)
  })
})
