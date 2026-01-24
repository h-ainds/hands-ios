import { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Image,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";

interface Recipe {
  id: number;
  title: string;
  image: string | null;
  description?: string;
  ingredients?: string[];
  instructions?: string[];
}

export default function RecipeDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    async function loadRecipe() {
      if (!id) return;

      try {
        // Try user's recipes first
        let { data } = await supabase
          .from("recipes")
          .select("*")
          .eq("id", id)
          .single();

        if (!data) {
          // Try featured library
          const { data: featured } = await supabase
            .from("featured_library")
            .select("*")
            .eq("recipe_id", id)
            .single();

          data = featured;
        }

        setRecipe(data);
      } catch (error) {
        console.error("Error loading recipe:", error);
      } finally {
        setLoading(false);
      }
    }

    loadRecipe();
  }, [id]);

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#6CD401" />
      </View>
    );
  }

  if (!recipe) {
    return (
      <View className="flex-1 items-center justify-center bg-white px-6">
        <Text className="text-lg text-gray-500">Recipe not found</Text>
        <Pressable
          onPress={() => router.back()}
          className="mt-4 bg-[#6CD401] px-6 py-3 rounded-full"
        >
          <Text className="text-white font-medium">Go Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-white">
      {/* Back Button */}
      <Pressable
        onPress={() => router.back()}
        className="absolute top-14 left-4 z-10 bg-white/90 rounded-full p-2"
      >
        <Ionicons name="chevron-back" size={24} color="black" />
      </Pressable>

      <ScrollView className="flex-1">
        {/* Hero Image */}
        {recipe.image ? (
          <Image
            source={{ uri: recipe.image }}
            className="w-full h-80"
            resizeMode="cover"
          />
        ) : (
          <View className="w-full h-80 bg-gray-300" />
        )}

        {/* Content */}
        <View className="px-6 py-6">
          <Text className="text-3xl font-bold text-black mb-4">
            {recipe.title}
          </Text>

          {recipe.description && (
            <Text className="text-base text-black/70 mb-6">
              {recipe.description}
            </Text>
          )}

          {/* Placeholder for ingredients and instructions */}
          <View className="bg-gray-100 rounded-2xl p-4 mb-4">
            <Text className="text-lg font-semibold mb-2">Ingredients</Text>
            <Text className="text-gray-600">
              Recipe details will be displayed here.
            </Text>
          </View>

          <View className="bg-gray-100 rounded-2xl p-4">
            <Text className="text-lg font-semibold mb-2">Instructions</Text>
            <Text className="text-gray-600">
              Cooking steps will be displayed here.
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
