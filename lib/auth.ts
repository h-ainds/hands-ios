import { supabase } from '@/lib/supabase/client'
import { asyncStorage } from '@/lib/storage'

export interface AuthError extends Error {
  message: string
}

export interface SignUpData {
  email: string
  password: string
  firstName: string
  username: string
}

export interface LoginData {
  email: string
  password: string
}

export interface ResendEmailResult {
  success: boolean
  error?: string
  canResend: boolean
  nextResendTime?: Date
}

// Sign up new user with email verification
// EMAIL VERIFICATION DISABLED: To re-enable email verification:
// 1. Uncomment the emailRedirectTo option below
// 2. Go to Supabase Dashboard > Authentication > Settings
// 3. Enable "Confirm email" under Email Auth settings
// 4. Uncomment the verification step in app/signup.tsx (line 129-138)
export async function signUp({ email, password, firstName, username }: SignUpData) {
  try {
    console.log('[Auth] Calling supabase.auth.signUp (email verification disabled)')

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
      emailRedirectTo: 'handsios://auth-callback' // Uncomment to enable email verification
      }
    })

    // Log the full response for debugging
    console.log('[Auth] SignUp response:', {
      hasData: !!data,
      hasUser: !!data?.user,
      hasSession: !!data?.session,
      userId: data?.user?.id,
      userEmail: data?.user?.email,
      emailConfirmedAt: data?.user?.email_confirmed_at,
      error: error ? { message: error.message, status: error.status, code: error.code } : null,
    })

    if (error) {
      console.error('[Auth] SignUp error from Supabase:', {
        message: error.message,
        status: error.status,
        code: error.code,
        name: error.name,
      })
      if (error.message?.includes('already registered') || error.message?.includes('already exists')) {
        throw new Error('An account with this email already exists. Please try signing in instead.')
      }
      throw error
    }

    if (!data.user && !data.session) {
      console.warn('[Auth] No user or session returned - likely existing account')
      throw new Error('An account with this email already exists. Please try signing in instead.')
    }

    // Store signup data in AsyncStorage for use after email verification
    if (data.user) {
      console.log('[Auth] Storing signup data for user:', data.user.id)
      await asyncStorage.setItem(`signup_data_${data.user.id}`, JSON.stringify({
        firstName,
        username,
        email
      }))
    }

    return {
      user: data.user,
      session: data.session,
      needsEmailVerification: !data.session && data.user,
      signupData: { firstName, username, email }
    }
  } catch (error: any) {
    console.error('[Auth] SignUp caught error:', {
      message: error.message,
      status: error.status,
      code: error.code,
      stack: error.stack,
    })
    throw new Error(error.message || 'Failed to create account')
  }
}

// Sign in existing user
export async function signIn({ email, password }: LoginData) {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) throw error

    return {
      user: data.user,
      session: data.session
    }
  } catch (error) {
    throw new Error((error as AuthError).message || 'Failed to sign in')
  }
}

// Sign out user
export async function signOut() {
  try {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  } catch (error) {
    throw new Error((error as AuthError).message || 'Failed to sign out')
  }
}

// Send password reset email
export async function resetPassword(email: string) {
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'handsios://auth-callback?type=recovery'
    })

    if (error) throw error
  } catch (error) {
    throw new Error((error as AuthError).message || 'Failed to send reset email')
  }
}

// Resend verification email with rate limiting
export async function resendVerificationEmail(email: string): Promise<ResendEmailResult> {
  const RESEND_COOLDOWN = 60000
  const STORAGE_KEY = `email_resend_${email}`

  try {
    // Check rate limiting
    const lastSentStr = await asyncStorage.getItem(STORAGE_KEY)
    if (lastSentStr) {
      const lastSent = new Date(lastSentStr)
      const now = new Date()
      const timeDiff = now.getTime() - lastSent.getTime()

      if (timeDiff < RESEND_COOLDOWN) {
        const nextResendTime = new Date(lastSent.getTime() + RESEND_COOLDOWN)
        return {
          success: false,
          error: `Please wait ${Math.ceil((RESEND_COOLDOWN - timeDiff) / 1000)} seconds before requesting another email`,
          canResend: false,
          nextResendTime
        }
      }
    }

    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: {
        emailRedirectTo: 'handsios://auth-callback'
      }
    })

    if (error) throw error

    // Update rate limiting timestamp
    await asyncStorage.setItem(STORAGE_KEY, new Date().toISOString())

    return { success: true, canResend: true }
  } catch (error) {
    return {
      success: false,
      error: (error as AuthError).message || 'Failed to resend verification email',
      canResend: true
    }
  }
}

// Get current user session
export async function getCurrentUser() {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.user || null
  } catch (error) {
    console.error('Error getting current user:', error)
    return null
  }
}

// Get user profile from database
export async function getUserProfile(userId: string) {
  try {
    const { data, error } = await supabase
      .from('Users')
      .select('*')
      .eq('id', userId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      throw error
    }

    return data
  } catch (error) {
    console.error('Error fetching user profile:', error)
    return null
  }
}

// Check if user needs onboarding
export async function checkOnboardingStatus(userId: string): Promise<{
  needsOnboarding: boolean
  hasFirstName: boolean
  hasTastePreference: boolean
}> {
  try {
    const profile = await getUserProfile(userId)

    if (!profile) {
      return { needsOnboarding: true, hasFirstName: false, hasTastePreference: false }
    }

    const hasFirstName = Boolean(profile.first_name?.trim())

    return {
      needsOnboarding: !hasFirstName,
      hasFirstName,
      hasTastePreference: false
    }
  } catch (error) {
    return { needsOnboarding: true, hasFirstName: false, hasTastePreference: false }
  }
}

// Get stored signup data and clear it
export async function getAndClearSignupData(userId: string): Promise<{ firstName: string; username: string; email: string } | null> {
  const STORAGE_KEY = `signup_data_${userId}`

  try {
    const dataStr = await asyncStorage.getItem(STORAGE_KEY)

    if (!dataStr) {
      return null
    }

    const data = JSON.parse(dataStr)

    if (!data || typeof data !== 'object') {
      await asyncStorage.removeItem(STORAGE_KEY)
      return null
    }

    await asyncStorage.removeItem(STORAGE_KEY)
    return data
  } catch (error) {
    await asyncStorage.removeItem(STORAGE_KEY)
    return null
  }
}

// Calculate remaining time for resend cooldown
export async function getResendCooldownTime(email: string): Promise<{ canResend: boolean; remainingSeconds: number }> {
  const RESEND_COOLDOWN = 60000
  const STORAGE_KEY = `email_resend_${email}`

  const lastSentStr = await asyncStorage.getItem(STORAGE_KEY)
  if (!lastSentStr) {
    return { canResend: true, remainingSeconds: 0 }
  }

  const lastSent = new Date(lastSentStr)
  const now = new Date()
  const timeDiff = now.getTime() - lastSent.getTime()

  if (timeDiff >= RESEND_COOLDOWN) {
    return { canResend: true, remainingSeconds: 0 }
  }

  const remainingSeconds = Math.ceil((RESEND_COOLDOWN - timeDiff) / 1000)
  return { canResend: false, remainingSeconds }
}

// Create or update user profile
export async function createUserProfile({
  userId,
  firstName,
  username,
  email,
}: {
  userId: string
  firstName: string
  username: string
  email: string
}) {
  try {
    const { data, error } = await supabase
      .from('Users')
      .upsert({
        id: userId,
        first_name: firstName,
        username: username,
        email: email,
        created_at: new Date().toISOString(),
      })
      .select()

    if (error) throw error

    return data
  } catch (error) {
    console.error('Error creating user profile:', error)
    throw new Error((error as AuthError).message || 'Failed to create user profile')
  }
}

// Create taste profile with vectors
export async function createTasteProfile(userId: string, tasteText: string, vectors: any) {
  try {
    // Store taste profile in UserTasteProfiles table
    // taste_id (uuid) is auto-generated by the database as the primary key
    const { data, error } = await supabase
      .from('UserTasteProfiles')
      .upsert({
        id: userId,           // User ID (foreign key to Users table)
        taste_text: tasteText, // User's taste preference text
        vectors: vectors,
        created_at: new Date().toISOString()     // Taste vectors in JSON format
      })
      .select()

    if (error) throw error

    return data
  } catch (error) {
    console.error('Error creating taste profile:', error)
    throw new Error((error as AuthError).message || 'Failed to create taste profile')
  }
}
