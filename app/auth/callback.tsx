import { useEffect, useState } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";

export default function AuthCallback() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [status, setStatus] = useState("Verifying your email...");
  const [error, setError] = useState<string | null>(null);
  const { checkOnboardingStatus } = useAuthStore();

  useEffect(() => {
    async function handleAuth() {
      try {
        // Get tokens from URL params (deep link)
        const access_token = params.access_token as string;
        const refresh_token = params.refresh_token as string;
        const error_param = params.error as string;
        const error_description = params.error_description as string;

        // Check for error parameters
        if (error_param) {
          throw new Error(error_description || error_param);
        }

        // If no tokens, the user might have just opened the app
        if (!access_token || !refresh_token) {
          console.log("No verification tokens, redirecting to login");
          router.replace("/(auth)/login");
          return;
        }

        setStatus("Verifying your account...");

        // Set the session using the tokens
        const { data, error: sessionError } = await supabase.auth.setSession({
          access_token,
          refresh_token,
        });

        if (sessionError) {
          console.error("Session error:", sessionError);
          throw sessionError;
        }

        if (!data.session) {
          throw new Error("No session found after email verification");
        }

        console.log("Session established for user:", data.session.user.id);
        setStatus("Email verified! Setting up your account...");

        // Check onboarding status and redirect
        const { needsOnboarding } = await checkOnboardingStatus();

        setTimeout(() => {
          if (needsOnboarding) {
            router.replace("/(app)/onboarding-profile");
          } else {
            router.replace("/(app)/home");
          }
        }, 500);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "An unexpected error occurred";
        setError(errorMessage);
        console.error("Auth callback error:", errorMessage);

        setTimeout(() => {
          router.replace("/(auth)/login");
        }, 3000);
      }
    }

    handleAuth();
  }, [params]);

  return (
    <View className="flex-1 bg-white items-center justify-center px-6">
      {error ? (
        <>
          <Text className="text-red-500 text-lg font-medium text-center mb-2">
            Verification Failed
          </Text>
          <Text className="text-black/60 text-center">{error}</Text>
          <Text className="text-black/40 text-sm mt-4">
            Redirecting to login...
          </Text>
        </>
      ) : (
        <>
          <ActivityIndicator size="large" color="#6CD401" />
          <Text className="text-black/60 mt-4 text-center">{status}</Text>
        </>
      )}
    </View>
  );
}
