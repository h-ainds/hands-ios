import "./global.css"
import { Text, View } from "react-native";
 
export default function App() {
  return (
    <View className="flex-1 items-center justify-center bg-white">
      <Text className="text-xl font-bold text-primary-muted">
        Welcome to Nativewind!
      </Text>
    </View>
  );
}