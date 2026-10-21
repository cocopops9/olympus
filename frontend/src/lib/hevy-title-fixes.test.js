// The hand-checked corrections to the generated Hevy title table: every id exists, the ones that
// used to file history under another lift now land on the right one, and a null correction makes
// the title a custom exercise in both imports instead of the old wrong guess.
import { describe, expect, it } from 'vitest'
import { HEVY_TITLE_FIX, hevyTitleFix } from './hevy-title-fixes.js'
import { HEVY_TITLE_MAP } from './hevy-id-map.js'
import { matchHevyTitle, parseWorkoutCSV } from './import-csv.js'
import { parseHevyWorkouts } from './import-hevy.js'
import { EXIDX } from './exercises.js'

const nameOf = id => EXIDX[id]?.n

describe('Hevy title corrections', () => {
  it('point only at catalogue entries that exist', () => {
    for (const [title, id] of Object.entries(HEVY_TITLE_FIX)) {
      if (id !== null) expect(EXIDX[id], title).toBeTruthy()
    }
  })

  it('correct the matches that filed one lift as another', () => {
    expect(nameOf(matchHevyTitle('Chin Up (Weighted)'))).toBe('weighted chin up')
    expect(nameOf(matchHevyTitle('Walking'))).toBe('walking')
    expect(nameOf(matchHevyTitle('Plank'))).toBe('front plank')
    expect(nameOf(matchHevyTitle('Seated Overhead Press (Dumbbell)'))).toBe('dumbbell seated shoulder press')
    expect(nameOf(matchHevyTitle('Sumo Squat (Dumbbell)'))).toBe('dumbbell sumo squat')
    expect(nameOf(matchHevyTitle('Running'))).toBe('run')
  })

  it('leave the titles they do not mention to the generated table', () => {
    expect(hevyTitleFix('Bench Press (Barbell)')).toBe(undefined)
    expect(matchHevyTitle('Bench Press (Barbell)')).toBe(HEVY_TITLE_MAP['bench press (barbell)'])
  })

  it('make a null correction a custom exercise in the CSV import', () => {
    const csv = [
      'title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_kg,reps,distance_km,duration_seconds,rpe',
      'Oly,"1 Oct 2026, 10:00","1 Oct 2026, 11:00",,Clean,,,0,normal,60,3,,,',
    ].join('\n')
    const p = parseWorkoutCSV(csv, { unit: 'kg' })
    expect(p.unmatchedNames).toEqual(['Clean'])
    expect(p.workouts[0].entries[0].id).toBe(p.customEx[0].id)
  })

  it('apply in the API import too, by the template title', () => {
    const templates = [{ id: 'T1', title: 'Chin Up (Weighted)', type: 'weight_reps', primary_muscle_group: 'lats' }]
    const workouts = [{
      id: 'w1', title: 'Pull', start_time: '2026-10-01T10:00:00Z', end_time: '2026-10-01T11:00:00Z',
      exercises: [{ exercise_template_id: 'T1', title: 'Chin Up (Weighted)', sets: [{ type: 'normal', weight_kg: 10, reps: 6 }] }],
    }]
    const p = parseHevyWorkouts(workouts, templates)
    expect(nameOf(p.workouts[0].entries[0].id)).toBe('weighted chin up')
  })
})
