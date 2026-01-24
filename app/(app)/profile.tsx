import { useEffect, useState } from "react";
import { View, Text, Pressable, Alert } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuthStore } from "@/stores/authStore";
import { getUserProfile, getUserTasteProfile } from "@/lib/auth";

interface Profile {
  first_name?: string;
  username?: string;
  email?: string;
}

interface TasteProfile {
  taste_text?: string;
}

export default function Profile() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tasteProfile, setTasteProfile] = useState<TasteProfile | null>(null);
  const { user, signOut } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    async function loadProfile() {
      if (!user) return;

      try {
        const userProfile = await getUserProfile(user.id);
        const taste = await getUserTasteProfile(user.id);
        setProfile(userProfile);
        setTasteProfile(taste);
      } catch (error) {
        console.error("Error loading profile:", error);
      }
    }

    loadProfile();
  }, [user]);

  const handleSignOut = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          try {
            await signOut();
            router.replace("/(auth)/login");
          } catch (error) {
            console.error("Sign out error:", error);
          }
        },
      },
    ]);
  };

  return (
    <View className="flex-1 bg-white px-6 pt-24">
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
          Profile
        </Text>
      </View>

      {/* Profile Info */}
      <View className="bg-[#F7F7F7] rounded-2xl p-4 mb-4">
        <Text className="text-sm text-black/60 mb-1">Name</Text>
        <Text className="text-lg text-black font-medium">
          {profile?.first_name || "Not set"}
        </Text>
      </View>

      <View className="bg-[#F7F7F7] rounded-2xl p-4 mb-4">
        <Text className="text-sm text-black/60 mb-1">Username</Text>
        <Text className="text-lg text-black font-medium">
          {profile?.username || "Not set"}
        </Text>
      </View>

      <View className="bg-[#F7F7F7] rounded-2xl p-4 mb-4">
        <Text className="text-sm text-black/60 mb-1">Email</Text>
        <Text className="text-lg text-black font-medium">
          {user?.email || "Not set"}
        </Text>
      </View>

      <View className="bg-[#F7F7F7] rounded-2xl p-4 mb-8">
        <Text className="text-sm text-black/60 mb-1">Taste Preferences</Text>
        <Text className="text-base text-black">
          {tasteProfile?.taste_text || "Not set"}
        </Text>
      </View>

      {/* Sign Out Button */}
      <Pressable
        onPress={handleSignOut}
        className="w-full py-4 rounded-full bg-red-500 items-center"
      >
        <Text className="text-white text-lg font-medium">Sign Out</Text>
      </Pressable>
    </View>
  );
}
