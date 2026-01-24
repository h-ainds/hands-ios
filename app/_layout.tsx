import { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { Slot, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useAuthStore } from "@/stores/authStore";
import "../global.css";

export default function RootLayout() {
  const { user, initialized } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!initialized) return;

    const inAuthGroup = segments[0] === "(auth)";
    const inAppGroup = segments[0] === "(app)";

    if (!user && !inAuthGroup) {
      // User is not signed in, redirect to login
      router.replace("/(auth)/login");
    } else if (user && inAuthGroup) {
      // User is signed in but on auth screen, check onboarding then redirect
      useAuthStore
        .getState()
        .checkOnboardingStatus()
        .then(({ needsOnboarding }) => {
          if (needsOnboarding) {
            router.replace("/(app)/onboarding-profile");
          } else {
            router.replace("/(app)/home");
          }
        });
    }
  }, [user, initialized, segments]);

  // Show loading screen while initializing
  if (!initialized) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#6CD401" />
        <StatusBar style="dark" />
      </View>
    );
  }

  return (
    <>
      <Slot />
      <StatusBar style="dark" />
    </>
  );
}
