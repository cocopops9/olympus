// @vitest-environment happy-dom
// The exercise a question asks how to do (lib/exercise-ask.js), read from the person's own words
// so a coach's answer shows its demonstration even when the model left out the show_exercise
// action. Strict by design: no cue asking for technique, or no exercise named by its own name,
// and nothing is shown.
import { afterAll, describe, expect, it } from 'vitest'
import { askedExercise, askedSportTraining, demoFor } from './exercise-ask.js'
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

  it('reads "tell me how", "show me how to train" and training verbs, strictly by name', async () => {
    await setLang('en')
    expect(askedExercise('tell me how to do a hip thrust')).toBe('2072')
    expect(askedExercise('show me how to train the squat')).toBe('1197')
    expect(askedExercise('how do I train romanian deadlift?')).toBe('0085')
    // After a training verb the words may name a muscle: only an exercise's own name counts.
    for (const q of ['how do I train my chest?', 'how to train legs', 'show me how to train back']) expect(askedExercise(q)).toBe(null)
    await setLang('it')
    expect(askedExercise('dimmi come si fa lo stacco rumeno')).toBe('0085')
    expect(askedExercise('fammi vedere come si fa la panca piana')).toBe('0025')
    expect(askedExercise('come si allena lo stacco rumeno?')).toBe('0085')
    expect(askedExercise('come allenare il petto?')).toBe(null)
    await setLang('es')
    expect(askedExercise('dime cómo se hace el press de banca')).toBe('0025')
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

describe('askedSportTraining (how to train for a sport)', () => {
  it('reads the question in English and in the active language', async () => {
    await setLang('en')
    expect(askedSportTraining('How do I train for football?')).toBe('sport-football')
    expect(askedSportTraining('show me some soccer drills')).toBe('sport-football')
    expect(askedSportTraining('what should I practise to get better at tennis')).toBe('sport-tennis')
    await setLang('it')
    expect(askedSportTraining('come mi alleno per il calcio?')).toBe('sport-football')
    expect(askedSportTraining('esercizi per il tennis')).toBe('sport-tennis')
    expect(askedSportTraining('allenamento per arrampicata')).toBe('sport-climbing')
    await setLang('es')
    expect(askedSportTraining('¿cómo entreno para el fútbol?')).toBe('sport-football')
  })

  it('needs both a word about training and a sport, close together', async () => {
    await setLang('en')
    for (const q of ['I played football today', 'how do I train my chest?', 'how was my training?', 'I train legs on Monday and on Saturday we always play some football with friends', '', null]) {
      expect(askedSportTraining(q), String(q)).toBe(null)
    }
  })

  it('in the chat: no single exercise is kept for it (not the cross trainer for football)', async () => {
    await setLang('en')
    expect(demoFor('how do I train for football?', 'Work on your first touch.', [], false)).toBe(null)
    expect(demoFor('how do I train for football?', 'ok', [], true)).toBe(null)
  })
})
