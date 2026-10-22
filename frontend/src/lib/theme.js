// The theme the page is drawn in. Settings stores a choice ('dark', 'light' or 'system'); the page
// itself only ever has the two it resolved to (index.css [data-theme]).

/** Whether the OS/browser asks for a dark page right now. */
export const prefersDark = () => !!window.matchMedia?.('(prefers-color-scheme: dark)').matches

/**
 * The theme to draw for a stored choice: 'light' and 'dark' as they are, anything else (including
 * 'system' and a value a newer app wrote) follows the OS/browser preference. `prefersDark` is
 * passed in so this stays pure, App.jsx reads it from matchMedia.
 */
export const resolveTheme = (theme, prefersDark) =>
  theme === 'light' || theme === 'dark' ? theme : (prefersDark ? 'dark' : 'light')

/**
 * The choice the quick toggle next to Settings stores: the opposite of what is on screen now.
 * It always lands on an explicit 'light' or 'dark', so tapping it from 'system' leaves 'system'
 * (the full Dark / Light / System choice stays in Settings, Look).
 */
export const toggledTheme = (theme, prefersDark) =>
  resolveTheme(theme, prefersDark) === 'dark' ? 'light' : 'dark'
