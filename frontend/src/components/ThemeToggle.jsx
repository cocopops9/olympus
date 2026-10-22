import { useStore } from '../store/useStore.js'
import { t } from '../lib/i18n.js'
import Icon from './Icon.jsx'

// One-tap light/dark switch for the page headers, next to the gear. It flips whatever theme is
// showing right now, so a "System" choice that currently resolves to dark goes to light. The
// choice is stored as a fixed 'light' or 'dark'; "System" stays available in Settings → Look.
export default function ThemeToggle() {
  const update = useStore(s => s.update)
  const theme = useStore(s => s.S.theme)
  // Same resolution as App.jsx: a fixed choice wins, "system" follows the OS preference.
  const showing = theme === 'light' || theme === 'dark'
    ? theme
    : (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  const next = showing === 'light' ? 'dark' : 'light'
  return <button
    className="iconbtn"
    onClick={() => update(s => { s.theme = next })}
    aria-label={t('Theme') + ', ' + (next === 'light' ? t('Light') : t('Dark'))}
  >
    <Icon name={showing === 'light' ? 'moon' : 'sun'} />
  </button>
}
