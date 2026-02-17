import * as SecureStore from 'expo-secure-store'
import AsyncStorage from '@react-native-async-storage/async-storage'

// For sensitive data (tokens, credentials)
export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    return SecureStore.getItemAsync(key)
  },
  async setItem(key: string, value: string): Promise<void> {
    await SecureStore.setItemAsync(key, value)
  },
  async removeItem(key: string): Promise<void> {
    await SecureStore.deleteItemAsync(key)
  },
}

// For non-sensitive data (signup temp data, resend cooldowns, preferences)
export const asyncStorage = {
  async getItem(key: string): Promise<string | null> {
    return AsyncStorage.getItem(key)
  },
  async setItem(key: string, value: string): Promise<void> {
    await AsyncStorage.setItem(key, value)
  },
  async removeItem(key: string): Promise<void> {
    await AsyncStorage.removeItem(key)
  },
}

/**
 * Clear all user-related data from local storage
 * Called after account deletion to ensure clean state
 */
export async function clearAllUserData(): Promise<void> {
  try {
    // Clear all AsyncStorage keys (user preferences, temp data, etc.)
    // Note: This clears ALL AsyncStorage - if you have non-user data,
    // you may want to be more selective
    await AsyncStorage.clear()
    
    // Clear SecureStore (auth tokens are managed by Supabase client,
    // but clear any custom secure data if needed)
    // Note: Supabase client handles its own token cleanup on signOut
    
    console.log('[Storage] Cleared all user data from local storage')
  } catch (error) {
    console.error('[Storage] Error clearing user data:', error)
    // Don't throw - clearing storage is best-effort
  }
}
