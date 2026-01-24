import { supabase } from "./supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Linking from "expo-linking";

// Get the redirect URL for deep linking
const getRedirectUrl = () => {
  return Linking.createURL("auth/callback");
};

export interface SignUpData {
  email: string;
  password: string;
  firstName: string;
  username: string;
}

export interface LoginData {
  email: string;
  password: string;
}

// Sign up new user
export async function signUp({ email, password, firstName, username }: SignUpData) {
  const redirectUrl = getRedirectUrl();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: redirectUrl,
    },
  });

  if (error) {
    if (error.message?.includes("already registered")) {
      throw new Error("An account with this email already exists.");
    }
    throw error;
  }

  // Store signup data to use after email verification
  if (data.user) {
    await AsyncStorage.setItem(
      `signup_data_${data.user.id}`,
      JSON.stringify({ firstName, username, email })
    );
  }

  return {
    user: data.user,
    session: data.session,
    needsEmailVerification: !data.session && !!data.user,
  };
}

// Sign in existing user
export async function signIn({ email, password }: LoginData) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) throw error;

  return {
    user: data.user,
    session: data.session,
  };
}

// Sign out user
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// Send password reset email
export async function resetPassword(email: string) {
  const redirectUrl = getRedirectUrl();

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: redirectUrl,
  });
  if (error) throw error;
}

// Get current user session
export async function getCurrentUser() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user || null;
}

// Get user profile from database
export async function getUserProfile(userId: string) {
  const { data, error } = await supabase
    .from("Users")
    .select("*")
    .eq("id", userId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null; // Not found
    throw error;
  }

  return data;
}

// Get user taste profile
export async function getUserTasteProfile(userId: string) {
  const { data, error } = await supabase
    .from("UserTasteProfiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }

  return data;
}

// Check if user needs onboarding
export async function checkOnboardingStatus(userId: string): Promise<{
  needsOnboarding: boolean;
  hasFirstName: boolean;
  hasTastePreference: boolean;
}> {
  try {
    const profile = await getUserProfile(userId);
    const tasteProfile = await getUserTasteProfile(userId);

    if (!profile) {
      return {
        needsOnboarding: true,
        hasFirstName: false,
        hasTastePreference: false,
      };
    }

    const hasFirstName = Boolean(profile.first_name?.trim());
    const hasTastePreference = Boolean(tasteProfile);

    return {
      needsOnboarding: !hasFirstName || !hasTastePreference,
      hasFirstName,
      hasTastePreference,
    };
  } catch {
    return {
      needsOnboarding: true,
      hasFirstName: false,
      hasTastePreference: false,
    };
  }
}

// Create user profile
export async function createUserProfile({
  userId,
  firstName,
  username,
  email,
}: {
  userId: string;
  firstName: string;
  username?: string;
  email: string;
}) {
  const { data, error } = await supabase
    .from("Users")
    .insert({
      id: userId,
      first_name: firstName,
      username: username || null,
      email,
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    // If profile exists, update instead
    if (error.code === "23505") {
      return await updateUserProfile(userId, {
        first_name: firstName,
        username: username || null,
      });
    }
    throw error;
  }

  return data;
}

// Update user profile
export async function updateUserProfile(
  userId: string,
  updates: { first_name?: string; username?: string | null; taste_preference?: string }
) {
  const { data, error } = await supabase
    .from("Users")
    .update(updates)
    .eq("id", userId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Create taste profile
export async function createTasteProfile(
  userId: string,
  tasteText: string,
  vectors: any
) {
  const { data, error } = await supabase
    .from("UserTasteProfiles")
    .insert({
      id: userId,
      taste_text: tasteText,
      vectors: vectors,
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Get and clear stored signup data
export async function getAndClearSignupData(
  userId: string
): Promise<{ firstName: string; username: string; email: string } | null> {
  const key = `signup_data_${userId}`;

  try {
    const dataStr = await AsyncStorage.getItem(key);
    if (!dataStr) return null;

    const data = JSON.parse(dataStr);
    await AsyncStorage.removeItem(key);
    return data;
  } catch {
    await AsyncStorage.removeItem(key);
    return null;
  }
}

// Resend verification email
export async function resendVerificationEmail(email: string) {
  const redirectUrl = getRedirectUrl();

  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: {
      emailRedirectTo: redirectUrl,
    },
  });

  if (error) throw error;
  return { success: true };
}
