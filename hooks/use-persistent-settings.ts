'use client'

import { useState, useEffect, useCallback } from 'react'
import type { AiProvider } from '@/lib/crawler/types'

export interface PersistentSettings {
  location: string
  radiusKm: number
  aiProvider: AiProvider
  customSystemPrompt: string
  additionalKeywords: string[]
  exclusionTerms: string[]
  seniorityFilter: string
  languagePreference: string
}

const STORAGE_KEY = 'jobcrawler-settings'

const defaultSettings: PersistentSettings = {
  location: 'Amsterdam',
  radiusKm: 50,
  aiProvider: 'gemini-3-flash',
  customSystemPrompt: '',
  additionalKeywords: [],
  exclusionTerms: [],
  seniorityFilter: 'Any',
  languagePreference: 'Any',
}

const VALID_PROVIDERS = new Set(['gemini-3-pro', 'gemini-3-flash', 'grok'])

function loadSettings(): PersistentSettings {
  if (typeof window === 'undefined') return defaultSettings
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultSettings
    const parsed = JSON.parse(raw)
    // Migrate legacy 'groq' provider to 'gemini-3-flash'
    if (parsed.aiProvider && !VALID_PROVIDERS.has(parsed.aiProvider)) {
      parsed.aiProvider = defaultSettings.aiProvider
    }
    return { ...defaultSettings, ...parsed }
  } catch {
    return defaultSettings
  }
}

function saveSettings(settings: PersistentSettings): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // Storage may be full or blocked
  }
}

export function usePersistentSettings() {
  const [settings, setSettingsState] = useState<PersistentSettings>(defaultSettings)
  const [isHydrated, setIsHydrated] = useState(false)

  // Hydrate from localStorage on mount
  useEffect(() => {
    setSettingsState(loadSettings())
    setIsHydrated(true)
  }, [])

  const updateSettings = useCallback((patch: Partial<PersistentSettings>) => {
    setSettingsState((prev) => {
      const next = { ...prev, ...patch }
      saveSettings(next)
      return next
    })
  }, [])

  const resetSettings = useCallback(() => {
    setSettingsState(defaultSettings)
    saveSettings(defaultSettings)
  }, [])

  return {
    settings,
    updateSettings,
    resetSettings,
    isHydrated,
    defaultSettings,
  }
}
