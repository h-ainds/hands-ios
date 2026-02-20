import { Tabs, router, usePathname } from "expo-router";
import { View, Pressable, Text } from "react-native";
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
          height: 90,
          backgroundColor: "#FFF",
          borderTopWidth: 0,
        },
        tabBarItemStyle: {
          justifyContent: "center",
        },
      }}
    >
      {/* HOME */}
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
              <View
                style={{
                  paddingHorizontal: 20,
                  paddingVertical: 8,
                  borderRadius: 999,
                  backgroundColor: isHomeActive ? "#f7f7f7" : "transparent",
                }}
              >
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: isHomeActive ? "700" : "700",
                    color: isHomeActive ? "#000" : "#9F9F9F",
                  }}
                >
                  Home
                </Text>
              </View>
            </Pressable>
          ),
        }}
      />

      {/* CENTER + ASK (unchanged) */}
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
                  weight="regular"
                />
              </Pressable>
            </View>
          ),
        }}
        listeners={{
          tabPress: (e) => e.preventDefault(),
        }}
      />

      {/* YOU */}
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
              <View
                style={{
                  paddingHorizontal: 20,
                  paddingVertical: 8,
                  borderRadius: 999,
                  backgroundColor: isProfileActive
                    ? "#f7f7f7"
                    : "transparent",
                }}
              >
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: isProfileActive ? "700" : "700",
                    color: isProfileActive ? "#000" : "#9F9F9F",
                  }}
                >
                  You
                </Text>
              </View>
            </Pressable>
          ),
        }}
      />
    </Tabs>
  );
}