// Olympus: the "android" release is rebuilt on every push and says its build in the notes; the
// app compares that build with its own (__APP_VERSION__ "x.y.z+<build>").
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildOf, checkForUpdate, resetUpdateCheck } from './update.js'

const release = (body, assets = ['olympus.apk', 'olympus.apk.sha256']) => ({
  ok: true, status: 200,
  json: async () => ({ tag_name: 'android', name: 'Olympus for Android', body, assets: assets.map(n => ({ name: n, browser_download_url: 'https://dl/' + n })) }),
})
afterEach(() => { vi.unstubAllGlobals(); resetUpdateCheck() })

describe('updates by build number', () => {
  it('reads the build a release states', () => {
    expect(buildOf('Olympus for Android, Build 57, built from abc1234.')).toBe(57)
    expect(buildOf('build #12')).toBe(12)
    expect(buildOf('Olympus for Android, built from abc1234.')).toBe(null)
  })
  it('offers a newer build with its APK and checksum, and not an older or unnumbered one', async () => {
    const mine = Number(String(__APP_VERSION__).split('+')[1]) || 0
    vi.stubGlobal('fetch', vi.fn(async () => release(`Build ${mine + 1}`)))
    const up = await checkForUpdate()
    expect(up).toMatchObject({ hasUpdate: true, build: mine + 1, apkUrl: 'https://dl/olympus.apk', hashUrl: 'https://dl/olympus.apk.sha256' })
    resetUpdateCheck()
    vi.stubGlobal('fetch', vi.fn(async () => release(`Build ${mine}`)))
    expect((await checkForUpdate()).hasUpdate).toBe(false)
    resetUpdateCheck()
    vi.stubGlobal('fetch', vi.fn(async () => release('no number here')))
    expect((await checkForUpdate()).hasUpdate).toBe(false)
  })
})
