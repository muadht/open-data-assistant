import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { SettingsContext } from './context'
import {
  applyTheme,
  loadSettings,
  saveSettings,
  type Settings,
} from './settings'

/** Holds the settings, saves them as they change, and applies the theme. */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState(loadSettings)

  const update = useCallback((changes: Partial<Settings>) => {
    setSettings((current) => {
      const next = { ...current, ...changes }
      saveSettings(next)
      return next
    })
  }, [])

  useEffect(() => applyTheme(settings.theme), [settings.theme])

  const value = useMemo(() => ({ settings, update }), [settings, update])
  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  )
}
