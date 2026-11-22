import { describe, it, expect } from 'vitest'
import { richBlocks, inlineRuns } from './rich-text.js'

// The answer that came back as raw pipes and tags on 2026-11-22 (shortened).
const SQUAT = [
  '**Squat Fundamentals (knee-friendly)**',
  '',
  '| Phase | Cue |',
  '|-------|-----|',
  '| **Setup** | • Feet shoulder-width apart, toes slightly out. <br>• Weight on mid-foot. <br>• Chest up, core braced. |',
  '| **Descent** | • Push the hips back, then bend the knees. <br>• Knees track over the toes. |',
  '',
  '### Key Safety Tips',
  '- Stop if the knee hurts.',
  '- Warm up first.',
].join('\n')

describe('richBlocks', () => {
  it('turns a table into a heading and bullets per row, with no pipes or tags left', () => {
    const blocks = richBlocks(SQUAT)
    expect(blocks).toEqual([
      { type: 'h', text: 'Squat Fundamentals (knee-friendly)' },
      { type: 'h', text: 'Setup' },
      { type: 'ul', items: ['Feet shoulder-width apart, toes slightly out.', 'Weight on mid-foot.', 'Chest up, core braced.'] },
      { type: 'h', text: 'Descent' },
      { type: 'ul', items: ['Push the hips back, then bend the knees.', 'Knees track over the toes.'] },
      { type: 'h', text: 'Key Safety Tips' },
      { type: 'ul', items: ['Stop if the knee hurts.', 'Warm up first.'] },
    ])
    const all = JSON.stringify(blocks)
    expect(all).not.toMatch(/\||<br|###/)
  })

  it('labels the bullets with the column names when a table has several detail columns', () => {
    const t = '| Exercise | Sets | Reps |\n|---|---|---|\n| Squat | 4 | 6 |\n| Bench | 3 | 8 |'
    expect(richBlocks(t)).toEqual([
      { type: 'h', text: 'Squat' }, { type: 'ul', items: ['Sets: 4', 'Reps: 6'] },
      { type: 'h', text: 'Bench' }, { type: 'ul', items: ['Sets: 3', 'Reps: 8'] },
    ])
  })

  it('keeps paragraphs, line breaks and numbered lists as before', () => {
    expect(richBlocks('First line\nsecond line\n\n1. one\n2. two\n\nEnd.')).toEqual([
      { type: 'p', lines: ['First line', 'second line'] },
      { type: 'ol', items: ['one', 'two'] },
      { type: 'p', lines: ['End.'] },
    ])
  })

  it('reads <br> outside a table as a line break, and drops other tags, rules and emphasis marks', () => {
    expect(richBlocks('Rest 2 min.<br>Then *go* `heavy`.\n\n---\n\n<b>Done</b>')).toEqual([
      { type: 'p', lines: ['Rest 2 min.', 'Then go heavy.'] },
      { type: 'p', lines: ['Done'] },
    ])
  })

  it('keeps a bold phrase inside a sentence inline, not as a heading', () => {
    expect(richBlocks('Rest **2 min** between sets.')).toEqual([{ type: 'p', lines: ['Rest **2 min** between sets.'] }])
  })

  it('a list right after a paragraph starts a list', () => {
    expect(richBlocks('Cues:\n- chest up\n- brace')).toEqual([
      { type: 'p', lines: ['Cues:'] }, { type: 'ul', items: ['chest up', 'brace'] },
    ])
  })
})

describe('inlineRuns', () => {
  it('splits bold runs and drops a stray marker', () => {
    expect(inlineRuns('Rest **2 min** now**')).toEqual([
      { text: 'Rest ', bold: false }, { text: '2 min', bold: true }, { text: ' now', bold: false },
    ])
  })
})
