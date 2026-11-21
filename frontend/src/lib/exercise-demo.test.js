// Which exercise a question to a coach asks to be shown (lib/exercise-demo.js).
import { describe, it, expect } from 'vitest'
import { asksHowTo, exerciseIn, demoExercise, plain } from './exercise-demo.js'
import { CATALOGUE } from './exercises.js'
import itNames from '../exercise-names/it.js'

const list = [
  { id: 'sq', n: 'squat', it: 'squat', gif: 'sq.gif' },
  { id: 'bsq', n: 'barbell squat', it: 'squat con bilanciere', gif: 'bsq.gif' },
  { id: 'dl', n: 'barbell deadlift', it: 'stacco da terra con bilanciere', gif: 'dl.gif' },
  { id: 'rdl', n: 'barbell romanian deadlift', it: 'stacco rumeno con bilanciere', gif: 'rdl.gif' },
  { id: 'bp', n: 'barbell bench press', it: 'panca piana con bilanciere', gif: 'bp.gif' },
  { id: 'sbp', n: 'smith bench press', it: 'panca piana al multipower' },
]
const nameOf = e => [e.it, e.n]

describe('a question that asks how an exercise is done', () => {
  it('is told apart from other questions, in several languages', () => {
    for (const q of ['Come si fa lo squat?', 'Chirone, come si esegue lo stacco?', 'Mi spieghi la tecnica della panca?', 'How do I do a bench press?',
      'Show me the deadlift', '¿Cómo se hace la sentadilla?', 'Comment faire un squat ?', 'Wie mache ich Kniebeugen?', 'Como faço o agachamento?']) expect(asksHowTo(q), q).toBe(true)
    for (const q of ['Quanto peso metto alla prossima serie?', 'What should I eat after training?', 'Quante serie mi mancano?']) expect(asksHowTo(q), q).toBe(false)
  })
  it('ignores accents and punctuation', () => {
    expect(plain('  Cómo   se HACE, ¿la sentadilla? ')).toBe('como se hace la sentadilla')
  })
})

describe('the exercise it names', () => {
  it('takes a name written whole, the longest first', () => {
    expect(exerciseIn('come si fa lo stacco rumeno con bilanciere?', list, nameOf).id).toBe('rdl')
    expect(exerciseIn('come si fa lo squat?', list, nameOf).id).toBe('sq')
    expect(exerciseIn('how do I do a barbell squat', list, nameOf).id).toBe('bsq')
  })
  it('otherwise the shortest name holding every word asked, one with an animation first', () => {
    expect(exerciseIn('come si fa lo stacco da terra?', list, nameOf).id).toBe('dl')
    expect(exerciseIn('come si fa la panca piana?', list, nameOf).id).toBe('bp')
    expect(exerciseIn('come si fa lo stacco rumeno?', list, nameOf).id).toBe('rdl')
  })
  it('prefers the person’s own exercise in a tie', () => {
    const two = [{ id: 'a', n: 'curl', gif: 1 }, { id: 'b', n: 'curl', gif: 1 }]
    expect(exerciseIn('how do I do a curl', two, e => [e.n], new Set(['b'])).id).toBe('b')
  })
  it('names nothing when the question is about something else', () => {
    expect(demoExercise('come si fa a perdere peso?', { list, nameOf })).toBe(null)
    expect(demoExercise('Quanto peso metto?', { list, nameOf, current: list[0] })).toBe(null)
  })
  it('shows the exercise being trained for "how do I do this one?"', () => {
    expect(demoExercise('Come si esegue questo esercizio?', { list, nameOf, current: list[2] }).id).toBe('dl')
    expect(demoExercise('come si fa a perdere peso?', { list, nameOf, current: list[2] })).toBe(null)
  })
})

describe('on the real catalogue', () => {
  const nameOfIt = e => [itNames[e.id], e.n]
  const pick = q => demoExercise(q, { list: CATALOGUE, nameOf: nameOfIt })
  it('finds the lifts people ask about, with an animation', () => {
    for (const [q, word] of [['Come si fa lo squat?', 'squat'], ['Come si esegue lo stacco da terra?', 'deadlift'], ['Come si fa la panca piana?', 'bench press'],
      ['How do I do a barbell deadlift?', 'deadlift'], ['How do I do a pull up?', 'pull'], ['Come si fanno le trazioni alla sbarra?', 'pull']]) {
      const ex = pick(q)
      expect(ex, q).toBeTruthy()
      expect(ex.n, q).toContain(word)
      expect(!!ex.gif, q).toBe(true)
    }
  })
})
