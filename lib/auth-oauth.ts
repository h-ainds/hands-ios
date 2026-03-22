// lib/auth-oauth.ts
import * as WebBrowser from 'expo-web-browser'
import { Platform } from 'react-native'
import { supabase } from './supabase/client'
import { getAuthCallbackRedirectUrl } from './auth-redirect'

WebBrowser.maybeCompleteAuthSession()

type OAuthResult = { success: true } | { success: false; error: string }

function getOAuthParams(callbackUrl: string) {
  const u = new URL(callbackUrl)

  // Query params: handsios://auth-callback?code=...
  const query = u.searchParams

  // Fragment params: handsios://auth-callback#access_token=...&refresh_token=...
  const hash = u.hash?.startsWith('#') ? u.hash.slice(1) : ''
  const fragment = new URLSearchParams(hash)

  return {
    code: query.get('code') || fragment.get('code'),
    access_token: query.get('access_token') || fragment.get('access_token'),
    refresh_token: query.get('refresh_token') || fragment.get('refresh_token'),
    error: query.get('error') || fragment.get('error'),
    error_description:
      query.get('error_description') || fragment.get('error_description'),
  }
}

function getRedirectUrl() {
  // Native: Linking.createURL → exp://... in Expo Go, handsios:// in dev/prod builds
  return getAuthCallbackRedirectUrl()
}

async function completeOAuthResult(result: WebBrowser.WebBrowserAuthSessionResult): Promise<OAuthResult> {
  if (result.type !== 'success' || !('url' in result) || !result.url) {
    if (result.type === 'cancel') return { success: false, error: 'Authentication was cancelled' }
    return { success: false, error: `Unexpected auth result: ${result.type}` }
  }

  const { code, access_token, refresh_token, error, error_description } =
    getOAuthParams(result.url)

  if (error) {
    return { success: false, error: error_description || error }
  }

  // Helpful diagnostics
  console.log('OAuth callback received params:', {
    hasCode: !!code,
    hasAccessToken: !!access_token,
    hasRefreshToken: !!refresh_token,
  })

  // Preferred: PKCE code exchange (when code is present)
  if (code) {
    console.log('Exchanging code for session (PKCE)...')
    const { data: sessionData, error: exchangeError } =
      await supabase.auth.exchangeCodeForSession(code)

    if (exchangeError) {
      console.error('Code exchange error:', exchangeError)
      return { success: false, error: exchangeError.message }
    }

    if (sessionData?.session) return { success: true }
    return { success: false, error: 'No session returned from code exchange' }
  }

  // Fallback: direct token flow (implicit-style redirect)
  if (access_token && refresh_token) {
    console.log('Setting session from tokens...')
    const { error: sessionError } = await supabase.auth.setSession({
      access_token,
      refresh_token,
    })

    if (sessionError) {
      console.error('Set session error:', sessionError)
      return { success: false, error: sessionError.message }
    }

    return { success: true }
  }

  console.error('OAuth callback URL missing code/tokens:', result.url)
  return { success: false, error: 'OAuth callback missing authentication data' }
}

export async function signInWithGoogle(): Promise<OAuthResult> {
  try {
    const redirectUrl = getRedirectUrl()
    console.log('Google OAuth Redirect URL:', redirectUrl)
    if (__DEV__) {
      console.warn(
        '[Hands Auth] This URL must be allowlisted in Supabase (Auth → URL Configuration → Redirect URLs).\n' +
          'If login opens your website (e.g. app.handsforu) instead of the app, add: exp://** and handsios://**\n' +
          `Redirect: ${redirectUrl}\n` +
          'See docs/SUPABASE_AUTH_REDIRECTS.md'
      )
    }

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
        // Force Google account chooser to prevent auto-login to deleted accounts
        queryParams: {
          prompt: 'select_account',
        },
        // For native, we want to manually open the browser session
        ...(Platform.OS !== 'web' ? { skipBrowserRedirect: true } : {}),
      },
    })

    if (error) throw error

    // Web: Supabase will redirect the browser automatically (skipBrowserRedirect not used)
    if (Platform.OS === 'web') {
      return { success: true }
    }

    if (!data?.url) {
      return { success: false, error: 'No authorization URL received' }
    }

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl)
    console.log('Google OAuth Result Type:', result.type)
    if (result.type === 'success' && 'url' in result) {
      console.log('Google OAuth Result URL:', result.url)
    }

    return await completeOAuthResult(result)
  } catch (err: any) {
    console.error('Google sign in error:', err)
    return { success: false, error: err?.message || 'Failed to sign in with Google' }
  }
}

export async function signInWithApple(): Promise<OAuthResult> {
  try {
    const redirectUrl = getRedirectUrl()
    console.log('Apple OAuth Redirect URL:', redirectUrl)
    if (__DEV__) {
      console.warn(
        '[Hands Auth] Allowlist this redirect in Supabase or add wildcards exp://** and handsios://**\n' +
          `Redirect: ${redirectUrl}`
      )
    }

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: {
        redirectTo: redirectUrl,
        ...(Platform.OS !== 'web' ? { skipBrowserRedirect: true } : {}),
      },
    })

    if (error) throw error

    if (Platform.OS === 'web') {
      return { success: true }
    }

    if (!data?.url) {
      return { success: false, error: 'No authorization URL received' }
    }

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl)
    console.log('Apple OAuth Result Type:', result.type)
    if (result.type === 'success' && 'url' in result) {
      console.log('Apple OAuth Result URL:', result.url)
    }

    return await completeOAuthResult(result)
  } catch (err: any) {
    console.error('Apple sign in error:', err)
    return { success: false, error: err?.message || 'Failed to sign in with Apple' }
  }
}
