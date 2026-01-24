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
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

export default function AddRecipe() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleAddRecipe = async () => {
    if (!url.trim()) {
      Alert.alert("Error", "Please enter a recipe URL");
      return;
    }

    setLoading(true);
    try {
      // TODO: Implement recipe parsing via your Next.js API
      Alert.alert(
        "Coming Soon",
        "Recipe import functionality will be implemented with your API."
      );
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to add recipe");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-white"
    >
      <View className="flex-1 px-6 pt-24">
        {/* Back Button */}
        <Pressable
          onPress={() => router.back()}
          className="absolute top-14 left-4 p-2"
          style={{ zIndex: 10 }}
        >
          <Ionicons name="chevron-back" size={24} color="rgba(0,0,0,0.6)" />
        </Pressable>

        {/* Header */}
        <View className="mb-8">
          <Text className="text-3xl font-extrabold tracking-tight text-black">
            Add Recipe
          </Text>
          <Text className="text-base text-black/60 mt-1">
            Paste a URL from any recipe website
          </Text>
        </View>

        {/* URL Input */}
        <TextInput
          placeholder="https://example.com/recipe..."
          placeholderTextColor="rgba(0,0,0,0.3)"
          value={url}
          onChangeText={setUrl}
          keyboardType="url"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!loading}
          className="w-full px-4 py-4 rounded-2xl bg-[#F7F7F7] text-black text-lg mb-6"
        />

        {/* Submit Button */}
        <Pressable
          onPress={handleAddRecipe}
          disabled={loading || !url.trim()}
          className={`w-full py-4 rounded-full flex-row items-center justify-center ${
            loading || !url.trim() ? "bg-[#6CD401]/50" : "bg-[#6CD401]"
          }`}
        >
          {loading ? (
            <>
              <ActivityIndicator size="small" color="white" />
              <Text className="text-white text-lg font-medium ml-2">
                Adding recipe...
              </Text>
            </>
          ) : (
            <Text className="text-white text-lg font-medium">Add Recipe</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
