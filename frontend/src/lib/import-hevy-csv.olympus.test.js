// A Hevy CSV export brought in whole: drop sets kept as drop sets, and a session skipped only
// when the history already has that same session, not merely something on the same day.
import { describe, expect, it } from 'vitest'
import { parseWorkoutCSV, mergeImport } from './import-csv.js'
import { isDropSet, dropsOf } from './workout-model.js'

const HEAD = 'title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_kg,reps,distance_km,duration_seconds,rpe'
const row = (title, day, from, to, ex, i, type, w, r) =>
  `"${title}","${day} Oct 2026, ${from}","${day} Oct 2026, ${to}","","${ex}",,"",${i},${type},${w},${r},,,`

describe('Hevy drop sets', () => {
  it('fold each drop row into the work set before it, with its volume', () => {
    const p = parseWorkoutCSV([HEAD,
      row('Arms', '05', '18:00', '19:00', 'Lateral Raise (Dumbbell)', 0, 'warmup', 4, 15),
      row('Arms', '05', '18:00', '19:00', 'Lateral Raise (Dumbbell)', 1, 'normal', 12, 12),
      row('Arms', '05', '18:00', '19:00', 'Lateral Raise (Dumbbell)', 2, 'dropset', 8, 10),
      row('Arms', '05', '18:00', '19:00', 'Lateral Raise (Dumbbell)', 3, 'dropset', 5, 10),
      row('Arms', '05', '18:00', '19:00', 'Lateral Raise (Dumbbell)', 4, 'normal', 12, 10),
    ].join('\n'), { unit: 'kg' })
    const sets = p.workouts[0].entries[0].sets
    expect(sets).toHaveLength(3)                       // warm-up, the drop set, the last straight set
    expect(isDropSet(sets[1])).toBe(true)
    expect(dropsOf(sets[1])).toEqual([{ w: 8, r: 10 }, { w: 5, r: 10 }])
    expect(isDropSet(sets[2])).toBe(false)
    expect(p.workouts[0].vol).toBe(12 * 12 + 8 * 10 + 5 * 10 + 12 * 10)
  })

  it('keep a drop row with nothing to drop from as a set of its own', () => {
    const p = parseWorkoutCSV([HEAD, row('Arms', '05', '18:00', '19:00', 'Bicep Curl (Dumbbell)', 0, 'dropset', 10, 10)].join('\n'), { unit: 'kg' })
    expect(p.workouts[0].entries[0].sets).toEqual([{ w: 10, r: 10, done: true }])
  })

  it('convert the drops with their set when the file is in pounds', () => {
    const lbHead = HEAD.replace('weight_kg', 'weight_lbs')
    const p = parseWorkoutCSV([lbHead,
      row('Arms', '05', '18:00', '19:00', 'Lateral Raise (Dumbbell)', 0, 'normal', 25, 12),
      row('Arms', '05', '18:00', '19:00', 'Lateral Raise (Dumbbell)', 1, 'dropset', 15, 10),
    ].join('\n'), { unit: 'kg' })
    const [set] = p.workouts[0].entries[0].sets
    expect(set.w).toBeCloseTo(11.3, 1)
    expect(dropsOf(set)[0].w).toBeCloseTo(6.8, 1)
  })
})

describe('merging a Hevy export into a history that already has workouts', () => {
  const base = day => new Date(`2026-10-${day}T00:00:00`).getTime()
  const mine = (day, h0, h1) => ({ id: 'mine' + day + h0, d: `2026-10-${day}`, start: base(day) + h0 * 3600000, end: base(day) + h1 * 3600000, name: 'Logged here', entries: [] })
  const file = [HEAD,
    row('Morning', '07', '07:00', '08:00', 'Squat (Barbell)', 0, 'normal', 100, 5),
    row('Evening', '07', '18:00', '19:00', 'Bench Press (Barbell)', 0, 'normal', 80, 5),
    row('Push', '08', '18:00', '19:10', 'Bench Press (Barbell)', 0, 'normal', 82.5, 5),
  ].join('\n')

  it('adds the sessions that do not overlap one already here, and skips the one that does', () => {
    const S = { workouts: [mine('07', 7.25, 8.5)], customEx: [], exWeights: {}, bodyweight: [] }
    expect(mergeImport(S, parseWorkoutCSV(file, { unit: 'kg' }))).toEqual({ added: 2, skipped: 1 })
    expect(S.workouts.map(w => w.name)).toEqual(['Logged here', 'Evening', 'Push'])
  })

  it('still never duplicates on a second import of the same file', () => {
    const S = { workouts: [], customEx: [], exWeights: {}, bodyweight: [] }
    expect(mergeImport(S, parseWorkoutCSV(file, { unit: 'kg' }))).toEqual({ added: 3, skipped: 0 })
    expect(mergeImport(S, parseWorkoutCSV(file, { unit: 'kg' }))).toEqual({ added: 0, skipped: 3 })
  })
})

describe('a Hevy measurements export', () => {
  const file = [
    'date,weight_kg,fat_percent,neck_cm,shoulder_cm,chest_cm,left_bicep_cm,right_bicep_cm,left_forearm_cm,right_forearm_cm,abdomen_cm,waist_cm,hips_cm,left_thigh_cm,right_thigh_cm,left_calf_cm,right_calf_cm',
    '"1 Oct 2026, 08:00",82.4,15.5,39,121,104,37.5,38,30,30.5,88,84,99,60,60.5,39,39',
    '"8 Oct 2026, 08:00",81.9,,,,,,,,,,83.5,,,,,',
    '"9 Oct 2026, 08:00",81.7,,,,,,,,,,,,,,,',
  ].join('\n')

  it('brings the weigh-ins and the measurements, in cm, and is labelled Hevy', async () => {
    const { parseImport } = await import('./import-csv.js')
    const p = parseImport(file, { unit: 'kg' })
    expect(p.kind).toBe('bodyweight')
    expect(p.source).toBe('Hevy')
    expect(p.bodyweight.map(b => b.w)).toEqual([82.4, 81.9, 81.7])
    expect(p.measurements).toHaveLength(2)
    expect(p.measurements[0]).toMatchObject({ d: '2026-10-01', bodyFat: 15.5, neck: 39, shoulders: 121, upperArmLeft: 37.5, upperArmRight: 38, abdomen: 88, waist: 84, calfRight: 39 })
    expect(p.measurements[1]).toMatchObject({ d: '2026-10-08', waist: 83.5 })
  })

  it('merges them once, and switches on the sites it brought', async () => {
    const { parseImport } = await import('./import-csv.js')
    const S = { workouts: [], customEx: [], exWeights: {}, bodyweight: [], measurements: [], measurementEnabled: null, customMeasurements: [] }
    expect(mergeImport(S, parseImport(file, { unit: 'kg' }))).toEqual({ added: 3, skipped: 0, measured: 2 })
    expect(S.measurements.map(m => [m.d, m.waist])).toEqual([['2026-10-01', 84], ['2026-10-08', 83.5]])
    expect(S.measurementEnabled).toEqual(expect.arrayContaining(['bodyFat', 'abdomen', 'waist']))
    expect(mergeImport(S, parseImport(file, { unit: 'kg' }))).toEqual({ added: 0, skipped: 3, measured: 0 })
  })

  it('reads a file of measurements without any weight', async () => {
    const { parseImport } = await import('./import-csv.js')
    const p = parseImport('date,waist_in\n2026-10-01,33', { unit: 'lb' })
    expect(p.bodyweight).toEqual([])
    expect(p.measurements[0].waist).toBeCloseTo(83.8, 1)
  })
})
