import { describe, it, expect } from 'vitest'
import { RELEASES_PAGE, UPDATES_ON } from './update.js'
import { UPDATE_REPO } from './app-info.js'

// Olympus checks its own releases (the "android" release the APK workflow publishes), never
// upstream openGym's: an openGym APK is a different app with a different id.
describe('the updater looks at Olympus only', () => {
  it('points at this repository', () => {
    expect(UPDATES_ON).toBe(true)
    expect(UPDATE_REPO).toBe('cocopops9/olympus')
    expect(RELEASES_PAGE).toBe('https://github.com/cocopops9/olympus/releases/latest')
    expect(UPDATE_REPO).not.toMatch(/opengym/i)
  })
})
