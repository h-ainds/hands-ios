import React, { useState } from 'react';
import { View, Text, Image, Pressable } from 'react-native';


interface RecipeCardProps {
  title: string;
  image?: string;
  cardType?: 'vertical' | 'square' | 'horizontal';
  rounded?: 'lg' | 'xl' | '2xl';
  backgroundColor?: string;
  showActionButton?: boolean;
  onPress?: () => void;
}

// Plus Icon Component (using Text)
const PlusIcon = () => (
  <Text className="text-black text-2xl font-bold">+</Text>
);

// Check Icon Component (using Text)
const CheckIcon = () => (
  <Text className="text-green-500 text-2xl font-bold">✓</Text>
);

export default function RecipeCard({
  title,
  image,
  cardType = 'vertical',
  rounded = 'xl',
  backgroundColor = 'bg-gray-300',
  showActionButton = false,
  onPress,
}: RecipeCardProps) {
  const [isAdded, setIsAdded] = useState(false);
  const [imageError, setImageError] = useState(false);

  // Get container classes based on cardType
  const getContainerClasses = () => {
    switch (cardType) {
      case 'vertical':
        return 'w-36 aspect-[1/2]';
      case 'square':
        return 'w-full aspect-square';
      case 'horizontal':
        return 'w-full h-24 flex-row';
      default:
        return 'w-36 aspect-[1/2]';
    }
  };

  // Get rounded classes
  const getRoundedClass = () => {
    switch (rounded) {
      case 'lg':
        return 'rounded-lg';
      case 'xl':
        return 'rounded-xl';
      case '2xl':
        return 'rounded-2xl';
      default:
        return 'rounded-xl';
    }
  };

  // Get title text classes based on cardType
  const getTitleClasses = () => {
    switch (cardType) {
      case 'square':
        return 'text-[28px] font-extrabold leading-[30px] tracking-[-0.04em]';
      case 'horizontal':
        return 'text-base font-bold tracking-tight';
      default:
        return 'text-lg font-bold';
    }
  };

  // Get title padding based on cardType
  const getTitlePadding = () => {
    switch (cardType) {
      case 'square':
        return 'px-4 py-5';
      case 'horizontal':
        return 'px-3 py-3';
      default:
        return 'px-3 py-3';
    }
  };

  const handleActionPress = () => {
    setIsAdded(!isAdded);
  };

  const containerClasses = getContainerClasses();
  const roundedClass = getRoundedClass();
  const titleClasses = getTitleClasses();
  const titlePadding = getTitlePadding();

  // Handle placeholder image
  const imageSource = imageError || !image 
    ? require('../assets/placeholder.png') 
    : { uri: image };

  return (
    <Pressable
      onPress={onPress}
      className={`${containerClasses} ${roundedClass} ${backgroundColor} overflow-hidden relative`}
    >
      {/* Image - fills entire card */}
      <Image
        source={imageSource}
        className="absolute inset-0 w-full h-full"
        resizeMode="cover"
        onError={() => setImageError(true)}
      />

      {/* Dark Overlay for Text Readability */}
      <View className="absolute inset-0 bg-black/30" />

      {/* Title Container */}
      <View className="absolute inset-0 flex justify-end">
        <View className={`w-full bg-gradient-to-t from-black/70 to-transparent ${titlePadding}`}>
          <Text className={`text-white leading-tight ${titleClasses}`} numberOfLines={2}>
            {title}
          </Text>
        </View>
      </View>

      {/* Action Button */}
      {showActionButton && (
        <Pressable
          onPress={handleActionPress}
          className={`absolute ${
            cardType === 'square' ? 'bottom-4' : 'top-3'
          } right-3 bg-white rounded-full p-1 shadow-md`}
        >
          <View className="w-6 h-6 items-center justify-center">
            {isAdded ? <CheckIcon /> : <PlusIcon />}
          </View>
        </Pressable>
      )}
    </Pressable>
  );
}