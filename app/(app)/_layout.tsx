import { Stack } from "expo-router";

export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "#FFFFFF" },
        animation: "slide_from_right",
      }}
    >
      <Stack.Screen name="home" />
      <Stack.Screen name="onboarding-profile" />
      <Stack.Screen name="recipe/[id]" />
      <Stack.Screen name="add-recipe" />
      <Stack.Screen name="profile" />
    </Stack>
  );
}
