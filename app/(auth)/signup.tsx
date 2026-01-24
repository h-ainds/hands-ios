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

type Step = "form" | "verification";

export default function SignUp() {
  const [firstName, setFirstName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [step, setStep] = useState<Step>("form");

  const { signUp, loading } = useAuthStore();
  const router = useRouter();
  const canGoBack = router.canGoBack();

  const validateForm = (): boolean => {
    if (!firstName.trim()) {
      Alert.alert("Error", "Please enter your first name");
      return false;
    }
    if (!username.trim()) {
      Alert.alert("Error", "Please enter a username");
      return false;
    }
    if (!email.trim()) {
      Alert.alert("Error", "Please enter your email");
      return false;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      Alert.alert("Error", "Please enter a valid email address");
      return false;
    }

    if (password.length < 6) {
      Alert.alert("Error", "Password must be at least 6 characters");
      return false;
    }

    if (password !== confirmPassword) {
      Alert.alert("Error", "Passwords don't match");
      return false;
    }

    return true;
  };

  const handleSignUp = async () => {
    if (!validateForm()) return;

    try {
      const { needsEmailVerification } = await signUp({
        email: email.trim(),
        password,
        firstName: firstName.trim(),
        username: username.trim(),
      });

      if (needsEmailVerification) {
        setStep("verification");
      } else {
        // User is automatically logged in
        router.replace("/(app)/onboarding-profile");
      }
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to create account");
    }
  };

  // Verification screen
  if (step === "verification") {
    return (
      <View className="flex-1 bg-white px-6 pt-24">
        <Pressable
          onPress={() => setStep("form")}
          className="absolute top-14 left-4 p-2"
        >
          <Ionicons name="chevron-back" size={24} color="rgba(0,0,0,0.6)" />
        </Pressable>

        <View className="items-center mt-8">
          <View className="w-16 h-16 bg-[#6CD401]/10 rounded-full items-center justify-center mb-6">
            <Ionicons name="mail-outline" size={32} color="#6CD401" />
          </View>

          <Text className="text-3xl font-extrabold tracking-tight text-black text-center mb-4">
            Check your email
          </Text>
          <Text className="text-black/60 text-center mb-2">
            We've sent a verification link to
          </Text>
          <Text className="text-black font-medium text-center mb-6">
            {email}
          </Text>
          <Text className="text-black/60 text-sm text-center">
            Click the link in the email to verify your account and complete your
            registration.
          </Text>

          <View className="w-full mt-8">
            <Link href="/(auth)/login" asChild>
              <Pressable className="w-full py-4 rounded-full bg-[#F7F7F7] items-center">
                <Text className="text-black text-lg font-medium">
                  Go to Login
                </Text>
              </Pressable>
            </Link>
          </View>
        </View>
      </View>
    );
  }

  // Sign up form
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
              className="absolute top-14 left-4 p-2"
              style={{ zIndex: 10 }}
            >
              <Ionicons name="chevron-back" size={24} color="rgba(0,0,0,0.6)" />
            </Pressable>
          )}

          {/* Header */}
          <View className="mb-8">
            <Text className="text-3xl font-extrabold tracking-tight text-black">
              Create your account
            </Text>
            <Text className="text-base text-black/60 mt-1">
              Enter your details to get started.
            </Text>
          </View>

          {/* Form */}
          <View className="gap-4 mb-6">
            <TextInput
              placeholder="First name"
              placeholderTextColor="rgba(0,0,0,0.3)"
              value={firstName}
              onChangeText={setFirstName}
              autoCapitalize="words"
              editable={!loading}
              className="w-full px-4 py-4 rounded-2xl bg-[#F7F7F7] text-black text-lg"
            />
            <TextInput
              placeholder="Username"
              placeholderTextColor="rgba(0,0,0,0.3)"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              editable={!loading}
              className="w-full px-4 py-4 rounded-2xl bg-[#F7F7F7] text-black text-lg"
            />
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
              editable={!loading}
              className="w-full px-4 py-4 rounded-2xl bg-[#F7F7F7] text-black text-lg"
            />
            <TextInput
              placeholder="Confirm password"
              placeholderTextColor="rgba(0,0,0,0.3)"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              editable={!loading}
              className="w-full px-4 py-4 rounded-2xl bg-[#F7F7F7] text-black text-lg"
            />
          </View>

          {/* Submit Button */}
          <Pressable
            onPress={handleSignUp}
            disabled={loading}
            className={`w-full py-4 rounded-full flex-row items-center justify-center ${
              loading ? "bg-[#6CD401]/50" : "bg-[#6CD401]"
            }`}
          >
            {loading ? (
              <>
                <ActivityIndicator size="small" color="white" />
                <Text className="text-white text-lg font-medium ml-2">
                  Creating account...
                </Text>
              </>
            ) : (
              <Text className="text-white text-lg font-medium">
                Create account
              </Text>
            )}
          </Pressable>

          {/* Links */}
          <View className="items-center mt-6">
            <Link href="/(auth)/login" asChild>
              <Pressable>
                <Text className="text-black/60">
                  Already have an account?{" "}
                  <Text className="font-medium text-[#6CD401]">Log in</Text>
                </Text>
              </Pressable>
            </Link>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
