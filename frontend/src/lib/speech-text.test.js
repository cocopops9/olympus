import { describe, it, expect } from 'vitest'
import { speechParts, cleanLine, sentencesOf, splitSpeech, PAUSE, LIMITS } from './speech-text.js'

const texts = parts => parts.map(p => p.text)

describe('speechParts', () => {
  it('reads each list item as a sentence of its own, with a pause after it', () => {
    const parts = speechParts('**Squat tips**\n\n1. Keep your back straight\n2. Brace your core\n- Push through your heels')
    expect(texts(parts)).toEqual(['Squat tips.', 'Keep your back straight.', 'Brace your core.', 'Push through your heels.'])
    expect(parts.map(p => p.pause)).toEqual([PAUSE.block, PAUSE.block, PAUSE.block, 0])
  })

  it('keeps the sentences of a line apart, with a sentence pause between them', () => {
    const parts = speechParts('Rest two minutes. Then go again!')
    expect(texts(parts)).toEqual(['Rest two minutes.', 'Then go again!'])
    expect(parts[0].pause).toBe(PAUSE.sentence)
    expect(parts[1].pause).toBe(0)
  })

  it('starts with a short piece: a long first sentence is cut at its first comma', () => {
    const parts = speechParts('Keep your back straight, brace your core and push through your heels as you stand up.')
    expect(parts[0].text).toBe('Keep your back straight,')
    expect(parts[0].pause).toBe(PAUSE.clause)
    expect(parts[1].text).toBe('brace your core and push through your heels as you stand up.')
    expect(parts[0].text.length).toBeLessThanOrEqual(LIMITS.first)
  })

  it('reads html line breaks and bullets inside a line as items of their own', () => {
    const parts = speechParts('| **Setup** | • Feet apart, toes out. <br>• Weight on mid-foot. |')
    expect(texts(parts)).toEqual(['Setup.', 'Feet apart, toes out.', 'Weight on mid-foot.'])
    expect(parts.every(p => !/[•<>]/.test(p.text))).toBe(true)
  })

  it('cuts a long first sentence with no comma before a bracket, else between words', () => {
    expect(texts(speechParts('Squat Fundamentals (knee-friendly for your DX-ACL and cartilage issues)'))[0]).toBe('Squat Fundamentals')
    const first = speechParts('Today we are going to work on the deadlift setup and the way you brace')[0]
    expect(first.text.length).toBeLessThanOrEqual(LIMITS.first)
    expect(first.pause).toBe(PAUSE.clause)
    expect(first.text).toMatch(/\w$/)
  })

  it('does not cut a short first sentence, nor a later one at its commas', () => {
    const later = 'Then, slowly, lower the bar to your chest.'
    expect(texts(speechParts('I am awake. ' + later))).toEqual(['I am awake.', later])
  })

  it('cuts a very long sentence at a clause, never past the limit', () => {
    const long = 'First sentence. ' + Array.from({ length: 12 }, (_, i) => `part number ${i + 1} of the plan`).join(', ') + '.'
    const parts = speechParts(long)
    expect(parts.length).toBeGreaterThan(3)
    for (const p of parts) expect(p.text.length).toBeLessThanOrEqual(LIMITS.max)
    expect(parts.map(p => p.text).join(' ').replace(/\s+/g, ' ')).toBe(long)
  })

  it('does not end a sentence at an abbreviation or a list number', () => {
    expect(sentencesOf('Eat carbs, e.g. rice or oats. Then train.')).toEqual(['Eat carbs, e.g. rice or oats.', 'Then train.'])
    expect(sentencesOf('Mangia carboidrati, es. riso. Poi allenati.')).toEqual(['Mangia carboidrati, es. riso.', 'Poi allenati.'])
  })

  it('takes out what a voice reads as noise: Markdown, arrows, tables, emoji, links, code', () => {
    const parts = speechParts('## Plan 💪\n| Day | Lift |\n|---|---|\n| Mon | Squat |\nRPE 7 → then rest.\nSee [the guide](https://x.y/z).\n```js\nconst a = 1\n```')
    expect(texts(parts)).toEqual(['Plan.', 'Day, Lift.', 'Mon, Squat.', 'RPE 7, then rest.', 'See the guide.'])
  })

  it('keeps numbers, ranges and decimals as they are', () => {
    expect(texts(speechParts('Aim for 1.6-2.2 g per kg, about 160 g.'))).toEqual(['Aim for 1.6-2.2 g per kg, about 160 g.'])
  })

  it('reads a dash between words as a pause', () => {
    expect(cleanLine('Squat — the king of lifts')).toBe('Squat, the king of lifts')
  })

  it('reads Chinese sentences apart without spaces', () => {
    expect(texts(speechParts('休息两分钟。然后再做一组！'))).toEqual(['休息两分钟。', '然后再做一组！'])
  })

  it('gives nothing to read for empty or symbol-only text', () => {
    expect(speechParts('')).toEqual([])
    expect(speechParts('**  ** \n --- \n 🎉')).toEqual([])
  })

  it('reads the Italian greeting as two pieces with a sentence pause', () => {
    const parts = speechParts('Sono sveglio. Inizia un esercizio e chiedimi quello che vuoi.')
    expect(parts).toEqual([{ text: 'Sono sveglio.', pause: PAUSE.sentence }, { text: 'Inizia un esercizio e chiedimi quello che vuoi.', pause: 0 }])
  })
})

describe('splitSpeech', () => {
  it('takes the spoken version out of the written answer', () => {
    const reply = '**Rest**\n- 2 to 3 min on compounds\n\n```olympus-action\n{"type": "set_rest", "seconds": 150}\n```\n\n```olympus-speech\nRest about two and a half minutes between your compound sets.\n```'
    const { text, speech } = splitSpeech(reply)
    expect(speech).toBe('Rest about two and a half minutes between your compound sets.')
    expect(text).toBe('**Rest**\n- 2 to 3 min on compounds\n\n```olympus-action\n{"type": "set_rest", "seconds": 150}\n```')
  })

  it('gives no spoken version when there is none, and drops a block left open', () => {
    expect(splitSpeech('Just the answer.')).toEqual({ text: 'Just the answer.', speech: '' })
    expect(splitSpeech('The answer.\n\n```olympus-speech\nThe answer, said')).toEqual({ text: 'The answer.', speech: 'The answer, said' })
    // At the start of the reply (api/hercules.js SPEECH_HELP), so a reply cut at its cap keeps it.
    expect(splitSpeech('```olympus-speech\nAbout two grams per kilo.\n```\n\n**Protein**\n- 1.6 to 2.2 g/kg')).toEqual({ text: '**Protein**\n- 1.6 to 2.2 g/kg', speech: 'About two grams per kilo.' })
    expect(splitSpeech('')).toEqual({ text: '', speech: '' })
  })
})
