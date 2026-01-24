import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { Link, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuthStore } from "@/stores/authStore";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showEmailVerification, setShowEmailVerification] = useState(false);
  const { signIn, loading, checkOnboardingStatus } = useAuthStore();
  const router = useRouter();
  const canGoBack = router.canGoBack();

  const handleSignIn = async () => {
    if (!email.trim() || !password) {
      Alert.alert("Error", "Please fill in all fields");
      return;
    }

    try {
      await signIn(email.trim(), password);

      // Check onboarding status and redirect
      const { needsOnboarding } = await checkOnboardingStatus();
      if (needsOnboarding) {
        router.replace("/(app)/onboarding-profile");
      } else {
        router.replace("/(app)/home");
      }
    } catch (error: any) {
      const message = error.message || "Failed to sign in";

      if (
        message.includes("not confirmed") ||
        message.includes("Email not confirmed")
      ) {
        setShowEmailVerification(true);
      } else {
        Alert.alert("Error", message);
      }
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-white"
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="flex-1 px-6 pt-24">
          {/* Back Button - only show if there's navigation history */}
          {canGoBack && (
            <Pressable
              onPress={() => router.back()}
              className="absolute top-14 left-4 p-2 rounded-full"
              style={{ zIndex: 10 }}
            >
              <Ionicons name="chevron-back" size={24} color="rgba(0,0,0,0.6)" />
            </Pressable>
          )}

          {/* Header */}
          <View className="mb-8">
            <Text className="text-3xl font-extrabold tracking-tight text-black">
              Welcome back
            </Text>
            <Text className="text-base text-black/60 mt-1">
              Enter your details to log in.
            </Text>
          </View>

          {/* Form */}
          <View className="gap-4 mb-6">
            <TextInput
              placeholder="Email"
              placeholderTextColor="rgba(0,0,0,0.3)"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              editable={!loading}
              className="w-full px-4 py-4 rounded-2xl bg-[#F7F7F7] text-black text-lg"
            />
            <TextInput
              placeholder="Password"
              placeholderTextColor="rgba(0,0,0,0.3)"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="password"
              editable={!loading}
              className="w-full px-4 py-4 rounded-2xl bg-[#F7F7F7] text-black text-lg"
            />
          </View>

          {/* Submit Button */}
          <Pressable
            onPress={handleSignIn}
            disabled={loading}
            className={`w-full py-4 rounded-full flex-row items-center justify-center ${
              loading ? "bg-[#6CD401]/50" : "bg-[#6CD401]"
            }`}
          >
            {loading ? (
              <>
                <ActivityIndicator size="small" color="white" />
                <Text className="text-white text-lg font-medium ml-2">
                  Logging in...
                </Text>
              </>
            ) : (
              <Text className="text-white text-lg font-medium">Log in</Text>
            )}
          </Pressable>

          {/* Email Verification Banner */}
          {showEmailVerification && (
            <View className="mt-6 bg-yellow-50 border border-yellow-200 rounded-2xl p-4">
              <Text className="text-lg font-semibold text-black text-center mb-2">
                Please verify your email
              </Text>
              <Text className="text-black/70 text-center mb-4">
                We sent a verification email to{" "}
                <Text className="font-semibold">{email}</Text>. Please check your
                inbox and click the verification link.
              </Text>
              <Pressable
                onPress={() => setShowEmailVerification(false)}
                className="mt-2"
              >
                <Text className="text-black/60 text-center text-sm">
                  Try logging in again
                </Text>
              </Pressable>
            </View>
          )}

          {/* Links */}
          <View className="items-center mt-6">
            <Link href="/(auth)/forgot-password" asChild>
              <Pressable>
                <Text className="text-[#9F9F9F] mb-3">Forgot password?</Text>
              </Pressable>
            </Link>
            <Link href="/(auth)/signup" asChild>
              <Pressable>
                <Text className="text-[#B2B2B2]">
                  No account yet?{" "}
                  <Text className="font-medium text-[#6CD401]">Sign Up</Text>
                </Text>
              </Pressable>
            </Link>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
