/* The remote connector's protocol: MCP over Streamable HTTP, stateless, JSON answers only.
   The same nine read-only tools as the stdio server (tools.js), for one profile per request.

   The transport (which request belongs to which profile, and reading that profile's document)
   is the caller's: supabase/functions/olympus/connector.js. This file only turns one JSON-RPC
   message into its answer, so it runs unchanged in Node (the tests) and in a Deno Edge Function.

   Stateless on purpose: an Edge Function keeps nothing between requests, and nothing here needs
   a session. No Mcp-Session-Id is issued, no server-to-client stream is offered (GET is 405),
   and every request is answered with one application/json body. The specification allows all
   three (Transports, "Streamable HTTP"). */
import { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { TOOLS } from './tools.js'
import { withProfile } from './profile.js'

// Newest first. A client asking for one of these gets it back; any other gets the newest, and
// the specification leaves it to the client to disconnect if it cannot speak that one.
export const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05']

export const SERVER_INFO = { name: 'olympus', title: 'Olympus', version: '1.0.0' }

const INSTRUCTIONS = [
  'Read-only access to one Olympus profile: routines, the week plan, logged workouts set by set, body weight, estimated one-rep maxes and muscle balance.',
  'The numbers come from the same code the app uses, so they match what the athlete sees on the Stats screen.',
  'Before naming a weight for the next session, call preview_session: a routine stores a plan, but the app opens the session at the weight the progression rule and the history give.',
  'Dates are YYYY-MM-DD. "Today" is the server\'s date in UTC; pass an explicit date when the athlete\'s local day may differ.',
  'The data is what the app last synced: a set logged on a phone that is offline shows up once it syncs.'
].join(' ')

// The same conversion the MCP SDK applies to a raw zod shape (server/mcp.js, ListTools), so this
// connector lists exactly the input schemas the stdio server lists.
const toolIndex = new Map(TOOLS.map(t => {
  const parser = z.object(t.schema || {})
  const inputSchema = zodToJsonSchema(parser, { strictUnions: true, pipeStrategy: 'input' })
  // A tool without arguments: the SDK registers the empty shape as a loose object, which lists
  // no additionalProperties rule. Listed the same way here.
  if (!Object.keys(t.schema || {}).length) delete inputSchema.additionalProperties
  const definition = {
    name: t.name,
    description: t.description,
    inputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }
  return [t.name, { definition, parser, handler: t.handler }]
}))

export const toolDefinitions = () => [...toolIndex.values()].map(t => t.definition)

const rpcError = (id, code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } })
const rpcResult = (id, result) => ({ jsonrpc: '2.0', id, result })
const textResult = (text, isError = false) => ({ content: [{ type: 'text', text }], ...(isError ? { isError: true } : {}) })

/**
 * Answers one JSON-RPC message. Returns the response object, or null for a notification or a
 * response (neither gets an answer). `load` is called only by tools/call and resolves to
 * { state, user } for the profile the request belongs to (state null: never synced).
 */
export async function answerMessage(message, { load }) {
  if (!message || typeof message !== 'object' || Array.isArray(message) || message.jsonrpc !== '2.0') {
    return rpcError(null, -32600, 'invalid request')
  }
  const isRequest = typeof message.method === 'string' && 'id' in message && message.id !== null
  if (!isRequest) return null          // a notification (notifications/initialized, cancelled) or a response
  const { id, method } = message
  const params = message.params && typeof message.params === 'object' ? message.params : {}

  if (method === 'initialize') {
    const asked = typeof params.protocolVersion === 'string' ? params.protocolVersion : ''
    return rpcResult(id, {
      protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
      capabilities: { tools: { listChanged: false } },
      serverInfo: SERVER_INFO,
      instructions: INSTRUCTIONS
    })
  }
  if (method === 'ping') return rpcResult(id, {})
  if (method === 'tools/list') return rpcResult(id, { tools: toolDefinitions() })
  if (method === 'tools/call') {
    const tool = toolIndex.get(params.name)
    if (!tool) return rpcError(id, -32602, `unknown tool: ${String(params.name)}`)
    // A wrong argument is the model's to correct, so it comes back as a tool error it can read,
    // not as a protocol error (specification: Tools, "Error Handling").
    const parsed = tool.parser.safeParse(params.arguments ?? {})
    if (!parsed.success) {
      const why = parsed.error.issues.map(i => (i.path.length ? i.path.join('.') + ': ' : '') + i.message).join('; ')
      return rpcResult(id, textResult(`EINVAL: ${why}`, true))
    }
    const { state, user } = await load()
    try {
      const result = withProfile(state, user, () => tool.handler(parsed.data))
      return rpcResult(id, textResult(JSON.stringify(result, null, 2)))
    } catch (err) {
      return rpcResult(id, textResult(`${err.code || 'ERROR'}: ${err.message}`, true))
    }
  }
  // Methods of capabilities this server does not declare (resources, prompts, completion…).
  return rpcError(id, -32601, `method not found: ${method}`)
}

/**
 * Answers a POST body: one message, or a batch (the 2025-03-26 revision allows batches; later
 * ones do not, and answering one costs nothing). Returns { status, body }: 202 with no body
 * when nothing in it needed an answer.
 */
export async function answerBody(text, { load }) {
  let parsed
  try { parsed = JSON.parse(text) } catch { return { status: 400, body: rpcError(null, -32700, 'parse error') } }
  if (Array.isArray(parsed)) {
    if (!parsed.length) return { status: 400, body: rpcError(null, -32600, 'invalid request') }
    const out = []
    for (const m of parsed) { const r = await answerMessage(m, { load }); if (r) out.push(r) }
    return out.length ? { status: 200, body: out } : { status: 202, body: null }
  }
  const r = await answerMessage(parsed, { load })
  return r ? { status: 200, body: r } : { status: 202, body: null }
}
