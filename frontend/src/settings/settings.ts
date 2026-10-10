// Per-browser preferences (#78). Kept in localStorage: they're conveniences for this
// viewer, not data anyone else needs, and the app works the same when storage is blocked.
// To add a setting: a field here with its default, a control in a SettingsDialog section.

export type Theme = 'system' | 'light' | 'dark'

export interface Settings {
  theme: Theme
}

export const DEFAULT_SETTINGS: Settings = { theme: 'system' }

// index.html reads the theme from this key before the first paint; keep the two in sync.
export const SETTINGS_KEY = 'open-data-assistant:settings'

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    const stored = raw ? (JSON.parse(raw) as Partial<Settings>) : {}
    return {
      theme: ['light', 'dark'].includes(stored.theme ?? '')
        ? (stored.theme as Theme)
        : DEFAULT_SETTINGS.theme,
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // Storage blocked (private window, site data off): the setting lasts this visit only.
  }
}

const PREFERS_DARK = '(prefers-color-scheme: dark)'

/** Applies the theme to the page, and keeps following the system while it's "system".
 * Returns the cleanup that stops following it. */
export function applyTheme(theme: Theme): () => void {
  const system = window.matchMedia(PREFERS_DARK)
  const apply = () => {
    const dark = theme === 'dark' || (theme === 'system' && system.matches)
    document.documentElement.classList.toggle('dark', dark)
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
  }
  apply()
  if (theme !== 'system') return () => {}
  system.addEventListener('change', apply)
  return () => system.removeEventListener('change', apply)
}
