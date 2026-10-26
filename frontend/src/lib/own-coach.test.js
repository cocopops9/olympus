// @vitest-environment happy-dom
// Coaches of your own (lib/own-coach.js): what is checked before saving, how they are kept on the
// device, and the two ways of talking to a provider (OpenAI-style and Anthropic), with a fake fetch.
import { beforeEach, describe, expect, it } from 'vitest'
import { problemOf, saveOwnCoach, loadOwnCoaches, ownCoach, deleteOwnCoach, askOwnCoach, listModels, isOwn, providerOf } from './own-coach.js'

const base = { name: 'Apollo', provider: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-x', key: 'sk-1' }

// A fetch that records the call and answers with `body` and `status`.
function fakeFetch(body, status = 200) {
  const calls = []
  const impl = async (url, init) => {
    calls.push({ url, init, body: init.body ? JSON.parse(init.body) : null })
    return { ok: status >= 200 && status < 300, status, json: async () => body }
  }
  return { impl, calls }
}
const S = { unit: 'kg', workouts: [], exWeights: {}, routines: [], bodyweight: [] }

describe('own coaches: checks', () => {
  it('a complete coach has no problem', () => expect(problemOf(base)).toBe(null))
  it('needs a name', () => expect(problemOf({ ...base, name: '  ' })).toBe('name'))
  it('needs an http(s) address', () => expect(problemOf({ ...base, baseUrl: 'api.openai.com' })).toBe('url'))
  it('needs a model', () => expect(problemOf({ ...base, model: '' })).toBe('model'))
  it('needs a key where the provider wants one', () => expect(problemOf({ ...base, key: '' })).toBe('key'))
  it('a model on your computer needs no key', () => {
    expect(problemOf({ ...base, provider: 'ollama', baseUrl: 'http://192.168.1.20:11434/v1', key: '' })).toBe(null)
  })
  it('an unknown provider counts as OpenAI-compatible', () => expect(providerOf('nope').id).toBe('custom'))
})

describe('own coaches: kept on the device', () => {
  beforeEach(() => localStorage.clear())
  it('saving gives an id, trims, and lists it', () => {
    const c = saveOwnCoach('u1', { ...base, name: '  Apollo  ', baseUrl: 'https://x.test/v1/' })
    expect(isOwn(c.id)).toBe(true)
    expect(c.name).toBe('Apollo')
    expect(c.baseUrl).toBe('https://x.test/v1')
    expect(loadOwnCoaches('u1').map(x => x.id)).toEqual([c.id])
    expect(loadOwnCoaches('u2')).toEqual([])
  })
  it('saving again with the id edits in place; removing drops it and its chats', () => {
    const c = saveOwnCoach('u1', base)
    saveOwnCoach('u1', { ...c, name: 'Ares' })
    expect(loadOwnCoaches('u1')).toHaveLength(1)
    expect(ownCoach('u1', c.id).name).toBe('Ares')
    localStorage.setItem('olympus_' + c.id + '_chats_u1', '[]')
    deleteOwnCoach('u1', c.id)
    expect(loadOwnCoaches('u1')).toEqual([])
    expect(localStorage.getItem('olympus_' + c.id + '_chats_u1')).toBe(null)
  })
  it('broken storage reads as none', () => {
    localStorage.setItem('olympus_own_coaches_u1', '{oops')
    expect(loadOwnCoaches('u1')).toEqual([])
  })
})

describe('own coaches: talking to the provider', () => {
  const list = [{ role: 'user', content: 'Plan my week' }]
  it('OpenAI-style: system prompt with the persona, bearer key, reply without thinking', async () => {
    const f = fakeFetch({ choices: [{ message: { content: '<think>hm</think>Train three days.' } }] })
    const r = await askOwnCoach({ ...base, style: 'Be brief.' }, list, { fetchImpl: f.impl, S, name: 'Giu' })
    expect(r.reply).toBe('Train three days.')
    const call = f.calls[0]
    expect(call.url).toBe('https://api.openai.com/v1/chat/completions')
    expect(call.init.headers.Authorization).toBe('Bearer sk-1')
    expect(call.body.model).toBe('gpt-x')
    expect(call.body.messages[0].role).toBe('system')
    expect(call.body.messages[0].content).toContain('You are Apollo')
    expect(call.body.messages[0].content).toContain('Be brief.')
    expect(call.body.messages.at(-1)).toEqual({ role: 'user', content: 'Plan my week' })
  })
  it('Anthropic: /messages with x-api-key and the system apart', async () => {
    const f = fakeFetch({ content: [{ type: 'text', text: 'Hello, I am Apollo.' }] })
    const c = { ...base, provider: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', model: 'claude-x' }
    const r = await askOwnCoach(c, list, { fetchImpl: f.impl, S, name: 'Giu' })
    expect(r.reply).toBe('Hello, I am Apollo.')
    const call = f.calls[0]
    expect(call.url).toBe('https://api.anthropic.com/v1/messages')
    expect(call.init.headers['x-api-key']).toBe('sk-1')
    expect(call.init.headers['anthropic-version']).toBe('2023-06-01')
    expect(call.body.system).toContain('You are Apollo')
    expect(call.body.messages).toEqual([{ role: 'user', content: 'Plan my week' }])
  })
  it('a refused key, a limit and an empty answer come back as codes', async () => {
    await expect(askOwnCoach(base, list, { fetchImpl: fakeFetch({ error: { message: 'bad key' } }, 401).impl, S }))
      .rejects.toMatchObject({ data: { code: 'own-key', message: 'bad key' } })
    await expect(askOwnCoach(base, list, { fetchImpl: fakeFetch({}, 429).impl, S }))
      .rejects.toMatchObject({ data: { code: 'own-limit' } })
    await expect(askOwnCoach(base, list, { fetchImpl: fakeFetch({ choices: [] }).impl, S }))
      .rejects.toMatchObject({ data: { code: 'own-failed' } })
  })
  it('an unreachable provider is a network problem', async () => {
    const impl = async () => { throw new TypeError('Failed to fetch') }
    await expect(askOwnCoach(base, list, { fetchImpl: impl, S })).rejects.toMatchObject({ data: { code: 'own-network' } })
  })
  it('lists models from data[] or models[], sorted and without the "models/" prefix', async () => {
    const a = fakeFetch({ data: [{ id: 'b' }, { id: 'a' }, { id: 'a' }] })
    expect(await listModels(base, { fetchImpl: a.impl })).toEqual(['a', 'b'])
    expect(a.calls[0].url).toBe('https://api.openai.com/v1/models')
    const g = fakeFetch({ models: [{ name: 'models/gemini-x' }] })
    expect(await listModels({ ...base, provider: 'gemini' }, { fetchImpl: g.impl })).toEqual(['gemini-x'])
  })
})
