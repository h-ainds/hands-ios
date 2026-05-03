import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import Purchases, { CustomerInfo, LOG_LEVEL } from 'react-native-purchases'
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
  const [configured, setConfigured] = useState(false)
  const [available, setAvailable] = useState(true)

  useEffect(() => {
    if (!user || !available) return

    let isCancelled = false
    let listenerAttached = false
    const listener = (info: CustomerInfo) => {
      if (!isCancelled) setCustomerInfo(info)
    }

    const init = async () => {
      try {
        if (!configured) {
          Purchases.setLogLevel(LOG_LEVEL.DEBUG)
          Purchases.configure({ apiKey: RC_API_KEY })
          if (!isCancelled) setConfigured(true)
        }

        await Purchases.logIn(user.id)
        const info = await Purchases.getCustomerInfo()
        if (!isCancelled) setCustomerInfo(info)

        Purchases.addCustomerInfoUpdateListener(listener)
        listenerAttached = true
      } catch (error) {
        console.warn('[Subscription] RevenueCat unavailable in this runtime:', error)
        if (!isCancelled) setAvailable(false)
      }
    }

    void init()
    return () => {
      isCancelled = true
      if (listenerAttached) {
        Purchases.removeCustomerInfoUpdateListener(listener)
      }
    }
  }, [user?.id, configured, available])

  const isPro = Boolean(customerInfo?.entitlements.active[ENTITLEMENT_ID])

  const refreshSubscription = async () => {
    if (!available) return
    try {
      const info = await Purchases.getCustomerInfo()
      setCustomerInfo(info)
    } catch (e) {
      setAvailable(false)
      console.warn('[Subscription] refresh unavailable:', e)
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
