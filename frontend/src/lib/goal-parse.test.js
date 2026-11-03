// Reading the goals a person wrote and the notes their coaches keep as targets for the medals
// (lib/goal-parse.js), in the languages the coaches answer in.
import { describe, it, expect } from 'vitest'
import { parseGoals, norm } from './goal-parse.js'

const pick = (r, key) => r.targets.find(t => t.key === key)?.value

describe('goals as numbers', () => {
  it('reads a weight on a lift, before or after the name', () => {
    const r = parseGoals(['I want to bench 100 kg and a 180 kg deadlift.'], { unit: 'kg' })
    expect(pick(r, 'bench')).toBe(100)
    expect(pick(r, 'deadlift')).toBe(180)
  })
  it('reads Italian, Spanish, French, German and Portuguese', () => {
    expect(pick(parseGoals(['Voglio arrivare a 100 kg di panca piana'], {}), 'bench')).toBe(100)
    expect(pick(parseGoals(['stacco 200 kg entro dicembre'], {}), 'deadlift')).toBe(200)
    expect(pick(parseGoals(['Quiero una sentadilla de 140 kg'], {}), 'squat')).toBe(140)
    expect(pick(parseGoals(['développé couché 90 kg'], {}), 'bench')).toBe(90)
    expect(pick(parseGoals(['Kniebeuge 120 kg, Kreuzheben 160 kg'], {}), 'squat')).toBe(120)
    expect(pick(parseGoals(['Kniebeuge 120 kg, Kreuzheben 160 kg'], {}), 'deadlift')).toBe(160)
    expect(pick(parseGoals(['quero supino 80 kg'], {}), 'bench')).toBe(80)
  })
  it('tells each lift its own number in one sentence', () => {
    const r = parseGoals(['squat 140 kg, bench 100 kg, deadlift 180 kg'], {})
    expect([pick(r, 'squat'), pick(r, 'bench'), pick(r, 'deadlift')]).toEqual([140, 100, 180])
    const r2 = parseGoals(['100 kg bench, 140 kg squat'], {})
    expect([pick(r2, 'bench'), pick(r2, 'squat')]).toEqual([100, 140])
  })
  it('converts the unit it is given in to the person\'s', () => {
    expect(pick(parseGoals(['bench 225 lb'], { unit: 'kg' }), 'bench')).toBeCloseTo(102, 0)
    expect(pick(parseGoals(['bench 100 kg'], { unit: 'lb' }), 'bench')).toBeCloseTo(220.5, 0)
    expect(pick(parseGoals(['bench 225'], { unit: 'lb' }), 'bench')).toBe(225)
  })
  it('does not take sets and reps, or a number far from the name, for a weight', () => {
    expect(pick(parseGoals(['bench 5x5 at the gym'], {}), 'bench')).toBeUndefined()
    expect(pick(parseGoals(['bench 3 x 10'], {}), 'bench')).toBeUndefined()
    expect(pick(parseGoals(['bench 8 reps'], {}), 'bench')).toBeUndefined()
    expect(pick(parseGoals(['I like to bench, and the gym is open until 22 hours on the weekdays'], {}), 'bench')).toBeUndefined()
    expect(pick(parseGoals(['bench 5x5 with 80 kg'], {}), 'bench')).toBe(80)
  })
  it('reads multiples of body weight with the body weight of the person', () => {
    expect(pick(parseGoals(['squat 1.5x bodyweight'], { bw: 80 }), 'squat')).toBe(120)
    expect(pick(parseGoals(['panca 1.25 volte il peso corporeo'], { bw: 72 }), 'bench')).toBe(90)
    expect(pick(parseGoals(['squat 2x bodyweight'], { bw: 0 }), 'squat')).toBeUndefined()
  })
  it('reads reps for the exercises without added weight', () => {
    expect(pick(parseGoals(['I want 15 pull-ups'], {}), 'pull-up')).toBe(15)
    expect(pick(parseGoals(['trazioni 12, flessioni 40'], {}), 'pull-up')).toBe(12)
    expect(pick(parseGoals(['trazioni 12, flessioni 40'], {}), 'push-up')).toBe(40)
    expect(pick(parseGoals(['30 dominadas'], {}), 'pull-up')).toBe(30)
    expect(pick(parseGoals(['20 dips'], {}), 'dip')).toBe(20)
    expect(pick(parseGoals(['pull ups 10 kg'], {}), 'pull-up')).toBeUndefined()
  })
  it('reads a pace in km/h', () => {
    expect(pick(parseGoals(['run at 12 km/h'], {}), 'run')).toBe(12)
    expect(pick(parseGoals(['run 10 km'], {}), 'run')).toBeUndefined()
  })
  it('keeps the highest when it is named twice, and says which text it came from', () => {
    const r = parseGoals(['bench 90 kg', 'wants a bench of 100 kg'], {})
    expect(r.targets.find(t => t.key === 'bench')).toMatchObject({ value: 100, from: 1, kind: 'load' })
  })
})

describe('how often to train', () => {
  it('reads it in six languages', () => {
    for (const [text, n] of [['I train 4 times a week', 4], ['mi alleno 3 volte a settimana', 3], ['quiero entrenar 5 veces por semana', 5],
      ['3 fois par semaine', 3], ['4x pro Woche', 4], ['treinar 5 vezes por semana', 5], ['3x/week', 3], ['4 allenamenti a settimana', 4]]) {
      expect(parseGoals([text], {}).perWeek, text).toBe(n)
    }
  })
  it('does not take a number of two digits, or no number at all', () => {
    expect(parseGoals(['15 times a week'], {}).perWeek).toBe(0)
    expect(parseGoals(['I train every week'], {}).perWeek).toBe(0)
    expect(parseGoals(['12 weeks of training'], {}).perWeek).toBe(0)
  })
})

describe('nothing to find', () => {
  it('gives nothing for empty or unrelated text', () => {
    expect(parseGoals([], {})).toEqual({ targets: [], perWeek: 0 })
    expect(parseGoals(['I play football on Sundays and I want to feel good'], {})).toEqual({ targets: [], perWeek: 0 })
  })
  it('norm takes the accents and hyphens away', () => {
    expect(norm('Développé  Couché, pull-up')).toBe('developpe couche, pull up')
  })
})
