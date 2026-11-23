// The Supabase functions run on Deno, where Node's Buffer is not a global: a module that uses it
// without importing it passes every test here (Node) and fails only live, as the connector's
// sealToken did (ReferenceError: Buffer is not defined, 2026-11-23).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../supabase/functions')
const modules = fs.readdirSync(root, { recursive: true })
  .filter(f => /\.(js|ts)$/.test(f) && !/\.test\./.test(f))
  .map(f => path.join(root, f))

describe('Supabase function modules', () => {
  test('every module that uses Buffer imports it from node:buffer', () => {
    const missing = modules.filter(f => {
      const src = fs.readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '')
      return /\bBuffer\./.test(src) && !/import\s*\{[^}]*\bBuffer\b[^}]*\}\s*from\s*['"]node:buffer['"]/.test(src)
    }).map(f => path.relative(root, f))
    expect(missing).toEqual([])
  })
})
