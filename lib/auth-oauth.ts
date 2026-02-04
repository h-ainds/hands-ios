import * as WebBrowser from 'expo-web-browser'
import { makeRedirectUri } from 'expo-auth-session'
import { supabase } from './supabase/client'
import { Platform } from 'react-native'

WebBrowser.maybeCompleteAuthSession()

export async function signInWithGoogle() {
  try {
    if (Platform.OS === 'web') {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin + '/auth-callback',
        },
      })
      
      if (error) throw error
      return { success: true }
    }

    const redirectUrl = makeRedirectUri({
      scheme: 'handsios',
      path: 'auth-callback',
    })

    console.log('OAuth Redirect URL:', redirectUrl)

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
        skipBrowserRedirect: true,
      },
    })

    if (error) throw error

    if (data?.url) {
      const result = await WebBrowser.openAuthSessionAsync(
        data.url,
        redirectUrl
      )
    
      

      if (result.type === 'success' && result.url) {
        const url = new URL(result.url)
        const access_token = url.searchParams.get('access_token')
        const refresh_token = url.searchParams.get('refresh_token')

        if (access_token && refresh_token) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          })
          
          if (sessionError) throw sessionError
          return { success: true }
        }
      }
      
      return { success: false, error: 'Authentication was cancelled' }
    }

    return { success: false, error: 'No authorization URL received' }
  } catch (error: any) {
    console.error('Google sign in error:', error)
    return { success: false, error: error.message || 'Failed to sign in with Google' }
  }
}

