// @vitest-environment happy-dom
// The exercise a question asks how to do (lib/exercise-ask.js), read from the person's own words
// so a coach's answer shows its demonstration even when the model left out the show_exercise
// action. Strict by design: no cue asking for technique, or no exercise named by its own name,
// and nothing is shown.
import { afterAll, describe, expect, it } from 'vitest'
import { askedExercise, askedSportDrills, demoFor } from './exercise-ask.js'
import { setLang } from './i18n.js'
import { splitActions } from './coach-actions.js'

afterAll(() => setLang('en'))

describe('askedExercise', () => {
  it('reads English questions, and picks the plain lift over its variants', async () => {
    await setLang('en')
    expect(askedExercise('How do I do a hip thrust?')).toBe('2072')
    expect(askedExercise('how to deadlift properly')).toBe('0032')            // barbell deadlift
    expect(askedExercise('what is the proper form for barbell bench press?')).toBe('0025')
    expect(askedExercise('how do i squat')).toBe('1197')                      // "squat", not the dumbbell squat
    expect(askedExercise('how do I do a barbell squat')).toBe('3593')         // the name itself, not "(on knees)"
    expect(askedExercise('how should I do the leg press?')).toBe('0739')      // the 45 degree sled
    expect(askedExercise('how do I do pull-ups')).toBe('0652')                // plural to the singular name
    expect(askedExercise('technique for romanian deadlift')).toBe('0085')
  })

  it('reads Italian and Spanish questions against the translated names', async () => {
    await setLang('it')
    expect(askedExercise('Come si fa lo stacco rumeno?')).toBe('0085')
    expect(askedExercise('come si fa la panca piana?')).toBe('0025')          // barbell, not the Smith machine
    expect(askedExercise('tecnica dello stacco da terra')).toBe('0032')
    expect(askedExercise('Chirone, come si esegue lo squat bulgaro senza dolore?')).toBe('0781')
    expect(askedExercise('come si fa il curl con manubri')).toBe('0294')      // "con" is not "concentrato"
    await setLang('es')
    expect(askedExercise('¿Cómo se hace el press de banca?')).toBe('0025')
    expect(askedExercise('cómo hago dominadas')).toBe('0652')
  })

  it('shows nothing without a technique question naming an exercise', async () => {
    await setLang('en')
    for (const q of ['how do I grow my chest?', 'I did squats today', 'how is my progress?', 'bench press 80 kg for 5, good?', '', null]) {
      expect(askedExercise(q)).toBe(null)
    }
    await setLang('it')
    for (const q of ['come posso aumentare il petto?', 'come sto andando?', 'oggi ho fatto panca piana']) {
      expect(askedExercise(q)).toBe(null)
    }
  })

  it('finds the person\'s own exercise by its name', async () => {
    await setLang('en')
    const custom = [{ id: 'c1', n: 'zercher hold walk', bp: 'upper legs', eq: 'barbell', tg: 'quads', custom: true }]
    expect(askedExercise('how do I do the zercher hold walk?', custom)).toBe('c1')
  })
})

describe('demoFor (the chat)', () => {
  const action = '\n```olympus-action\n{"type": "show_exercise", "name": "barbell deadlift"}\n```'
  it('falls back to the question only when the coach showed nothing, once per question', async () => {
    await setLang('en')
    expect(demoFor('how do I do a hip thrust?', 'Drive through the heels.', [], false)).toBe('2072')
    expect(demoFor('how do I do a hip thrust?', 'Drive through the heels.' + action, [], false)).toBe(null)
    expect(splitActions('Drive.' + action).actions[0].id).toBe('0032')        // the coach's own choice stays
    expect(demoFor('how do I do a hip thrust?', 'Agreed with Hercules.', [], true)).toBe(null)
    expect(demoFor('how am I doing?', 'Well.', [], false)).toBe(null)
  })
})

describe('askedSportDrills (how to train for a sport)', () => {
  const FOOTBALL = ['drill-football-cone-dribble', 'drill-football-wall-pass']
  const TENNIS = ['drill-tennis-split-step', 'drill-tennis-wall-rally']
  it('reads the question in English and in the active language', async () => {
    await setLang('en')
    expect(askedSportDrills('How do I train for football?')).toEqual(FOOTBALL)
    expect(askedSportDrills('show me some soccer drills')).toEqual(FOOTBALL)
    expect(askedSportDrills('what should I practise to get better at tennis')).toEqual(TENNIS)
    await setLang('it')
    expect(askedSportDrills('come mi alleno per il calcio?')).toEqual(FOOTBALL)
    expect(askedSportDrills('esercizi per il tennis')).toEqual(TENNIS)
    expect(askedSportDrills('allenamento per arrampicata')).toEqual(['drill-climbing-hangboard', 'drill-climbing-lock-off'])
    await setLang('es')
    expect(askedSportDrills('¿cómo entreno para el fútbol?')).toEqual(FOOTBALL)
  })

  it('needs both a word about training and a sport, close together', async () => {
    await setLang('en')
    for (const q of ['I played football today', 'how do I train my chest?', 'how was my training?', 'I train legs on Monday and on Saturday we always play some football with friends', '', null]) {
      expect(askedSportDrills(q), String(q)).toEqual([])
    }
  })

  it('in the chat: a named drill is shown alone, a sport shows both of its drills', async () => {
    await setLang('en')
    expect(demoFor('how do I train for football?', 'Work on your first touch.', [], false)).toEqual(FOOTBALL)
    expect(demoFor('how do I do the tennis split step?', 'Hop as they hit.', [], false)).toBe('drill-tennis-split-step')
    expect(demoFor('how do I train for football?', 'ok', [], true)).toBe(null)
  })
})
