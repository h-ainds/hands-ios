import { useState, useEffect, useCallback } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useAuth } from '@/context/AuthContext'

// Caps are switched off until subscriptions return — usage is still counted,
// but nothing is blocked. Flip LIMITS_ENABLED to re-arm them with these numbers.
const LIMITS_ENABLED = false
const MESSAGE_LIMIT = 100
const IMAGE_LIMIT = 25

interface DailyUsage {
  messageCount: number
  imageCount: number
}

export function useUsageTracking() {
  const { user } = useAuth()
  const [usage, setUsage] = useState<DailyUsage>({ messageCount: 0, imageCount: 0 })

  const storageKey = user ? `usage_${user.id}_${new Date().toDateString()}` : null

  useEffect(() => {
    if (!storageKey) return
    AsyncStorage.getItem(storageKey)
      .then((raw) => {
        if (raw) setUsage(JSON.parse(raw))
      })
      .catch(console.error)
  }, [storageKey])

  const persist = useCallback(
    async (next: DailyUsage) => {
      if (!storageKey) return
      setUsage(next)
      await AsyncStorage.setItem(storageKey, JSON.stringify(next))
    },
    [storageKey],
  )

  const incrementMessage = useCallback(async () => {
    await persist({ ...usage, messageCount: usage.messageCount + 1 })
  }, [usage, persist])

  const incrementImage = useCallback(async () => {
    await persist({ ...usage, imageCount: usage.imageCount + 1 })
  }, [usage, persist])

  const canSendMessage = !LIMITS_ENABLED || usage.messageCount < MESSAGE_LIMIT
  const canSendImage = !LIMITS_ENABLED || usage.imageCount < IMAGE_LIMIT

  const messagesRemaining = LIMITS_ENABLED ? Math.max(0, MESSAGE_LIMIT - usage.messageCount) : Infinity
  const imagesRemaining = LIMITS_ENABLED ? Math.max(0, IMAGE_LIMIT - usage.imageCount) : Infinity

  return {
    usage,
    canSendMessage,
    canSendImage,
    messagesRemaining,
    imagesRemaining,
    incrementMessage,
    incrementImage,
  }
}
