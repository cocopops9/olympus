// Exporting part of the data (lib/data-export.js): the period, the tables, and the three formats,
// each read back the way another program would read it.
import { describe, it, expect } from 'vitest'
import { unzipSync, strFromU8 } from 'fflate'
import { periodRange, exportCounts, workoutRows, bodyweightRows, measurementRows, routineRows, buildExport, toCsv, dayOf } from './data-export.js'
import { parseWorkoutCSV, parseCSV, detectSource } from './import-csv.js'
import { readXlsx } from './xlsx.js'

const NOW = new Date('2026-11-16T10:00:00').getTime()
const at = (d, h) => new Date(d + `T${String(h).padStart(2, '0')}:00:00`).getTime()
const S = () => ({
  unit: 'kg',
  workouts: [
    { id: 'w1', d: '2026-11-15', start: at('2026-11-15', 18), end: at('2026-11-15', 19), name: 'Push, A', note: 'Felt "strong"', entries: [
      { id: '0025', note: 'Pause at the chest', sets: [{ w: 60, r: 8, done: true, phase: 'warmup' }, { w: 80, r: 5, done: true, rpe: 8 }, { w: 80, r: 4, done: true, rir: 0, failure: true }, { w: 80, r: 5, done: false }] },
      { id: 'cx1', sets: [{ w: 0, r: 12, done: true }] },
    ] },
    { id: 'w2', d: '2026-11-02', start: at('2026-11-02', 7), end: at('2026-11-02', 7) + 30 * 60000, name: 'Run', entries: [{ id: '0685', mode: 'cardio', sets: [{ min: 30, speed: 10, incline: 1, done: true }] }] },
    { id: 'w3', d: '2026-06-01', start: at('2026-06-01', 9), end: null, name: 'Old', entries: [{ id: '0025', sets: [{ w: 50, r: 10 }] }] },
  ],
  bodyweight: [{ d: '2026-11-14', w: 81.24 }, { d: '2026-10-01', w: 82 }],
  measurements: [{ d: '2026-11-10', waist: 84, chest: null, bodyFat: 15.5, other: [{ id: 'o1', name: 'Neck at rest', value: 38 }] }],
  routines: [{ id: 'r1', name: 'Push', ex: [{ id: '0025', sets: 3, reps: 5, weight: 80 }] }],
  customEx: [{ id: 'cx1', n: 'My crunch', bp: 'waist', eq: 'body weight' }],
})

describe('the period', () => {
  it('counts back from today, today included', () => {
    expect(periodRange('week', { now: NOW })).toEqual({ from: '2026-11-10', to: '2026-11-16' })
    expect(periodRange('month', { now: NOW })).toEqual({ from: '2026-10-18', to: '2026-11-16' })
    expect(periodRange('all', { now: NOW })).toEqual({ from: null, to: null })
  })
  it('takes the days of a custom range in either order, or one bound only', () => {
    expect(periodRange('custom', { from: '2026-11-10', to: '2026-11-01' })).toEqual({ from: '2026-11-01', to: '2026-11-10' })
    expect(periodRange('custom', { from: '2026-11-01' })).toEqual({ from: '2026-11-01', to: null })
  })
  it('says how much a choice holds before it is written', () => {
    expect(exportCounts(S(), periodRange('week', { now: NOW }))).toEqual({ workouts: 1, sets: 4, bodyweight: 1, measurements: 1, routines: 1 })
    expect(exportCounts(S(), periodRange('all')).workouts).toBe(3)
  })
})

describe('the tables', () => {
  it('writes the sets that were done, a row each, like Strong, the oldest first', () => {
    const rows = workoutRows(S(), periodRange('month', { now: NOW }))
    expect(rows[0].slice(0, 8)).toEqual(['Date', 'Workout Name', 'Duration (sec)', 'Exercise Name', 'Set Order', 'Set Type', 'Weight (kg)', 'Reps'])
    expect(rows).toHaveLength(1 + 1 + 4)
    const run = rows[1]
    expect(run[0]).toBe('2026-11-02 07:00:00')
    expect([run[10], run[11], run[12]]).toEqual([1800, 5, 1])
    expect(run[6]).toBe('')
    const bench = rows.slice(2, 5)
    expect(bench.map(r => r[5])).toEqual(['Warm Up', 'Normal', 'Failure'])
    expect(bench.map(r => r[4])).toEqual([1, 2, 3])
    expect(bench[1][8]).toBe(8)
    expect(bench[2][9]).toBe(0)
    expect(bench[0][13]).toBe('Pause at the chest')
    expect(bench[1][13]).toBe('')
    expect(rows[5][3]).toBe('My crunch')
    expect(rows[5][2]).toBe(3600)
  })

  it('reads back into the app as the same workouts', () => {
    const text = toCsv(workoutRows(S(), periodRange('all')))
    expect(detectSource(parseCSV(text.replace(/^﻿/, ''))[0])).toBe('Strong')
    const back = parseWorkoutCSV(text.replace(/^﻿/, ''), { unit: 'kg', customEx: S().customEx })
    expect(back.error).toBeUndefined()
    expect(back.workouts.map(w => w.d).sort()).toEqual(['2026-06-01', '2026-11-02', '2026-11-15'])
    const push = back.workouts.find(w => w.d === '2026-11-15')
    expect(push.name).toBe('Push, A')
    expect(push.note).toBe('Felt "strong"')
    expect(push.entries.find(e => e.id === '0025').sets.map(s => [s.w, s.r])).toEqual([[60, 8], [80, 5], [80, 4]])
  })

  it('writes weights in pounds for a profile in pounds, and measurements in inches', () => {
    const s = { ...S(), unit: 'lb' }
    expect(bodyweightRows(s, periodRange('all'))[0]).toEqual(['Date', 'Weight (lbs)'])
    const m = measurementRows(s, periodRange('all'))
    expect(m[0]).toEqual(['Date', 'Waist (in)', 'Body fat (%)', 'Neck at rest'])
    expect(m[1]).toEqual(['2026-11-10', 33.1, 15.5, 38])
  })

  it('writes weigh-ins and routines', () => {
    expect(bodyweightRows(S(), periodRange('all')).slice(1)).toEqual([['2026-10-01', 82], ['2026-11-14', 81.24]])
    expect(routineRows(S())).toEqual([['Routine', 'Order', 'Exercise Name', 'Sets', 'Reps', 'Weight (kg)'], ['Push', 1, routineRows(S())[1][2], 3, 5, 80]])
  })
})

describe('the formats', () => {
  it('one table is one CSV file, several are a zip of them', () => {
    const one = buildExport(S(), { data: ['bodyweight'], period: 'all', format: 'csv', now: NOW })
    expect(one.name).toBe('olympus-bodyweight-all_2026-11-16.csv')
    expect(one.data.startsWith('﻿Date,Weight (kg)\r\n')).toBe(true)
    const many = buildExport(S(), { data: ['routines', 'workouts'], period: 'week', format: 'csv', now: NOW })
    expect(many.name).toBe('olympus-data-2026-11-10_2026-11-16.zip')
    const files = unzipSync(many.data)
    expect(Object.keys(files)).toEqual(['workouts.csv', 'routines.csv'])
    expect(strFromU8(files['workouts.csv'])).toContain('My crunch')
  })

  it('a workbook has a sheet per table that a spreadsheet reads back, numbers as numbers', () => {
    const out = buildExport(S(), { data: ['workouts', 'bodyweight'], period: 'all', format: 'xlsx', now: NOW })
    expect(out.name.endsWith('.xlsx')).toBe(true)
    const files = unzipSync(out.data)
    expect(strFromU8(files['xl/workbook.xml'])).toContain('name="Workouts"')
    expect(strFromU8(files['xl/workbook.xml'])).toContain('name="Body weight"')
    expect(strFromU8(files['xl/worksheets/sheet1.xml'])).toContain('&quot;strong&quot;')
    const rows = readXlsx(out.data)
    expect(rows[0][0]).toBe('Date')
    expect(rows.some(r => r.includes('My crunch'))).toBe(true)
    expect(strFromU8(files['xl/worksheets/sheet2.xml'])).toContain('<v>81.24</v>')
  })

  it('JSON holds the chosen data as the app keeps it, and the custom exercises it names', () => {
    const out = buildExport(S(), { data: ['workouts'], period: 'week', format: 'json', now: NOW })
    const j = JSON.parse(out.data)
    expect(j.from).toBe('2026-11-10')
    expect(j.workouts.map(w => w.id)).toEqual(['w1'])
    expect(j.bodyweight).toBeUndefined()
    expect(j.customExercises).toEqual([{ id: 'cx1', n: 'My crunch', bp: 'waist', eq: 'body weight' }])
  })

  it('needs something to export', () => {
    expect(() => buildExport(S(), { data: [], format: 'csv' })).toThrow()
  })

  it('names a day by the local calendar', () => {
    expect(dayOf(new Date('2026-01-05T23:30:00').getTime())).toBe('2026-01-05')
  })
})
