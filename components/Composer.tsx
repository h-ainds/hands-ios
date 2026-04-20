import { SymbolView } from "expo-symbols";
import React from "react";
import { View, TextInput, Pressable } from "react-native";

type ComposerProps = {
  onAskPress?: () => void;
  onSubmitPress?: () => void;
};

const Composer = ({ onAskPress, onSubmitPress }: ComposerProps) => {
  return (
    <View className="flex-row items-center px-20">
      {/* Input Pill */}
      <Pressable className="flex-1" onPress={onAskPress}>
        <View className="flex-row items-center rounded-full bg-white pl-4 pr-3 h-14">
          <TextInput
            pointerEvents="none"
            placeholder="Ask"
            placeholderTextColor="#9F9F9F"
            className="flex-1 text-lg text-black font-regular"
          />
          {/* Submit Button */}
          <Pressable
            onPress={onSubmitPress}
            className="rounded-full bg-secondary px-2 py-2 items-center justify-center"
          >
            <SymbolView
              name="arrow.up"
              size={18}
              tintColor="#B2B2B2"
              weight="semibold"
            />
          </Pressable>
        </View>
      </Pressable>
    </View>
  );
};

export default Composer;