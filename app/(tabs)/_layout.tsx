import { Tabs, router, usePathname } from "expo-router";
import { View, Pressable } from "react-native";
import { SymbolView } from "expo-symbols";

export default function TabsLayout() {
  const pathname = usePathname();
  const isHomeActive =
    pathname === "/home" || pathname?.startsWith("/recipe/");
    const isProfileActive = pathname?.startsWith("/you");
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          height: 88,
          backgroundColor: "#FFF",
          borderTopWidth: 0,
        },
        tabBarItemStyle: {
          justifyContent: "center",
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
                name="house.fill"
                size={26}
                tintColor={isHomeActive ? "#000" : "#9F9F9F"}
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
            <View
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Pressable
                onPress={() => router.push("/ask")}
                style={{
                  width: 48,
                  height: 36,
                  borderRadius: 22,
                  backgroundColor: "#6CD401",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <SymbolView
                  name="plus"
                  size={20}
                  tintColor="#FFFFFF"
                />
              </Pressable>
            </View>
          ),
        }}
        listeners={{
          tabPress: (e) => e.preventDefault(),
        }}
      />

      {/* Profile */}
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
                name="person.circle.fill"
                size={26}
                tintColor={isProfileActive ? "#000000" : "#9F9F9F"}
              />
            </Pressable>
          ),
        }}
      />
    </Tabs>
  );
}