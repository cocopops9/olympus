import { describe, it, expect, vi, afterEach } from 'vitest'
import { checkForUpdate, resetUpdateCheck, RELEASES_PAGE, UPDATES_ON } from './update.js'

// Olympus as shipped: no release repository set in lib/app-info.js, so the app never asks
// upstream openGym for an "update", which would be a different app with a different id.
describe('updater with no repository set', () => {
  afterEach(() => { vi.restoreAllMocks(); resetUpdateCheck() })
  it('reports no update without a network request', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
    const r = await checkForUpdate()
    expect(r.hasUpdate).toBe(false)
    expect(spy).not.toHaveBeenCalled()
    expect(UPDATES_ON).toBe(false)
    expect(RELEASES_PAGE).toBe('')
  })
})
