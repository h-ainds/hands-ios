import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import Purchases, { CustomerInfo } from 'react-native-purchases'
import { useAuth } from './AuthContext'

const RC_API_KEY = 'appl_DLAJSWgBPoxVcwbMfSvcYIqTLgY'
const ENTITLEMENT_ID = 'Hands+'

interface SubscriptionContextType {
  isPro: boolean
  customerInfo: CustomerInfo | null
  refreshSubscription: () => Promise<void>
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined)

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null)
  const [available, setAvailable] = useState(true)

  // Configure RC once at mount — separate from user state
  useEffect(() => {
    try {
      Purchases.configure({ apiKey: RC_API_KEY })
    } catch (e) {
      console.warn('[Subscription] Configure failed:', e)
      setAvailable(false)
    }
  }, [])

  // Log in + subscribe to updates whenever the user changes
  useEffect(() => {
    if (!user || !available) return

    let isCancelled = false
    let listenerAttached = false

    const listener = (info: CustomerInfo) => {
      if (!isCancelled) setCustomerInfo(info)
    }

    const init = async () => {
      try {
        await Purchases.logIn(user.id)
        const info = await Purchases.getCustomerInfo()
        if (!isCancelled) setCustomerInfo(info)

        Purchases.addCustomerInfoUpdateListener(listener)
        listenerAttached = true
      } catch (error) {
        console.warn('[Subscription] RevenueCat unavailable:', error)
        if (!isCancelled) setAvailable(false)
      }
    }

    void init()

    return () => {
      isCancelled = true
      if (listenerAttached) Purchases.removeCustomerInfoUpdateListener(listener)
    }
  }, [user?.id, available])

  const isPro = Boolean(customerInfo?.entitlements.active[ENTITLEMENT_ID])

  const refreshSubscription = async () => {
    if (!available) return
    try {
      const info = await Purchases.getCustomerInfo()
      setCustomerInfo(info)
    } catch (e) {
      console.warn('[Subscription] Refresh unavailable:', e)
      setAvailable(false)
    }
  }

  return (
    <SubscriptionContext.Provider value={{ isPro, customerInfo, refreshSubscription }}>
      {children}
    </SubscriptionContext.Provider>
  )
}

export const useSubscription = () => {
  const context = useContext(SubscriptionContext)
  if (!context) throw new Error('useSubscription must be used within a SubscriptionProvider')
  return context
}
