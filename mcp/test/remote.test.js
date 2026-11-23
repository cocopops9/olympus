// The remote connector: mcp/src/remote.js (the protocol) behind
// supabase/functions/olympus/connector.js (the address, the token, the profile), with the app's
// own routes (core.js /api/connector) handing out the address. Run against the in-memory store,
// which keeps the Postgres store's contract (api/test/supabase-core.test.js).
//
// What would show it wrong, decided before writing it:
//   - the tools Claude is offered differ from the stdio server's (names, descriptions, schemas);
//   - a tool answers differently over HTTP than the same handler does in-process;
//   - one profile's address reads another profile's data, or a replaced, removed or signed-out
//     address still reads anything;
//   - the database keeps the address in a form that works if copied.
import { describe, test, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { buildDemoState } from '../../frontend/src/lib/demoSeed.js'
import { TOOLS } from '../src/tools.js'
import { withProfile, getState } from '../src/profile.js'
import { _seedStateForTests } from '../src/state.js'
import { answerMessage, toolDefinitions, PROTOCOL_VERSIONS } from '../src/remote.js'
import { createApp, memoryStore, memoryPhotos } from '../../supabase/functions/olympus/core.js'
import { createConnector } from '../../supabase/functions/olympus/connector.js'
import { connectorBase } from '../../supabase/functions/olympus/connector-token.js'

const TODAY = '2026-07-27'
const APP = 'https://proj.supabase.co/functions/v1/olympus'
// The functions host, not /functions/v1 on the project host (connector-token.js, connectorBase).
const CONNECTOR = 'https://proj.functions.supabase.co/olympus-mcp'
const PW = 'correct horse battery staple'

beforeAll(() => { vi.useFakeTimers({ now: new Date(TODAY + 'T12:00:00Z'), toFake: ['Date'] }) })
afterAll(() => { vi.useRealTimers() })

function world() {
  const clock = { t: Date.parse(TODAY + 'T12:00:00Z') }
  const store = memoryStore()
  const app = createApp({ store, photos: memoryPhotos(), now: () => clock.t, env: { SUPABASE_URL: 'https://proj.supabase.co' } })
  const connector = createConnector({ store, now: () => clock.t })
  const call = async (method, p, { body, token } = {}) => {
    const res = await app.handle(new Request(APP + p, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body)
    }))
    return { status: res.status, body: await res.json() }
  }
  const signup = async name => (await call('POST', '/api/app/signup', { body: { name, password: PW, email: name.toLowerCase() + '@example.com' } })).body
  const putState = async (session, state) => call('PUT', '/api/data', { token: session, body: { state } })
  let seq = 0
  const rpc = async (url, method, params, { headers = {}, notify = false } = {}) => {
    const msg = { jsonrpc: '2.0', method, ...(params ? { params } : {}), ...(notify ? {} : { id: ++seq }) }
    const res = await connector.handle(new Request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...headers },
      body: JSON.stringify(msg)
    }))
    const text = await res.text()
    return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers }
  }
  const tool = async (url, name, args = {}) => {
    const r = await rpc(url, 'tools/call', { name, arguments: args })
    const res = r.body.result
    return { isError: !!res.isError, text: res.content[0].text, json: res.isError ? null : JSON.parse(res.content[0].text) }
  }
  return { clock, store, app, connector, call, signup, putState, rpc, tool }
}

const demo = () => { const s = buildDemoState(); s.unit = 'kg'; return s }

describe('the protocol (remote.js)', () => {
  test('lists exactly the tools, descriptions and input schemas the stdio server lists', async () => {
    const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js')
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')
    const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js')
    const server = new McpServer({ name: 'opengym', version: '0.1.0' })
    for (const t of TOOLS) server.tool(t.name, t.description, t.schema, async () => ({ content: [] }))
    const client = new Client({ name: 'parity', version: '1' })
    const [ct, st] = InMemoryTransport.createLinkedPair()
    await Promise.all([server.connect(st), client.connect(ct)])
    const sdk = (await client.listTools()).tools
    const ours = toolDefinitions()
    expect(ours.map(t => t.name)).toEqual(sdk.map(t => t.name))
    for (const t of ours) {
      const s = sdk.find(x => x.name === t.name)
      expect(t.description).toBe(s.description)
      expect(t.inputSchema).toEqual(s.inputSchema)
      expect(t.annotations.readOnlyHint).toBe(true)
    }
  })

  test('initialize agrees on a version the client asked for, and falls back to the newest', async () => {
    for (const v of PROTOCOL_VERSIONS) {
      const r = await answerMessage({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: v, capabilities: {}, clientInfo: { name: 'c', version: '1' } } }, { load: null })
      expect(r.result.protocolVersion).toBe(v)
      expect(r.result.capabilities.tools).toBeTruthy()
      expect(r.result.serverInfo.name).toBe('olympus')
    }
    const odd = await answerMessage({ jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '1999-01-01' } }, { load: null })
    expect(odd.result.protocolVersion).toBe(PROTOCOL_VERSIONS[0])
  })

  test('notifications get no answer; unknown methods and tools are errors; bad arguments are tool errors', async () => {
    const load = async () => ({ state: demo(), user: { id: 'u', name: 'U' } })
    expect(await answerMessage({ jsonrpc: '2.0', method: 'notifications/initialized' }, { load })).toBeNull()
    expect((await answerMessage({ jsonrpc: '2.0', id: 3, method: 'resources/list' }, { load })).error.code).toBe(-32601)
    expect((await answerMessage({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'drop_tables' } }, { load })).error.code).toBe(-32602)
    const bad = await answerMessage({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'list_workouts', arguments: { limit: 0 } } }, { load })
    expect(bad.result.isError).toBe(true)
    expect(bad.result.content[0].text).toMatch(/^EINVAL: limit/)
    expect((await answerMessage({ jsonrpc: '1.0', id: 6, method: 'ping' }, { load })).error.code).toBe(-32600)
  })

  test('a tool answers over the protocol exactly what its handler answers in-process', async () => {
    const S = demo()
    const load = async () => ({ state: S, user: { id: 'u', name: 'U' } })
    const cases = [['list_routines', {}], ['list_workouts', { limit: 5 }], ['get_bodyweight', {}], ['estimate_1rm', {}], ['muscle_balance', { period: 'month' }], ['get_week_plan', {}], ['preview_session', { date: TODAY }]]
    for (const [name, args] of cases) {
      _seedStateForTests(S)
      const local = TOOLS.find(t => t.name === name).handler(args)
      const r = await answerMessage({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name, arguments: args } }, { load })
      expect(r.result.isError, name).toBeUndefined()
      expect(JSON.parse(r.result.content[0].text), name).toEqual(JSON.parse(JSON.stringify(local)))
    }
  })

  test('a profile set for one call is gone after it, even when the tool throws', () => {
    _seedStateForTests({ ...demo(), unit: 'lb' })
    expect(withProfile({ unit: 'kg' }, { id: 'x' }, () => getState().unit)).toBe('kg')
    expect(getState().unit).toBe('lb')
    expect(() => withProfile({ unit: 'kg' }, { id: 'x' }, () => { throw new Error('boom') })).toThrow('boom')
    expect(getState().unit).toBe('lb')
  })
})

describe('the address (core.js /api/connector and connector.js)', () => {
  let w, ana, ben
  beforeEach(async () => {
    w = world()
    ana = await w.signup('Ana')
    ben = await w.signup('Ben')
    const a = demo()
    const b = demo(); b.workouts = []; b.bodyweight = [{ d: TODAY, w: 91.5 }]
    expect((await w.putState(ana.token, a)).status).toBe(200)
    expect((await w.putState(ben.token, b)).status).toBe(200)
  })

  test('off until made; made once, shown once, kept only as a hash', async () => {
    expect((await w.call('GET', '/api/connector', { token: ana.token })).body).toEqual({ available: true, on: false, created: null, used: null })
    expect((await w.call('GET', '/api/connector')).status).toBe(401)
    const made = await w.call('POST', '/api/connector', { token: ana.token, body: {} })
    expect(made.status).toBe(200)
    expect(made.body.url.startsWith(CONNECTOR + '/')).toBe(true)
    const token = made.body.url.slice(CONNECTOR.length + 1)
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    const st = (await w.call('GET', '/api/connector', { token: ana.token })).body
    expect(st).toMatchObject({ on: true, created: w.clock.t, used: null })
    expect(st.url).toBeUndefined()
    expect(JSON.stringify(w.store.docs.get('db'))).not.toContain(token)
  })

  test('Claude connects, lists the tools and reads its own profile only', async () => {
    const urlA = (await w.call('POST', '/api/connector', { token: ana.token, body: {} })).body.url
    const urlB = (await w.call('POST', '/api/connector', { token: ben.token, body: {} })).body.url
    const init = await w.rpc(urlA, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'claude-ai', version: '1' } })
    expect(init.status).toBe(200)
    expect(init.headers.get('content-type')).toMatch(/application\/json/)
    expect(init.body.result.protocolVersion).toBe('2025-06-18')
    expect((await w.rpc(urlA, 'notifications/initialized', null, { notify: true })).status).toBe(202)
    expect((await w.rpc(urlA, 'tools/list')).body.result.tools.length).toBe(TOOLS.length)

    const a = await w.tool(urlA, 'get_bodyweight')
    const b = await w.tool(urlB, 'get_bodyweight')
    expect(b.json.latest.weight).toBe(91.5)
    expect(a.json.latest.weight).not.toBe(91.5)
    expect((await w.tool(urlA, 'list_workouts')).json.workouts.length).toBeGreaterThan(0)
    expect((await w.tool(urlB, 'list_workouts')).json.workouts ?? []).toEqual([])
  })

  test('the token also works as a bearer header on the bare address', async () => {
    const url = (await w.call('POST', '/api/connector', { token: ana.token, body: {} })).body.url
    const token = url.slice(CONNECTOR.length + 1)
    const r = await w.rpc(CONNECTOR, 'ping', null, { headers: { Authorization: 'Bearer ' + token } })
    expect(r.status).toBe(200)
    expect(r.body.result).toEqual({})
  })

  test('a made-up, replaced, removed or signed-out address reads nothing', async () => {
    expect((await w.rpc(CONNECTOR + '/' + 'x'.repeat(43), 'ping')).status).toBe(404)
    expect((await w.rpc(CONNECTOR, 'ping')).status).toBe(404)
    const first = (await w.call('POST', '/api/connector', { token: ana.token, body: {} })).body.url
    const second = (await w.call('POST', '/api/connector', { token: ana.token, body: {} })).body.url
    expect(second).not.toBe(first)
    expect((await w.rpc(first, 'ping')).status).toBe(404)
    expect((await w.rpc(second, 'ping')).status).toBe(200)
    expect((await w.call('POST', '/api/connector/delete', { token: ana.token, body: {} })).status).toBe(200)
    expect((await w.rpc(second, 'ping')).status).toBe(404)
    expect((await w.call('GET', '/api/connector', { token: ana.token })).body.on).toBe(false)
    const third = (await w.call('POST', '/api/connector', { token: ana.token, body: {} })).body.url
    expect((await w.call('POST', '/api/logout/all', { token: ana.token, body: {} })).status).toBe(200)
    expect((await w.rpc(third, 'ping')).status).toBe(404)
  })

  test('"last used" is written on use, at most once an hour', async () => {
    const url = (await w.call('POST', '/api/connector', { token: ana.token, body: {} })).body.url
    await w.rpc(url, 'ping')
    const t0 = w.clock.t
    const used = async () => (await w.call('GET', '/api/connector', { token: ana.token })).body.used
    expect(await used()).toBe(t0)
    w.clock.t += 60000
    await w.rpc(url, 'ping')
    expect(await used()).toBe(t0)
    w.clock.t += 3600000
    await w.rpc(url, 'ping')
    expect(await used()).toBe(w.clock.t)
  })

  test('HTTP edges: no stream on GET, parse errors, CORS preflight', async () => {
    const url = (await w.call('POST', '/api/connector', { token: ana.token, body: {} })).body.url
    expect((await w.connector.handle(new Request(url, { method: 'GET', headers: { Accept: 'text/event-stream' } }))).status).toBe(405)
    const bad = await w.connector.handle(new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{nope' }))
    expect(bad.status).toBe(400)
    expect((await bad.json()).error.code).toBe(-32700)
    const pre = await w.connector.handle(new Request(url, { method: 'OPTIONS' }))
    expect(pre.status).toBe(204)
    expect(pre.headers.get('access-control-allow-headers')).toMatch(/Mcp-Protocol-Version/)
  })

  test('without a project address the app says the connector is unavailable', async () => {
    const store = memoryStore()
    const app = createApp({ store, photos: memoryPhotos(), env: {} })
    const s = await (await app.handle(new Request(APP + '/api/app/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Cyra', password: PW, email: 'cyra@example.com' }) }))).json()
    expect(s.token).toBeTruthy()
    const get = await (await app.handle(new Request(APP + '/api/connector', { headers: { Authorization: 'Bearer ' + s.token } }))).json()
    expect(get.available).toBe(false)
    expect((await app.handle(new Request(APP + '/api/connector', { method: 'POST', headers: { Authorization: 'Bearer ' + s.token }, body: '{}' }))).status).toBe(503)
  })
})

describe('connector address host', () => {
  // On <ref>.supabase.co the gateway answers /.well-known/oauth-protected-resource/functions/v1/...
  // with 401, which Claude reads as "sign-in required"; the functions host answers it with 404.
  test('a hosted project gets the functions host, so Claude finds no sign-in', () => {
    expect(connectorBase({ SUPABASE_URL: 'https://abcdef123.supabase.co' })).toBe('https://abcdef123.functions.supabase.co/olympus-mcp')
    expect(connectorBase({ SUPABASE_URL: 'https://abcdef123.supabase.co/' })).toBe('https://abcdef123.functions.supabase.co/olympus-mcp')
  })
  test('a local or self-hosted project keeps /functions/v1, and OLYMPUS_CONNECTOR_URL wins', () => {
    expect(connectorBase({ SUPABASE_URL: 'http://127.0.0.1:54321' })).toBe('http://127.0.0.1:54321/functions/v1/olympus-mcp')
    expect(connectorBase({ SUPABASE_URL: 'https://db.example.org' })).toBe('https://db.example.org/functions/v1/olympus-mcp')
    expect(connectorBase({ SUPABASE_URL: 'https://abcdef123.supabase.co', OLYMPUS_CONNECTOR_URL: 'https://mcp.example.org/x/' })).toBe('https://mcp.example.org/x')
    expect(connectorBase({})).toBe(null)
  })
})
