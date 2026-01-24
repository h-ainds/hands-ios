import { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useAuthStore } from "@/stores/authStore";

export default function Index() {
  const { user, initialized } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (!initialized) return;

    if (user) {
      // Check onboarding status and redirect
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
    } else {
      router.replace("/(auth)/login");
    }
  }, [user, initialized]);

  return (
    <View className="flex-1 items-center justify-center bg-white">
      <ActivityIndicator size="large" color="#6CD401" />
    </View>
  );
}
