// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import LineChart from './LineChart.jsx'
import { fmtDate, isoOf } from '../lib/format.js'
import { useStore } from '../store/useStore.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const point = (year, month, day, y) => ({
  d: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
  t: new Date(year, month - 1, day, 12).getTime(),
  y
})

const firstPoints = [
  { t: Date.UTC(2026, 0, 1), y: 80, d: '2026-01-01' },
  { t: Date.UTC(2026, 0, 15), y: 82, d: '2026-01-15' },
]
const nextPoints = [
  { t: Date.UTC(2026, 1, 1), y: 78, d: '2026-02-01' },
  { t: Date.UTC(2026, 1, 15), y: 79, d: '2026-02-15' },
]

function renderChart(points) {
  act(() => root.render(<LineChart points={points} axes={false} unit="kg" />))
}

function hoverAt(clientX) {
  act(() => {
    container.querySelector('.chart-i').dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX }))
  })
  return container.querySelector('.ctip').textContent
}

describe('LineChart hover date', () => {
  it('keeps same-year points in the compact format', () => {
    const first = point(2026, 1, 15, 70)
    renderChart([first, point(2026, 2, 15, 71)])

    expect(hoverAt(0)).toBe(`${fmtDate(first.d, true)} · 70 kg`)
  })

  it('includes the calendar year at a short cross-year boundary', () => {
    const first = point(2025, 11, 30, 70)
    const last = point(2026, 2, 1, 71)
    renderChart([first, last])

    expect(hoverAt(0)).toBe(`${fmtDate(first.d, true, true)} · 70 kg`)
    expect(hoverAt(340)).toBe(`${fmtDate(last.d, true, true)} · 71 kg`)
  })

  it('keeps a single point compact', () => {
    const only = point(2026, 7, 4, 70)
    renderChart([only])

    expect(hoverAt(170)).toBe(`${fmtDate(only.d, true)} · 70 kg`)
  })

  it('uses timestamp-only points when deciding whether to show the year', () => {
    const first = point(2025, 12, 31, 70)
    const last = point(2026, 1, 1, 71)
    const timestampOnly = [{ t: first.t, y: first.y }, { t: last.t, y: last.y }]
    renderChart(timestampOnly)

    const lastIso = isoOf(new Date(last.t))
    expect(hoverAt(340)).toBe(`${fmtDate(lastIso, true, true)} · 71 kg`)
  })
})

describe('LineChart hover state', () => {
  it('clears the tooltip and hover markers when points are replaced, then allows hovering again', () => {
    renderChart(firstPoints)
    hoverAt(170)

    expect(container.querySelector('.ctip')).toBeTruthy()
    expect(container.querySelector('.cvl')).toBeTruthy()
    expect(container.querySelector('.chl')).toBeTruthy()

    renderChart(nextPoints)

    expect(container.querySelector('.ctip')).toBeNull()
    expect(container.querySelector('.cvl')).toBeNull()
    expect(container.querySelector('.chl')).toBeNull()

    hoverAt(170)
    expect(container.querySelector('.ctip')).toBeTruthy()
    expect(container.querySelector('.cvl')).toBeTruthy()
  })
})

describe('LineChart y axis', () => {
  it('labels the zero line 0, never -0, when the range dips just below zero', () => {
    act(() => root.render(<LineChart points={[point(2026, 1, 1, 70), point(2026, 1, 8, 9999)]} axes unit="kg" />))
    const labels = [...container.querySelectorAll('text')].map(n => n.textContent)
    expect(labels).toContain('0')
    expect(labels.some(l => /^[-\u2212]0$/.test(l))).toBe(false)
  })
})

describe('LineChart time axis', () => {
  it('places points by date and marks each new year on a multi-year history', () => {
    // A June 2024 session, then nothing until September 2025: the gap must take its real width.
    const pts = [point(2024, 6, 10, 100), point(2024, 6, 24, 102), point(2025, 9, 15, 110)]
    act(() => root.render(<LineChart points={pts} axes unit="kg" />))
    const labels = [...container.querySelectorAll('text')].map(n => n.textContent)
    expect(labels).toContain('2025')
    const coords = container.querySelector('polyline').getAttribute('points').split(' ').map(s => +s.split(',')[0])
    const frac = (coords[1] - coords[0]) / (coords[2] - coords[0])
    const expected = (pts[1].t - pts[0].t) / (pts[2].t - pts[0].t)
    expect(frac).toBeCloseTo(expected, 2)
  })
})

describe('LineChart trend line', () => {
  const pts = [point(2026, 1, 1, 80), point(2026, 1, 8, 79.6), point(2026, 1, 15, 79.1), point(2026, 1, 22, 78.8)]
  afterEach(() => act(() => useStore.getState().update(s => { s.chartTrend = false }, false)))

  it('is off by default and turns on for every chart from its chip', () => {
    act(() => root.render(<LineChart points={pts} axes unit="kg" />))
    expect(container.querySelector('[data-trend-line]')).toBeNull()
    const chip = container.querySelector('.chart-trend button')
    expect(chip.getAttribute('aria-pressed')).toBe('false')
    act(() => chip.click())
    expect(useStore.getState().S.chartTrend).toBe(true)
    expect(container.querySelector('[data-trend-line]')).toBeTruthy()
    // About -0.41 kg a week by least squares over the four weigh-ins.
    expect(container.querySelector('[data-trend-rate]').textContent).toMatch(/−0\.4 kg/)
  })

  it('is not offered without axes, with fewer than three points, or on a per-set chart', () => {
    act(() => root.render(<LineChart points={pts} axes={false} unit="kg" />))
    expect(container.querySelector('.chart-trend')).toBeNull()
    act(() => root.render(<LineChart points={pts.slice(0, 2)} axes unit="kg" />))
    expect(container.querySelector('.chart-trend')).toBeNull()
    act(() => root.render(<LineChart points={pts} series={[{ points: pts, color: 'red' }]} axes unit="kg" />))
    expect(container.querySelector('.chart-trend')).toBeNull()
  })
})
