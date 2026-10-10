import { createContext, useContext } from 'react'
import { DEFAULT_SETTINGS, type Settings } from './settings'

export interface SettingsContextValue {
  settings: Settings
  update: (changes: Partial<Settings>) => void
}

export const SettingsContext = createContext<SettingsContextValue>({
  settings: DEFAULT_SETTINGS,
  update: () => {},
})

export function useSettings(): SettingsContextValue {
  return useContext(SettingsContext)
}
