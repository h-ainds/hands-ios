import { View, Text, Pressable, ActivityIndicator, ScrollView, Image } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { SymbolView } from 'expo-symbols'
import BackButton from '@/components/BackButton'
import { useAnalyzeImage, type ImageSource } from '@/hooks/useAnalyzeImage'
import { useRouter } from 'expo-router'

export default function ScanScreen() {
  const router = useRouter()
  const {
    selectedImage,
    prompt,
    status,
    error,
    isLoading,
    pickImage,
    uploadAndAnalyze,
    discard,
    ingredients,
  } = useAnalyzeImage()

  const handlePick = (source: ImageSource) => {
    pickImage(source)
  }

  const handleUpload = async () => {
    const result = await uploadAndAnalyze()
    const nextPrompt = result?.prompt ?? prompt

    if (selectedImage?.uri && nextPrompt) {
      router.push({
        pathname: '/ask',
        params: {
          imageUri: selectedImage.uri,
          prompt: nextPrompt,
        },
      })
    }
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

        {/* Picker Buttons (Camera default only) */}
        {!selectedImage && (
          <View className="gap-3">
            <Pressable
              onPress={() => handlePick('camera')}
              className="flex-row items-center bg-secondary rounded-2xl px-5 py-4 gap-4"
              disabled={isLoading}
              style={{ opacity: isLoading ? 0.6 : 1 }}
            >
              <View
                className="w-10 h-10 rounded-full bg-white items-center justify-center"
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
          </View>
        )}

        {/* Image Preview */}
        {selectedImage && (
          <View className="mt-6">
            <View className="bg-secondary rounded-2xl p-4 flex-row items-center gap-4">
              <Image
                source={{ uri: selectedImage.uri }}
                style={{ width: 84, height: 84 }}
                className="rounded-2xl bg-white"
              />

              <View className="flex-1">
                <Text className="text-base font-semibold text-black mb-2">Photo ready</Text>
                {status === 'analyzing' && (
                  <Text className="text-sm text-secondary-placeholder">
                    Scanning ingredients...
                  </Text>
                )}
                {!isLoading && (
                  <Text className="text-sm text-secondary-placeholder">
                    Upload to analyze
                  </Text>
                )}
              </View>

              <Pressable
                onPress={discard}
                disabled={isLoading}
                className="w-10 h-10 items-center justify-center bg-white rounded-full"
                style={{ opacity: isLoading ? 0.6 : 1 }}
              >
                <SymbolView name="xmark" size={16} tintColor="#6B7280" />
              </Pressable>
            </View>

            {/* Upload button */}
            <Pressable
              onPress={handleUpload}
              disabled={isLoading}
              className="bg-secondary rounded-full px-6 py-4 items-center justify-center mt-5"
              style={{ opacity: isLoading ? 0.6 : 1 }}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="#6CD401" />
              ) : (
                <Text className="text-base font-semibold text-black">Upload</Text>
              )}
            </Pressable>

            {/* Hidden helper text for when scan completes */}
            {ingredients.length > 0 && !isLoading && (
              <Text className="text-xs text-secondary-placeholder mt-3">
                {ingredients.length} ingredients detected
              </Text>
            )}
          </View>
        )}

        {/* Loading State (when no preview yet) */}
        {isLoading && !selectedImage && (
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
            <Pressable onPress={discard} className="bg-secondary rounded-full px-6 py-3">
              <Text className="text-base font-semibold text-black">Try Again</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

