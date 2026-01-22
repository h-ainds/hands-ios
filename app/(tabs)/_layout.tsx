import { Tabs, router, usePathname } from "expo-router";
import { View, Pressable } from "react-native";
import { SymbolView } from "expo-symbols";

export default function TabsLayout() {
  const pathname = usePathname();

  const isHomeActive =
    pathname === "/home" || pathname?.startsWith("/recipe/");
  const isProfileActive = pathname?.startsWith("/profile");

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          height: 88,
          backgroundColor: "#000",
          borderTopWidth: 0,
        },
        tabBarItemStyle: {
          marginTop: 10,
        },
      }}
    >
      {/* Search / Home */}
      <Tabs.Screen
        name="home"
        options={{
          tabBarButton: (props) => (
            <Pressable
              onPress={props.onPress}
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <SymbolView
                name="magnifyingglass"
                size={26}
                tintColor={isHomeActive ? "#FFF" : "#6B6B6B"}
              />
            </Pressable>
          ),
        }}
      />

      {/* Center + Ask */}
      <Tabs.Screen
        name="index"
        options={{
          tabBarButton: () => (
            <Pressable
              onPress={() => router.push("/ask")}
              style={{
                width: 72,
                height: 44,
                borderRadius: 22,
                backgroundColor: "#6CD401",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 12,
              }}
            >
              <SymbolView
                name="plus"
                size={24}
                tintColor="#FFF"
              />
            </Pressable>
          ),
        }}
        listeners={{
          tabPress: (e) => e.preventDefault(),
        }}
      />

      {/* Profile / Chat */}
      <Tabs.Screen
        name="you"
        options={{
          tabBarButton: (props) => (
            <Pressable
              onPress={props.onPress}
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <SymbolView
                name="magnifyingglass"
                size={26}
                tintColor={isProfileActive ? "#FFF" : "#6B6B6B"}
              />
            </Pressable>
          ),
        }}
      />
    </Tabs>
  );
}