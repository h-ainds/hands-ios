import "./global.css"
import { useEffect } from 'react'
import { Stack, useRouter, useSegments } from 'expo-router'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import { View, ActivityIndicator } from 'react-native'

// Routes that don't require authentication
const PUBLIC_ROUTES = ['launch', 'login', 'signup', 'verify-email', 'forgot-password', 'update-password', 'auth-callback']

function RootLayoutNav() {
  const { session, loading } = useAuth()
  const segments = useSegments()
  const router = useRouter()

  useEffect(() => {
    if (loading) return

    const currentRoute = segments[0] as string | undefined

    // Check if user is on a public route
    const isPublicRoute = PUBLIC_ROUTES.includes(currentRoute || '') || currentRoute === '(auth)'

    if (!session && !isPublicRoute) {
      // No session and trying to access protected route - redirect to login
      router.replace('/launch')
    } else if (session && isPublicRoute && currentRoute !== 'auth-callback' && currentRoute !== 'signup' && currentRoute !== 'verify-email') {
      // Has session but on auth route - redirect to home (signup/verify-email send to onboarding themselves)
      router.replace('/(tabs)/home')
    }
  }, [session, loading, segments])

  // Show loading spinner while checking auth state
  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#6CD401" />
      </View>
    )
  }

  return (
    <Stack>
      <Stack.Screen name="launch" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="signup" options={{ headerShown: false }} />
      <Stack.Screen name="forgot-password" options={{ headerShown: false }} />
      <Stack.Screen name="update-password" options={{ headerShown: false }} />
      <Stack.Screen name="recipe/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="ask" options={{ headerShown: false }} />
      <Stack.Screen name="auth-callback" options={{ headerShown: false }} />
      <Stack.Screen name="search" options={{ headerShown: false }} />
      <Stack.Screen name="verify-email" options={{ headerShown: false }} />
      <Stack.Screen name="onboarding-profile" options={{ headerShown: false }} />
    </Stack>
  )
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootLayoutNav />
    </AuthProvider>
  )
}
