// Olympus: the app update, downloading in the background.
//
// The download is Android's (DownloadManager, through the native Install plugin), not the app's:
// it goes on while the person trains, switches app or locks the screen, and even when the app is
// closed. The app shows how far it got in a thin bar with a Cancel button (UpdateBar.jsx), and
// when the file is complete it checks the release's SHA-256 and opens the installer. If the app
// was closed in between, the job is found again at the next start (resumeUpdate) and picks up
// where the download is.
import { create } from 'zustand'
import { t } from './i18n.js'
import { withTimeout } from './update.js'

const FILE = 'olympus-update.apk'
const KEY = 'olympus.updateJob'
const POLL_MS = 700

/**
 * phase: 'idle' | 'downloading' | 'verifying' | 'failed'
 * pct: 0..100 or null when the size is not known yet
 */
export const useUpdateJob = create(() => ({ phase: 'idle', pct: null, error: null, build: null }))

let plugin = null
async function Install() {
  if (!plugin) {
    const { registerPlugin } = await import('@capacitor/core')
    plugin = registerPlugin('Install')
  }
  return plugin
}
/** For the tests: a stand-in for the native plugin. */
export function setInstallPlugin(p) { plugin = p }

const saved = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null') } catch { return null } }
const save = job => { try { job ? localStorage.setItem(KEY, JSON.stringify(job)) : localStorage.removeItem(KEY) } catch { /* private mode */ } }

let timer = null
let job = null   // { id, hash, build }

function stopPolling() { clearInterval(timer); timer = null }

async function finish() {
  stopPolling()
  const current = job
  useUpdateJob.setState({ phase: 'verifying', pct: 100 })
  try {
    // The installer can only open while the app is in front: a download that ends with the screen
    // locked waits for the person to come back.
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      await new Promise(resolve => {
        const on = () => { if (document.visibilityState !== 'hidden') { document.removeEventListener('visibilitychange', on); resolve() } }
        document.addEventListener('visibilitychange', on)
      })
    }
    if (job !== current) return
    await (await Install()).installApk({ fileName: FILE, place: 'downloads', sha256: current.hash })
    job = null
    save(null)
    useUpdateJob.setState({ phase: 'idle', pct: null, error: null, build: null })
  } catch (e) {
    job = null
    save(null)
    useUpdateJob.setState({ phase: 'failed', error: e?.message || String(e) })
  }
}

async function poll() {
  if (!job) return stopPolling()
  let s
  try { s = await (await Install()).downloadStatus({ id: job.id }) } catch { return }
  if (!job) return
  if (s.status === 'done') return finish()
  if (s.status === 'failed' || s.status === 'missing') {
    stopPolling()
    job = null
    save(null)
    useUpdateJob.setState({ phase: s.status === 'missing' ? 'idle' : 'failed', pct: null, error: s.status === 'failed' ? t('Download failed') : null })
    return
  }
  const pct = s.total > 0 ? Math.min(99, Math.floor(s.bytes / s.total * 100)) : null
  if (useUpdateJob.getState().pct !== pct) useUpdateJob.setState({ pct })
}

function follow() {
  stopPolling()
  timer = setInterval(poll, POLL_MS)
  poll()
}

/** Starts the download of `apkUrl`, to be checked against `hash` (64 hex characters). */
export async function startUpdate({ apkUrl, hash, build = null }) {
  if (!/^[0-9a-f]{64}$/i.test(hash || '')) throw new Error(t('Checksum not available, so not installing'))
  if (job) return
  // Android's download manager answers at once; if it does not (some phones have it disabled or
  // stuck), the caller is told instead of waiting for ever.
  const { id } = await withTimeout((async () => (await Install()).startDownload({ url: apkUrl, fileName: FILE, title: 'Olympus', description: t('Downloading update') }))(), 12000, t('Download failed'))
  job = { id, hash: hash.toLowerCase(), build }
  save(job)
  useUpdateJob.setState({ phase: 'downloading', pct: null, error: null, build })
  follow()
}

/** Stops the download and throws away what came down. */
export async function cancelUpdate() {
  const current = job
  job = null
  save(null)
  stopPolling()
  useUpdateJob.setState({ phase: 'idle', pct: null, error: null, build: null })
  if (current) { try { await (await Install()).cancelDownload({ id: current.id }) } catch { /* already gone */ } }
}

/** Hides a failure message. */
export const dismissUpdate = () => useUpdateJob.setState({ phase: 'idle', error: null, pct: null })

/** At the app's start: a download begun before it was closed is followed again. */
export function resumeUpdate() {
  const old = saved()
  if (!old?.id || job) return false
  job = old
  useUpdateJob.setState({ phase: 'downloading', pct: null, error: null, build: old.build ?? null })
  follow()
  return true
}

export const updateRunning = () => !!job
