import { asyncStorage } from '@/lib/storage'

/**
 * Device-local "Preferences" switch on the Personalization screen. When on, streamv5 adds the
 * user's saved preferences to the model's instructions; when off, chat gets a standard,
 * unpersonalized reply. Off by default. Sent as `personalize` with every chat request.
 */
const STORAGE_KEY = 'personalization_preferences_enabled'

export async function getPreferencesEnabled(): Promise<boolean> {
  try {
    return (await asyncStorage.getItem(STORAGE_KEY)) === 'true'
  } catch {
    return false
  }
}

export async function setPreferencesEnabled(enabled: boolean): Promise<void> {
  await asyncStorage.setItem(STORAGE_KEY, String(enabled))
}
