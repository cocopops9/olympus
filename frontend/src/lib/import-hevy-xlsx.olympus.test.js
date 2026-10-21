// A whole Hevy export as it arrives from a phone set to Spanish: an .xlsx with Spanish exercise
// titles and dates. It must end up as dated workouts on the catalogue's exercises, with the ones
// the catalogue does not have created as the person's own.
import { describe, expect, it } from 'vitest'
import { workbook } from './xlsx.test.js'
import { importText } from './import-file.js'
import { parseImport, mergeImport } from './import-csv.js'
import { englishForMatching } from './hevy-locale.js'
import { EXIDX } from './exercises.js'

const HEAD = ['title', 'start_time', 'end_time', 'description', 'exercise_title', 'superset_id', 'exercise_notes', 'set_index', 'set_type', 'weight_kg', 'reps', 'distance_km', 'duration_seconds', 'rpe']
const ROWS = [
  ['Petto/spalle', '22 sep 2023, 18:03', '22 sep 2023, 19:20', '', 'Press de Banca (Mancuerna)', '', '', '0', 'normal', '30', '10', '', '', ''],
  ['Petto/spalle', '22 sep 2023, 18:03', '22 sep 2023, 19:20', '', 'Press de Hombros  (Mancuerna)', '', '', '0', 'normal', '20', '10', '', '', ''],
  ['Petto/spalle', '22 sep 2023, 18:03', '22 sep 2023, 19:20', '', 'Elevacion Laterales (Mancuerna)', '', '', '0', 'normal', '10', '12', '', '', ''],
  ['Gambe', '18 ene 2024, 18:50', '18 ene 2024, 20:21', '', 'Sentadilla (Barra)', '', '', '0', 'normal', '90', '5', '', '', ''],
  ['Gambe', '18 ene 2024, 18:50', '18 ene 2024, 20:21', '', 'Aducción de Cadera (Cable)', '', '', '0', 'normal', '', '12', '', '', ''],
  ['Gambe', '18 ene 2024, 18:50', '18 ene 2024, 20:21', '', 'Tríceps Sentado', '', '', '0', 'normal', '20', '12', '', '', ''],
  ['Cardio', '3 dic 2025, 07:00', '3 dic 2025, 07:10', '', 'Cinta', '', '', '0', 'normal', '', '', '2.28', '600', ''],
]
const cell = v => `<c t="inlineStr"><is><t>${v}</t></is></c>`
const xlsx = () => workbook([HEAD, ...ROWS].map((r, i) => `<row r="${i + 1}">${r.map(cell).join('')}</row>`).join(''))

describe('a Spanish Hevy export in .xlsx', () => {
  it('imports every workout on its day, on catalogue exercises where Hevy has the exercise', async () => {
    const p = parseImport(await importText(xlsx()), { unit: 'kg' })
    expect(p.source).toBe('Hevy')
    expect(p.workouts.map(w => [w.d, w.name])).toEqual([['2023-09-22', 'Petto/spalle'], ['2024-01-18', 'Gambe'], ['2025-12-03', 'Cardio']])
    const names = p.workouts.flatMap(w => w.entries.map(e => EXIDX[e.id]?.n || 'own: ' + p.customEx.find(c => c.id === e.id)?.n))
    expect(names).toEqual([
      'dumbbell bench press', 'dumbbell seated shoulder press', 'dumbbell lateral raise',
      'barbell full squat', 'cable hip adduction', 'own: tríceps sentado',
      'walking on incline treadmill',
    ])
    expect(p.workouts[2].entries[0].sets[0]).toMatchObject({ min: 10, speed: 13.7 })
    const S = { workouts: [], customEx: [], exWeights: {}, bodyweight: [] }
    expect(mergeImport(S, p)).toEqual({ added: 3, skipped: 0 })
    expect(S.customEx.map(c => [c.n, c.bp])).toEqual([['tríceps sentado', 'upper arms']])
  })

  it('still reads a plain CSV the same way', async () => {
    const csv = [HEAD, ...ROWS].map(r => r.map(v => `"${v}"`).join(',')).join('\n')
    const a = parseImport(await importText(new TextEncoder().encode(csv)), { unit: 'kg' })
    const b = parseImport(await importText(xlsx()), { unit: 'kg' })
    expect(a.workouts).toEqual(b.workouts)
  })
})

describe('Hevy titles in Spanish', () => {
  it('give Hevy English titles, fix spelling slips, and keep ambiguous ones as they are', () => {
    expect(englishForMatching('Jalón al Pecho (Cable)')).toEqual({ name: 'Lat Pulldown (Cable)', exact: true })
    expect(englishForMatching('press de banca inclinado (MANCUERNA)').name).toBe('Incline Bench Press (Dumbbell)')
    expect(englishForMatching('One arm Preacher Curl (Dumbell)').name).toBe('One arm Preacher Curl (Dumbbell)')
    expect(englishForMatching('Lateral Raise Seduto').name).toBe('Lateral Raise Seated')
    expect(englishForMatching('Tríceps Sentado')).toMatchObject({ keepOwn: true })
    // Not in the table: translated word by word for the matcher, never trusted as exact.
    expect(englishForMatching('Press de Banca con Pausa (Barra)')).toEqual({ name: 'bench press pausa barbell', exact: false })
  })
})
