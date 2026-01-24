import { View, Text, Pressable } from "react-native";
import { Link, Stack } from "expo-router";

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Oops!" }} />
      <View className="flex-1 items-center justify-center bg-white px-6">
        <Text className="text-2xl font-bold text-black mb-4">
          Page not found
        </Text>
        <Text className="text-black/60 text-center mb-8">
          The page you're looking for doesn't exist.
        </Text>
        <Link href="/" asChild>
          <Pressable className="bg-[#6CD401] px-6 py-3 rounded-full">
            <Text className="text-white font-medium">Go Home</Text>
          </Pressable>
        </Link>
      </View>
    </>
  );
}
