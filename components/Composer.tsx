import { SymbolView } from "expo-symbols";
import React from "react";
import { View, TextInput, Text, Pressable } from "react-native";

type ComposerProps = {
  onAskPress?: () => void;
  onSearchPress?: () => void;
  onYouPress?: () => void;
  onScanPress?: () => void;
};

const Composer = ({ onAskPress, onSearchPress, onYouPress, onScanPress }: ComposerProps) => {
  return (
    <View className="flex-row items-center px-4">
      {/* Left Button - You */}
      <Pressable
        onPress={onYouPress}
        className="rounded-full bg-white px-3 py-3 items-center justify-center mr-3"
      >
        <SymbolView
          name="person"
          size={23}
             weight="semibold"
          tintColor="#000000"
        />
      </Pressable>

      {/* Input Pill */}
      <Pressable className="flex-1" onPress={onAskPress}>
        <TextInput
          pointerEvents="none"
          placeholder="Ask"
          placeholderTextColor="#9F9F9F"
          className="rounded-full bg-white px-4 py-3 text-lg text-black font-regular"
        />
      </Pressable>

      {/* Camera Button - only rendered if onScanPress is provided */}
      {onScanPress && (
        <Pressable
          onPress={onScanPress}
          className="rounded-full bg-white px-3 py-3 items-center justify-center ml-3"
        >
          <SymbolView name="camera" 
          size={23} 
          weight="semibold"
          tintColor="#000000" />
        </Pressable>
      )}
    </View>
  );
};

export default Composer;