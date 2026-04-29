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

  useEffect(() => {
    if (!user) return

    if (!configured) {
      Purchases.setLogLevel(LOG_LEVEL.DEBUG)
      Purchases.configure({ apiKey: RC_API_KEY })
      setConfigured(true)
    }

    Purchases.logIn(user.id)
    Purchases.getCustomerInfo().then(setCustomerInfo).catch(console.error)

    const listener = (info: CustomerInfo) => setCustomerInfo(info)
    Purchases.addCustomerInfoUpdateListener(listener)
    return () => { Purchases.removeCustomerInfoUpdateListener(listener) }
  }, [user?.id])

  const isPro = Boolean(customerInfo?.entitlements.active[ENTITLEMENT_ID])

  const refreshSubscription = async () => {
    try {
      const info = await Purchases.getCustomerInfo()
      setCustomerInfo(info)
    } catch (e) {
      console.error('[Subscription] refresh error:', e)
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
