import { View, Text, Pressable, ActivityIndicator, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { SymbolView } from 'expo-symbols'
import BackButton from '@/components/BackButton'
import { useAnalyzeImage, type Ingredient, type ImageSource } from '@/hooks/useAnalyzeImage'

export default function ScanScreen() {
  const { ingredients, status, error, isLoading, pickAndAnalyze, reset } = useAnalyzeImage()

  const hasResults = ingredients.length > 0

  const handlePick = (source: ImageSource) => {
    pickAndAnalyze(source)
  }

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top']}>
      <BackButton />

      <ScrollView className="flex-1" contentContainerClassName="px-4 pt-16 pb-10">

        {/* Title */}
        <Text className="text-3xl font-extrabold tracking-tighter text-black mb-1">
          Scan Ingredients
        </Text>
        <Text className="text-base text-secondary-placeholder mb-8">
          Take a photo of your fridge or groceries.
        </Text>

        {/* Picker Buttons */}
        {!isLoading && !hasResults && (
          <View className="gap-3">
            <Pressable
              onPress={() => handlePick('camera')}
              className="flex-row items-center bg-secondary rounded-2xl px-5 py-4 gap-4"
            >
              <View className="w-10 h-10 rounded-full bg-white items-center justify-center"
                style={{
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.06,
                  shadowRadius: 6,
                  elevation: 2,
                }}
              >
                <SymbolView name="camera.fill" size={18} tintColor="#000000" />
              </View>
              <View className="flex-1">
                <Text className="text-base font-semibold text-black">Take a Photo</Text>
                <Text className="text-sm text-secondary-placeholder">Use your camera</Text>
              </View>
              <SymbolView name="chevron.right" size={14} tintColor="#9F9F9F" />
            </Pressable>

            <Pressable
              onPress={() => handlePick('library')}
              className="flex-row items-center bg-secondary rounded-2xl px-5 py-4 gap-4"
            >
              <View className="w-10 h-10 rounded-full bg-white items-center justify-center"
                style={{
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.06,
                  shadowRadius: 6,
                  elevation: 2,
                }}
              >
                <SymbolView name="photo.fill" size={18} tintColor="#000000" />
              </View>
              <View className="flex-1">
                <Text className="text-base font-semibold text-black">Choose from Library</Text>
                <Text className="text-sm text-secondary-placeholder">Pick an existing photo</Text>
              </View>
              <SymbolView name="chevron.right" size={14} tintColor="#9F9F9F" />
            </Pressable>
          </View>
        )}

        {/* Loading State */}
        {isLoading && (
          <View className="flex-1 items-center justify-center py-20">
            <ActivityIndicator size="large" color="#6CD401" />
            <Text className="text-sm text-secondary-placeholder mt-4">
              {status === 'picking' ? 'Opening picker...' : 'Analyzing image...'}
            </Text>
          </View>
        )}

        {/* Error State */}
        {!isLoading && error && (
          <View className="items-center py-12">
            <Text className="text-base text-red-500 text-center mb-6">{error.message}</Text>
            <Pressable
              onPress={reset}
              className="bg-secondary rounded-full px-6 py-3"
            >
              <Text className="text-base font-semibold text-black">Try Again</Text>
            </Pressable>
          </View>
        )}

        {/* Results */}
        {!isLoading && hasResults && (
          <View>
            <Text className="text-xl font-bold tracking-tighter text-black mb-4">
              {ingredients.length} ingredient{ingredients.length !== 1 ? 's' : ''} found
            </Text>

            <View className="gap-2">
              {ingredients.map((item: Ingredient, index: number) => (
                <View
                  key={index}
                  className="flex-row items-center bg-secondary rounded-2xl px-4 py-3"
                >
                  {/* Confidence dot */}
                  <View
                    className="w-2 h-2 rounded-full mr-3"
                    style={{
                      backgroundColor:
                        item.confidence === 'high'
                          ? '#6CD401'
                          : item.confidence === 'medium'
                          ? '#F59E0B'
                          : '#9F9F9F',
                    }}
                  />

                  {/* Name */}
                  <Text className="flex-1 text-base font-semibold text-black capitalize">
                    {item.name}
                  </Text>

                  {/* Category pill */}
                  <View className="bg-primary-muted rounded-full px-2 py-0.5">
                    <Text className="text-xs text-primary font-medium capitalize">
                      {item.category}
                    </Text>
                  </View>
                </View>
              ))}
            </View>

            {/* Scan Again */}
            <Pressable
              onPress={reset}
              className="flex-row items-center justify-center bg-secondary rounded-2xl px-5 py-4 mt-6 gap-2"
            >
              <SymbolView name="arrow.counterclockwise" size={16} tintColor="#9F9F9F" />
              <Text className="text-base font-semibold text-black">Scan Again</Text>
            </Pressable>
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  )
}
