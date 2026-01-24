import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  RefreshControl,
  Image,
  Dimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuthStore } from "@/stores/authStore";
import { supabase } from "@/lib/supabase";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_WIDTH = 192; // w-48

interface Recipe {
  id: number;
  title: string;
  image: string | null;
  recipe_id?: number;
}

export default function Home() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [featuredRecipes, setFeaturedRecipes] = useState<Recipe[]>([]);
  const [recentRecipes, setRecentRecipes] = useState<Recipe[]>([]);
  const [heroRecipe, setHeroRecipe] = useState<Recipe | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const { user, signOut } = useAuthStore();
  const router = useRouter();

  const loadRecipes = useCallback(async () => {
    if (!user) return;

    try {
      // Load user's added recipes
      const { data: userRecipes } = await supabase
        .from("recipes")
        .select("id, title, image")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(9);

      setRecipes(userRecipes || []);
    } catch (error) {
      console.error("Error loading recipes:", error);
    }
  }, [user]);

  const loadFeaturedRecipes = useCallback(async () => {
    try {
      const { data: featured } = await supabase
        .from("featured_library")
        .select("*")
        .limit(50);

      if (featured && featured.length > 0) {
        // Shuffle and pick 9
        const shuffled = [...featured].sort(() => Math.random() - 0.5);
        setFeaturedRecipes(shuffled.slice(0, 9) as Recipe[]);

        // Set hero recipe
        const heroIndex = Math.floor(Math.random() * featured.length);
        setHeroRecipe(featured[heroIndex] as Recipe);
      }
    } catch (error) {
      console.error("Error loading featured recipes:", error);
    }
  }, []);

  const loadRecentRecipes = useCallback(async () => {
    if (!user) return;

    try {
      const { data: recent } = await supabase.rpc("get_recent_recipes", {
        user_id_param: user.id,
        limit_param: 9,
      });

      setRecentRecipes((recent as Recipe[]) || []);
    } catch (error) {
      console.error("Error loading recent recipes:", error);
    }
  }, [user]);

  const loadAllData = useCallback(async () => {
    await Promise.all([loadRecipes(), loadFeaturedRecipes(), loadRecentRecipes()]);
  }, [loadRecipes, loadFeaturedRecipes, loadRecentRecipes]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAllData();
    setRefreshing(false);
  }, [loadAllData]);

  const handleSignOut = async () => {
    try {
      await signOut();
      router.replace("/(auth)/login");
    } catch (error) {
      console.error("Sign out error:", error);
    }
  };

  const RecipeCard = ({
    recipe,
    isHero = false,
  }: {
    recipe: Recipe;
    isHero?: boolean;
  }) => {
    const id = recipe.recipe_id || recipe.id;

    if (isHero) {
      return (
        <Pressable
          onPress={() => router.push(`/(app)/recipe/${id}`)}
          className="w-full h-full"
        >
          {recipe.image ? (
            <Image
              source={{ uri: recipe.image }}
              className="w-full h-full"
              resizeMode="cover"
            />
          ) : (
            <View className="w-full h-full bg-gray-300" />
          )}
          <View className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/60 to-transparent">
            <Text className="text-white text-2xl font-bold" numberOfLines={2}>
              {recipe.title}
            </Text>
          </View>
        </Pressable>
      );
    }

    return (
      <Pressable
        onPress={() => router.push(`/(app)/recipe/${id}`)}
        className="rounded-xl overflow-hidden bg-gray-100"
        style={{ width: CARD_WIDTH }}
      >
        {recipe.image ? (
          <Image
            source={{ uri: recipe.image }}
            className="w-full h-32"
            resizeMode="cover"
          />
        ) : (
          <View className="w-full h-32 bg-gray-300" />
        )}
        <View className="p-2">
          <Text className="text-sm font-medium text-black" numberOfLines={2}>
            {recipe.title}
          </Text>
        </View>
      </Pressable>
    );
  };

  const RecipeSection = ({
    title,
    recipes,
    emptyMessage,
  }: {
    title: string;
    recipes: Recipe[];
    emptyMessage: string;
  }) => (
    <View className="py-4">
      <Text className="text-2xl font-bold tracking-tight mb-2 px-4">{title}</Text>
      {recipes.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
        >
          {recipes.map((recipe, index) => (
            <RecipeCard key={`${title}-${recipe.id}-${index}`} recipe={recipe} />
          ))}
        </ScrollView>
      ) : (
        <View className="px-4 py-8">
          <Text className="text-gray-500 text-sm italic">{emptyMessage}</Text>
        </View>
      )}
    </View>
  );

  return (
    <View className="flex-1 bg-white">
      <ScrollView
        className="flex-1"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Hero */}
        <View style={{ height: SCREEN_WIDTH * 1.1 }}>
          {heroRecipe ? (
            <RecipeCard recipe={heroRecipe} isHero />
          ) : (
            <View className="w-full h-full bg-gray-200" />
          )}
        </View>

        {/* Recents */}
        <RecipeSection
          title="Recents"
          recipes={recentRecipes}
          emptyMessage="No recent recipes yet. Start browsing to see your recently viewed recipes here!"
        />

        {/* Added Recipes */}
        <RecipeSection
          title="Added Recipes"
          recipes={recipes}
          emptyMessage="No recipes added yet. Create your first recipe to get started!"
        />

        {/* Our Picks */}
        <RecipeSection
          title="Our Picks"
          recipes={featuredRecipes}
          emptyMessage="Loading featured recipes..."
        />

        {/* Spacer for bottom nav */}
        <View className="h-20" />
      </ScrollView>

      {/* Bottom Navigation */}
      <View className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-200 pb-8 pt-3">
        <View className="flex-row justify-around items-center">
          <Pressable className="items-center">
            <Ionicons name="home" size={24} color="#6CD401" />
            <Text className="text-xs text-[#6CD401] mt-1">Home</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push("/(app)/add-recipe")}
            className="items-center"
          >
            <Ionicons name="add-circle-outline" size={24} color="#9F9F9F" />
            <Text className="text-xs text-[#9F9F9F] mt-1">Add</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push("/(app)/profile")}
            className="items-center"
          >
            <Ionicons name="person-outline" size={24} color="#9F9F9F" />
            <Text className="text-xs text-[#9F9F9F] mt-1">Profile</Text>
          </Pressable>
          <Pressable onPress={handleSignOut} className="items-center">
            <Ionicons name="log-out-outline" size={24} color="#9F9F9F" />
            <Text className="text-xs text-[#9F9F9F] mt-1">Logout</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
