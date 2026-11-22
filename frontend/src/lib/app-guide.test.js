// The app guide (lib/app-guide.js): its topics are complete and point at real places, and what
// it remembers is a new map each time, kept apart from the rest of the guide's hints.
import { describe, expect, it } from 'vitest'
import { TOPICS, TOPIC_IDS, guideProgress, nextTopic, searchTopics, topicById, topicRead, withGuideUnread, withTopicRead } from './app-guide.js'
import { SCREEN_TOURS } from './calliope.js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// The routes the app has (App.jsx), so "Show me" never opens a screen that is not there.
const app = readFileSync(resolve(process.cwd(), 'src/App.jsx'), 'utf8')
const ROUTES = [...app.matchAll(/<Route path="([^"]+)"/g)].map(m => m[1])
const routeExists = r => ROUTES.some(p => p === r || (p.includes(':') && new RegExp('^' + p.replace(/:[^/]+/g, '[^/]+') + '$').test(r)))

describe('the topics', () => {
  it('have unique ids, a title, a summary and at least two steps each', () => {
    expect(new Set(TOPIC_IDS).size).toBe(TOPICS.length)
    for (const x of TOPICS) {
      expect(x.title(), x.id).toBeTruthy()
      expect(x.summary(), x.id).toBeTruthy()
      expect(x.steps().length, x.id).toBeGreaterThanOrEqual(2)
      for (const s of x.steps()) expect(s.text, x.id).toBeTruthy()
    }
  })

  it('open screens the app has, and tours Calliope can give', () => {
    for (const x of TOPICS) {
      if (x.route) expect(routeExists(x.route), x.id + ' ' + x.route).toBe(true)
      if (x.tour) expect(SCREEN_TOURS[x.tour], x.id + ' ' + x.tour).toBeTruthy()
    }
  })

  it('draw only demos that exist and icons of the icon set', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/components/Icon.jsx'), 'utf8')
    const portraits = ['coaches', 'chiron', 'calliope']
    // The demos of components/AppGuide.jsx, read off its DEMOS map (the component needs a DOM).
    const guide = readFileSync(resolve(process.cwd(), 'src/components/AppGuide.jsx'), 'utf8')
    const DEMO_KINDS = (guide.match(/const DEMOS = \{([^}]*)\}/)?.[1] || '').split(',').map(x => x.split(':')[0].trim()).filter(Boolean)
    expect(DEMO_KINDS.length).toBeGreaterThan(0)
    for (const x of TOPICS) {
      expect(src.includes('  ' + x.icon + ':'), x.id + ' icon ' + x.icon).toBe(true)
      for (const s of x.steps()) {
        if (s.demo) expect(DEMO_KINDS, x.id).toContain(s.demo)
        else if (!portraits.includes(s.art)) expect(src.includes('  ' + s.art + ':'), x.id + ' art ' + s.art).toBe(true)
      }
    }
  })

  it('covers every part of the bar at the bottom and the main screens', () => {
    for (const id of ['basics', 'start', 'log', 'plan', 'library', 'stats', 'medals', 'body', 'coaches', 'social', 'data', 'calliope']) expect(topicById(id), id).toBeTruthy()
  })
})

describe('what it remembers', () => {
  it('marks a topic read in a new map, leaving the rest of the hints as they were', () => {
    const hints = { guide: 'new', tours: { home: true } }
    const next = withTopicRead(hints, 'log')
    expect(next).not.toBe(hints)
    expect(hints.guideRead).toBeUndefined()
    expect(next).toEqual({ guide: 'new', tours: { home: true }, guideRead: { log: true } })
    expect(topicRead({ hints: next }, 'log')).toBe(true)
    expect(topicRead({ hints: next }, 'plan')).toBe(false)
  })

  it('ignores an id that is not a topic', () => {
    expect(withTopicRead({}, 'nope')).toEqual({})
  })

  it('counts progress over the topics there are, and suggests the first one not read', () => {
    expect(guideProgress({})).toEqual({ done: 0, total: TOPICS.length })
    expect(nextTopic({}).id).toBe(TOPICS[0].id)
    let hints = withTopicRead({}, TOPICS[0].id)
    hints = { ...hints, guideRead: { ...hints.guideRead, gone: true } }
    expect(guideProgress({ hints })).toEqual({ done: 1, total: TOPICS.length })
    expect(nextTopic({ hints }).id).toBe(TOPICS[1].id)
    const all = TOPIC_IDS.reduce((h, id) => withTopicRead(h, id), {})
    expect(nextTopic({ hints: all })).toBeNull()
    expect(withGuideUnread({ ...all, guide: 'some' })).toEqual({ guide: 'some' })
  })
})

describe('the search', () => {
  it('is every topic for an empty query, in order', () => {
    expect(searchTopics('  ').map(x => x.id)).toEqual(TOPIC_IDS)
  })
  it('finds a topic by a word of its steps, ignoring case and accents, every word required', () => {
    expect(searchTopics('WARM-UP').map(x => x.id)).toContain('log')
    expect(searchTopics('hevy').map(x => x.id)).toEqual(['data'])
    expect(searchTopics('schedule').map(x => x.id)).toContain('plan')
    expect(searchTopics('schedule hevy')).toEqual([])
  })
})
