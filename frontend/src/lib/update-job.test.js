// @vitest-environment happy-dom
// The update downloading in the background (lib/update-job.js): Android's DownloadManager does the
// work; the job follows it, can cancel it, checks and installs at the end, and survives a restart.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useUpdateJob, startUpdate, cancelUpdate, resumeUpdate, setInstallPlugin, updateRunning } from './update-job.js'

const HASH = 'a'.repeat(64)
let status, fake
beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  status = { status: 'running', bytes: 0, total: 1000 }
  fake = {
    startDownload: vi.fn(async () => ({ id: '42' })),
    downloadStatus: vi.fn(async () => status),
    cancelDownload: vi.fn(async () => {}),
    installApk: vi.fn(async () => {}),
  }
  setInstallPlugin(fake)
})
afterEach(async () => { await cancelUpdate(); vi.useRealTimers() })

describe('background update', () => {
  it('works with a plugin that answers every property, `then` included, like Capacitor\'s proxy', async () => {
    // registerPlugin() gives such a Proxy; handing it back from a promise would hang on "then".
    const real = fake
    setInstallPlugin(new Proxy({}, {
      get: (_, prop) => (prop === 'then' ? () => new Promise(() => {}) : real[prop] || (() => new Promise(() => {}))),
    }))
    await startUpdate({ apkUrl: 'https://x/app.apk', hash: HASH })
    expect(real.startDownload).toHaveBeenCalled()
    expect(useUpdateJob.getState().phase).toBe('downloading')
    status = { status: 'done', bytes: 1000, total: 1000 }
    await vi.advanceTimersByTimeAsync(800)
    expect(real.installApk).toHaveBeenCalled()
  })

  it('does not wait for ever on a download manager that does not answer', async () => {
    fake.startDownload = vi.fn(() => new Promise(() => {}))
    const started = startUpdate({ apkUrl: 'https://x/app.apk', hash: HASH })
    const seen = expect(started).rejects.toThrow()
    await vi.advanceTimersByTimeAsync(12000)
    await seen
    expect(useUpdateJob.getState().phase).toBe('idle')
    expect(updateRunning()).toBe(false)
  })

  it('follows the download and installs the checked file at the end', async () => {
    await startUpdate({ apkUrl: 'https://x/app.apk', hash: HASH })
    expect(fake.startDownload).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://x/app.apk' }))
    expect(useUpdateJob.getState().phase).toBe('downloading')
    status = { status: 'running', bytes: 500, total: 1000 }
    await vi.advanceTimersByTimeAsync(800)
    expect(useUpdateJob.getState().pct).toBe(50)
    status = { status: 'done', bytes: 1000, total: 1000 }
    await vi.advanceTimersByTimeAsync(800)
    expect(fake.installApk).toHaveBeenCalledWith({ fileName: 'olympus-update.apk', place: 'downloads', sha256: HASH })
    expect(useUpdateJob.getState().phase).toBe('idle')
    expect(updateRunning()).toBe(false)
  })

  it('cancels: the system download is removed and the bar goes', async () => {
    await startUpdate({ apkUrl: 'https://x/app.apk', hash: HASH })
    await cancelUpdate()
    expect(fake.cancelDownload).toHaveBeenCalledWith({ id: '42' })
    expect(useUpdateJob.getState().phase).toBe('idle')
    await vi.advanceTimersByTimeAsync(2000)
    expect(fake.installApk).not.toHaveBeenCalled()
  })

  it('refuses to start without a checksum', async () => {
    await expect(startUpdate({ apkUrl: 'https://x/app.apk', hash: null })).rejects.toThrow()
    expect(fake.startDownload).not.toHaveBeenCalled()
  })

  it('picks up a download begun before the app was closed', async () => {
    localStorage.setItem('olympus.updateJob', JSON.stringify({ id: '7', hash: HASH }))
    expect(resumeUpdate()).toBe(true)
    await vi.advanceTimersByTimeAsync(10)
    expect(fake.downloadStatus).toHaveBeenCalledWith({ id: '7' })
    expect(useUpdateJob.getState().phase).toBe('downloading')
  })

  it('says so when the download fails', async () => {
    await startUpdate({ apkUrl: 'https://x/app.apk', hash: HASH })
    status = { status: 'failed' }
    await vi.advanceTimersByTimeAsync(800)
    expect(useUpdateJob.getState().phase).toBe('failed')
    expect(updateRunning()).toBe(false)
  })
})
