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
