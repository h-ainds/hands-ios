import { makeRedirectUri } from 'expo-auth-session'
import { Platform } from 'react-native'

/**
 * Optional: full redirect URL you’ve allowlisted in Supabase (e.g. stable tunnel URL).
 * Query params (OAuth / recovery) are appended. Usually leave unset and use wildcards
 * in Supabase instead: `exp://**` and `handsios://**` (see docs/SUPABASE_AUTH_REDIRECTS.md).
 */
const REDIRECT_OVERRIDE = process.env.EXPO_PUBLIC_SUPABASE_REDIRECT_URL?.trim()

/**
 * Optional HTTPS URL used only for signup / resend confirmation emails.
 * Some inboxes handle `exp://` / custom-scheme links poorly; a hosted page (e.g. your Site URL
 * + path) that redirects into the app can improve deliverability. Must be allowlisted in Supabase.
 * If unset, uses the same deep link as OAuth (`getAuthCallbackRedirectUrl`).
 */
const EMAIL_CONFIRM_HTTPS = process.env.EXPO_PUBLIC_EMAIL_CONFIRMATION_REDIRECT_URL?.trim()

/**
 * Auth callback redirect URIs for Supabase OAuth, magic links, and password reset.
 *
 * IMPORTANT (Expo Go): Uses `makeRedirectUri` → `exp://...` in Expo Go. Do not hardcode
 * `handsios://` for OAuth in Expo Go; that scheme opens the installed store/TestFlight app.
 *
 * If OAuth lands on your **production website** after login, Supabase rejected `redirectTo`
 * (not in Redirect URLs) and used **Site URL** instead — add `exp://**` in the dashboard.
 */
export function getAuthCallbackRedirectUrl(
  queryParams?: Record<string, string>
): string {
  if (Platform.OS === 'web') {
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    const q =
      queryParams && Object.keys(queryParams).length > 0
        ? `?${new URLSearchParams(queryParams).toString()}`
        : ''
    return `${origin}/auth-callback${q}`
  }

  if (REDIRECT_OVERRIDE) {
    let url = REDIRECT_OVERRIDE
    if (queryParams && Object.keys(queryParams).length > 0) {
      const qs = new URLSearchParams(queryParams).toString()
      url += url.includes('?') ? `&${qs}` : `?${qs}`
    }
    return url
  }

  return makeRedirectUri({
    path: 'auth-callback',
    ...(queryParams && Object.keys(queryParams).length > 0
      ? { queryParams }
      : {}),
  })
}

/** Use for `emailRedirectTo` on signUp / resend only (not OAuth `redirectTo`). */
export function getEmailConfirmationRedirectUrl(): string {
  if (EMAIL_CONFIRM_HTTPS) {
    return EMAIL_CONFIRM_HTTPS
  }
  return getAuthCallbackRedirectUrl()
}
