import { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuthStore } from "@/stores/authStore";
import { createTasteVectors } from "@/lib/api";

const TASTE_SUGGESTIONS = [
  "I eat anything and everything except celery",
  "My favorite food is pizza, extra pineapple",
  "My kids love asian food, my daughter's vegetarian",
  "I don't like Irish stew and I'm not crazy about cod",
  "I really love a tuna melt",
  "I don't eat octopus 'cause they're super smart",
  "I love soup. Chicken tortilla soup.",
  "Love thai food, like noodle dishes like ramen",
  "I don't like dill. I can't stand dill",
  "big arugula salad, and I love it on top of pizza",
  "I do love lemon chicken with vegetables",
  "Couldn't live without sushi",
];

export default function OnboardingProfile() {
  const [tastePreference, setTastePreference] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();
  const { user, completeOnboarding, checkOnboardingStatus } = useAuthStore();

  useEffect(() => {
    // If user is already onboarded, redirect to home
    if (user) {
      checkOnboardingStatus().then(({ needsOnboarding }) => {
        if (!needsOnboarding) {
          router.replace("/(app)/home");
        }
      });
    }
  }, [user]);

  const handleComplete = async () => {
    if (!tastePreference.trim()) {
      Alert.alert("Error", "Please tell us about your taste preferences");
      return;
    }

    setSubmitting(true);
    try {
      // Create taste vectors (calls your API)
      const vectors = await createTasteVectors(tastePreference.trim());

      // Complete onboarding
      await completeOnboarding(tastePreference.trim(), vectors);

      Alert.alert("Welcome to Hands!", "Your profile is all set up.", [
        {
          text: "Let's go!",
          onPress: () => router.replace("/(app)/home"),
        },
      ]);
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to complete onboarding");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-white"
    >
      <View className="flex-1 px-6 pt-24">
        {/* Header */}
        <View className="mb-8">
          <Text className="text-3xl font-extrabold tracking-tight text-black leading-tight mb-2">
            What should we know about you?
          </Text>
          <Text className="text-base text-black/60 leading-normal">
            For best results, tell us what your favorite meals are and what you
            don't like
          </Text>
        </View>

        {/* Input */}
        <TextInput
          placeholder="I love spicy food, prefer vegetarian options..."
          placeholderTextColor="rgba(0,0,0,0.4)"
          value={tastePreference}
          onChangeText={setTastePreference}
          editable={!submitting}
          className="w-full h-14 px-6 rounded-full bg-gray-100 text-base text-black"
        />

        {/* Submit Button */}
        <Pressable
          onPress={handleComplete}
          disabled={!tastePreference.trim() || submitting}
          className={`w-full py-4 rounded-full flex-row items-center justify-center mt-6 ${
            tastePreference.trim()
              ? submitting
                ? "bg-[#6CD401]/50"
                : "bg-[#6CD401]"
              : "bg-[#F7F7F7]"
          }`}
        >
          {submitting ? (
            <>
              <ActivityIndicator size="small" color="white" />
              <Text className="text-white text-lg font-medium ml-2">
                Setting up your profile...
              </Text>
            </>
          ) : (
            <Text
              className={`text-lg font-medium ${
                tastePreference.trim() ? "text-white" : "text-gray-700"
              }`}
            >
              Complete
            </Text>
          )}
        </Pressable>

        {/* Suggestions */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="mt-8"
          contentContainerStyle={{ paddingRight: 24 }}
        >
          <View className="flex-row gap-2">
            {TASTE_SUGGESTIONS.map((text, index) => (
              <Pressable
                key={index}
                onPress={() => setTastePreference(text)}
                className="bg-[#F7F7F7] rounded-2xl p-4 relative"
                style={{ width: 174, height: 96 }}
              >
                <Text
                  className="text-base text-black/80 leading-tight"
                  numberOfLines={3}
                >
                  {text}
                </Text>
                <View className="absolute bottom-2 right-2">
                  <Ionicons
                    name="arrow-forward"
                    size={16}
                    color="rgba(0,0,0,0.6)"
                  />
                </View>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}
