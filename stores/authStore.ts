import { create } from "zustand";
import { supabase } from "@/lib/supabase";
import {
  signIn as authSignIn,
  signOut as authSignOut,
  signUp as authSignUp,
  checkOnboardingStatus as checkOnboarding,
  createUserProfile,
  createTasteProfile,
  getAndClearSignupData,
} from "@/lib/auth";
import type { User, Session } from "@supabase/supabase-js";

interface AuthState {
  user: User | null;
  session: Session | null;
  initialized: boolean;
  loading: boolean;

  // Actions
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (data: {
    email: string;
    password: string;
    firstName: string;
    username: string;
  }) => Promise<{ needsEmailVerification: boolean }>;
  signOut: () => Promise<void>;
  checkOnboardingStatus: () => Promise<{ needsOnboarding: boolean }>;
  completeOnboarding: (
    tasteText: string,
    vectors: any
  ) => Promise<void>;
  initialize: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  initialized: false,
  loading: false,

  initialize: async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      set({
        session,
        user: session?.user ?? null,
        initialized: true,
      });

      // Set up auth state listener
      supabase.auth.onAuthStateChange((_event, session) => {
        set({
          session,
          user: session?.user ?? null,
        });
      });
    } catch (error) {
      console.error("Auth initialization error:", error);
      set({ initialized: true });
    }
  },

  signIn: async (email, password) => {
    set({ loading: true });
    try {
      const { user, session } = await authSignIn({ email, password });
      set({ user, session, loading: false });
    } catch (error) {
      set({ loading: false });
      throw error;
    }
  },

  signUp: async ({ email, password, firstName, username }) => {
    set({ loading: true });
    try {
      const result = await authSignUp({ email, password, firstName, username });

      if (!result.needsEmailVerification && result.user) {
        set({ user: result.user, session: result.session });
      }

      set({ loading: false });
      return { needsEmailVerification: result.needsEmailVerification || false };
    } catch (error) {
      set({ loading: false });
      throw error;
    }
  },

  signOut: async () => {
    set({ loading: true });
    try {
      await authSignOut();
      set({ user: null, session: null, loading: false });
    } catch (error) {
      set({ loading: false });
      throw error;
    }
  },

  checkOnboardingStatus: async () => {
    const { user } = get();
    if (!user) return { needsOnboarding: true };

    try {
      const status = await checkOnboarding(user.id);
      return { needsOnboarding: status.needsOnboarding };
    } catch {
      return { needsOnboarding: true };
    }
  },

  completeOnboarding: async (tasteText, vectors) => {
    const { user } = get();
    if (!user) throw new Error("No user logged in");

    // Get stored signup data
    const signupData = await getAndClearSignupData(user.id);

    // Create user profile
    await createUserProfile({
      userId: user.id,
      firstName: signupData?.firstName || "",
      username: signupData?.username || "",
      email: user.email || "",
    });

    // Create taste profile
    await createTasteProfile(user.id, tasteText, vectors);
  },
}));

// Initialize auth on module load
useAuthStore.getState().initialize();
