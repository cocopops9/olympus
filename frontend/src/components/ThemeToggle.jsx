// Olympus: the light/dark switch beside the Settings button. One tap flips the theme the screen
// is showing now; with "System" chosen in Settings it flips away from the system's choice and
// stays fixed from then on (Settings -> Theme brings "System" back).
import { useStore } from '../store/useStore.js'
import { t } from '../lib/i18n.js'
import Icon from './Icon.jsx'

const shown = theme => (theme === 'light' || theme === 'dark'
  ? theme
  : (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'))

export default function ThemeToggle() {
  const theme = useStore(s => s.S.theme || 'dark')
  const update = useStore(s => s.update)
  const light = shown(theme) === 'light'
  const label = light ? t('Switch to dark mode') : t('Switch to light mode')
  return <button className="iconbtn" onClick={() => update(s => { s.theme = light ? 'dark' : 'light' })} aria-label={label} title={label}>
    <Icon name={light ? 'moon' : 'sun'} />
  </button>
}
