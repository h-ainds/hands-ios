import React from "react"
import { View, TextInput, Text, Pressable } from "react-native"

const Composer = () => {
  return (
    <View className="flex-row items-center px-4">
      {/* Left Action Button */}
      <Pressable
        className="h-11 w-11 rounded-full bg-blue-100 items-center justify-center"
        style={{ marginRight: 10 }}
      >
        <Text className="text-white text-xs font-medium">you</Text>
      </Pressable>

      {/* Center Input */}
      <View className="flex-1">
        <TextInput
          placeholder="Ask"
          placeholderTextColor="#8E8E93"
          className="h-11 rounded-full bg-secondary px-4 text-base text-black"
        />
      </View>

      {/* Right Action Button */}
      <Pressable
        className="h-11 w-11 rounded-full bg-blue-500 items-center justify-center"
        style={{ marginLeft: 10 }}
      >
        <Text className="text-white text-[10px] font-medium">
          searchview
        </Text>
      </Pressable>
    </View>
  )
}

export default Composer
