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
} from "react-native";
import { Link, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { resetPassword } from "@/lib/auth";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const router = useRouter();
  const canGoBack = router.canGoBack();

  const handleResetPassword = async () => {
    if (!email.trim()) {
      Alert.alert("Error", "Please enter your email address");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      Alert.alert("Error", "Please enter a valid email address");
      return;
    }

    setLoading(true);
    try {
      await resetPassword(email.trim());
      setEmailSent(true);
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to send reset email");
    } finally {
      setLoading(false);
    }
  };

  if (emailSent) {
    return (
      <View className="flex-1 bg-white px-6 pt-24">
        {canGoBack && (
          <Pressable
            onPress={() => router.back()}
            className="absolute top-14 left-4 p-2"
          >
            <Ionicons name="chevron-back" size={24} color="rgba(0,0,0,0.6)" />
          </Pressable>
        )}

        <View className="items-center mt-8">
          <View className="w-16 h-16 bg-[#6CD401]/10 rounded-full items-center justify-center mb-6">
            <Ionicons name="mail-outline" size={32} color="#6CD401" />
          </View>

          <Text className="text-3xl font-extrabold tracking-tight text-black text-center mb-4">
            Check your email
          </Text>
          <Text className="text-black/60 text-center mb-2">
            We've sent a password reset link to
          </Text>
          <Text className="text-black font-medium text-center mb-6">
            {email}
          </Text>
          <Text className="text-black/60 text-sm text-center">
            Click the link in the email to reset your password.
          </Text>

          <View className="w-full mt-8">
            <Link href="/(auth)/login" asChild>
              <Pressable className="w-full py-4 rounded-full bg-[#6CD401] items-center">
                <Text className="text-white text-lg font-medium">
                  Back to Login
                </Text>
              </Pressable>
            </Link>
          </View>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-white"
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
            Reset password
          </Text>
          <Text className="text-base text-black/60 mt-1">
            Enter your email to receive a reset link.
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
        </View>

        {/* Submit Button */}
        <Pressable
          onPress={handleResetPassword}
          disabled={loading}
          className={`w-full py-4 rounded-full flex-row items-center justify-center ${
            loading ? "bg-[#6CD401]/50" : "bg-[#6CD401]"
          }`}
        >
          {loading ? (
            <>
              <ActivityIndicator size="small" color="white" />
              <Text className="text-white text-lg font-medium ml-2">
                Sending...
              </Text>
            </>
          ) : (
            <Text className="text-white text-lg font-medium">
              Send reset link
            </Text>
          )}
        </Pressable>

        {/* Links */}
        <View className="items-center mt-6">
          <Link href="/(auth)/login" asChild>
            <Pressable>
              <Text className="text-[#9F9F9F]">Back to login</Text>
            </Pressable>
          </Link>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
