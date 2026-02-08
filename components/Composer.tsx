import { SymbolView } from "expo-symbols";
import React from "react";
import { View, TextInput, Text, Pressable } from "react-native";

type ComposerProps = {
  onAskPress?: () => void;
  onSearchPress?: () => void;
  onYouPress?: () => void;
};

const Composer = ({ onAskPress, onSearchPress, onYouPress }: ComposerProps) => {
  return (
    <View className="flex-row items-center px-4">
      {/* Left Button - You */}
      <Pressable 
        onPress={onYouPress}
        className="rounded-full bg-secondary px-4 py-4 items-center justify-center mr-3"
      >
        <SymbolView
          name="person.fill"
          size={18}
          tintColor="#9F9F9F"
        />
      </Pressable>

      {/* Input Pill */}
      <Pressable className="flex-1" onPress={onAskPress}>
        <TextInput
          pointerEvents="none"
          placeholder="Ask"
          placeholderTextColor="#8E8E93"
          className="rounded-full bg-secondary px-4 py-2.5 text-lg text-black"
        />
      </Pressable>

      {/* Right Button - Search */}
      <Pressable
        onPress={onSearchPress}
        className="rounded-full bg-secondary px-4 py-4 items-center justify-center ml-3"
      >
        <SymbolView
          name="magnifyingglass"
          size={18}
          tintColor="#9F9F9F"
          weight="semibold"
        />
      </Pressable>
    </View>
  );
};

export default Composer;