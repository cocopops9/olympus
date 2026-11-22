import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  NOTIFY_SOUNDS, NOTIFY_SOUND_IDS, NOTIFY_CHANNELS, DEFAULT_NOTIFY_SOUND, GREEK_NOTIFY_IDS,
  notifySoundOf, notifySoundEnd, notifyChannelOf, newsOn, visibleNews, NEWS_KINDS, setNewsKind,
} from './notify-sounds.js'
import { REST_SOUNDS } from './rest-sounds.js'
import { withNotifySound } from './mobile.js'

describe('notification sound choice', () => {
  it('defaults to the Greek cymbals for a profile that never picked one, or picked an unknown one', () => {
    expect(DEFAULT_NOTIFY_SOUND).toBe('kymbala')
    expect(notifySoundOf({})).toBe('kymbala')
    expect(notifySoundOf(null)).toBe('kymbala')
    expect(notifySoundOf({ notifySound: 'trumpet' })).toBe('kymbala')
    for (const id of NOTIFY_SOUND_IDS) expect(notifySoundOf({ notifySound: id })).toBe(id)
  })

  it('has an Android channel for every choice, each with its own id, and a sound file for each Greek one', () => {
    const ids = NOTIFY_SOUND_IDS.map(k => NOTIFY_CHANNELS[k].id)
    expect(new Set(ids).size).toBe(NOTIFY_SOUND_IDS.length)
    expect(NOTIFY_CHANNELS.off.importance).toBeLessThanOrEqual(2)
    for (const id of GREEK_NOTIFY_IDS) {
      const file = resolve(__dirname, '../../android/app/src/main/res/raw', NOTIFY_CHANNELS[id].sound)
      expect(existsSync(file), file).toBe(true)
      const wav = readFileSync(file)
      expect(wav.toString('ascii', 0, 4)).toBe('RIFF')
      // 16-bit mono PCM, between half a second and two seconds long
      const secs = wav.readUInt32LE(40) / wav.readUInt32LE(28)
      expect(secs).toBeGreaterThan(0.5)
      expect(secs).toBeLessThan(2)
    }
    expect(NOTIFY_CHANNELS.system.sound).toBeNull()
  })

  it('stays out of the end-of-rest sound’s key and contour: in A, and falling where the rest rises', () => {
    const restFreqs = new Set(REST_SOUNDS.greek.notes.map(n => Math.round(n[0])))
    for (const id of GREEK_NOTIFY_IDS) {
      const lyre = NOTIFY_SOUNDS[id].lyre.map(n => n[0])
      expect(lyre[0]).toBe(880)
      for (let i = 1; i < lyre.length; i++) expect(lyre[i]).toBeLessThan(lyre[i - 1])
      // the last note is E5, which the rest sound starts on, but not its rising shape
      expect(restFreqs.has(Math.round(lyre[1]))).toBe(id === 'kymbala')
      expect(notifySoundEnd(id)).toBeGreaterThan(1)
      expect(notifySoundEnd(id)).toBeLessThan(2)
    }
    expect(notifySoundEnd('system')).toBe(0)
  })

  it('puts reminders on the channel of the sound picked, with the file named for iOS', () => {
    const n = [{ id: 1000, title: 'Workout day' }]
    expect(withNotifySound({}, n)).toEqual([{ id: 1000, title: 'Workout day', channelId: 'olympus-kymbala-1', sound: 'olympus_kymbala.wav' }])
    expect(withNotifySound({ notifySound: 'system' }, n)).toEqual([{ id: 1000, title: 'Workout day', channelId: 'olympus-default-1' }])
    expect(withNotifySound({ notifySound: 'off' }, n)[0].channelId).toBe(notifyChannelOf({ notifySound: 'off' }).id)
  })
})

describe('which kinds of news are shown', () => {
  const items = [
    { id: 'a', kind: 'like', read: false }, { id: 'b', kind: 'comment', read: false },
    { id: 'c', kind: 'follow', read: true }, { id: 'd', kind: 'like', read: true },
  ]
  it('shows every kind until one is switched off', () => {
    for (const k of NEWS_KINDS) expect(newsOn({}, k)).toBe(true)
    expect(visibleNews({}, items)).toEqual({ items, unread: 2 })
  })
  it('leaves a kind switched off out of the list and the unread count', () => {
    const v = visibleNews({ newsOff: ['like'] }, items)
    expect(v.items.map(n => n.id)).toEqual(['b', 'c'])
    expect(v.unread).toBe(1)
    expect(visibleNews({ newsOff: ['like'] }, undefined)).toEqual({ items: [], unread: 0 })
  })
  it('switches a kind off and back on, keeping the list in a fixed order without repeats', () => {
    const s = {}
    setNewsKind(s, 'follow', false)
    setNewsKind(s, 'like', false)
    setNewsKind(s, 'like', false)
    expect(s.newsOff).toEqual(['like', 'follow'])
    setNewsKind(s, 'like', true)
    expect(s.newsOff).toEqual(['follow'])
  })
})
