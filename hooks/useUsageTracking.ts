import { useState, useEffect, useCallback } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useAuth } from '@/context/AuthContext'
import { useSubscription } from '@/context/SubscriptionContext'

const FREE_MESSAGE_LIMIT = 15
const FREE_IMAGE_LIMIT = 1
const PRO_IMAGE_LIMIT = 3

interface DailyUsage {
  messageCount: number
  imageCount: number
}

export function useUsageTracking() {
  const { user } = useAuth()
  const { isPro } = useSubscription()
  const [usage, setUsage] = useState<DailyUsage>({ messageCount: 0, imageCount: 0 })

  const storageKey = user ? `usage_${user.id}_${new Date().toDateString()}` : null

  useEffect(() => {
    if (!storageKey) return
    AsyncStorage.getItem(storageKey)
      .then((raw) => { if (raw) setUsage(JSON.parse(raw)) })
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

  const canSendMessage = isPro || usage.messageCount < FREE_MESSAGE_LIMIT
  const canSendImage = isPro ? usage.imageCount < PRO_IMAGE_LIMIT : usage.imageCount < FREE_IMAGE_LIMIT

  const messagesRemaining = isPro ? Infinity : Math.max(0, FREE_MESSAGE_LIMIT - usage.messageCount)
  const imagesRemaining = isPro
    ? Math.max(0, PRO_IMAGE_LIMIT - usage.imageCount)
    : Math.max(0, FREE_IMAGE_LIMIT - usage.imageCount)

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
