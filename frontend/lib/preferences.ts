/**
 * The viewer's app preferences, kept in this browser's localStorage under
 * `userPreferences` — the dashboard and the transactions page read the
 * currency from there. Only the weekly report setting lives on the server.
 */
export type LanguagePreference = 'system' | 'en' | 'zh'

export interface UserPreferences {
  currency: string
  language: LanguagePreference
}

const KEY = 'userPreferences'
const DEFAULTS: UserPreferences = { currency: 'CAD', language: 'system' }

export function readPreferences(): UserPreferences {
  if (typeof window === 'undefined') return DEFAULTS
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}')
    return {
      currency: typeof saved.currency === 'string' ? saved.currency : DEFAULTS.currency,
      // Older versions stored 'System'; anything unrecognised means system.
      language: saved.language === 'en' || saved.language === 'zh' ? saved.language : 'system',
    }
  } catch {
    return DEFAULTS
  }
}

export function savePreferences(changes: Partial<UserPreferences>): UserPreferences {
  const next = { ...readPreferences(), ...changes }
  localStorage.setItem(KEY, JSON.stringify(next))
  return next
}

/** The locale to show: the saved choice, or the device's language for 'system'. */
export function resolveLanguage(language: LanguagePreference): 'en' | 'zh' {
  if (language !== 'system') return language
  return typeof navigator !== 'undefined' && navigator.language.startsWith('zh') ? 'zh' : 'en'
}
