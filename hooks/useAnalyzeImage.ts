import { useState, useCallback, useRef, useEffect } from 'react'
import * as ImagePicker from 'expo-image-picker'
import { supabase } from '@/lib/supabase/client'

export interface Ingredient {
  name: string
  category: string
  confidence: 'high' | 'medium' | 'low'
}

export type ImageSource = 'camera' | 'library'

export type AnalyzeStatus = 'idle' | 'picking' | 'analyzing' | 'error'

type MimeType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'

export interface SelectedImage {
  uri: string
  base64: string
  mimeType: MimeType
}

export interface SuggestedPrompt {
  prompt: string
}

interface AnalyzeImageResponse {
  ingredients: Ingredient[]
}

interface UseAnalyzeImageOptions {
  onError?: (error: Error) => void
}

interface UseAnalyzeImageReturn {
  selectedImage: SelectedImage | null
  ingredients: Ingredient[]
  prompt: string | null
  status: AnalyzeStatus
  error: Error | null
  isLoading: boolean
  pickImage: (source: ImageSource) => Promise<void>
  uploadAndAnalyze: () => Promise<SuggestedPrompt | null>
  discard: () => void
}

export function useAnalyzeImage(
  options: UseAnalyzeImageOptions = {}
): UseAnalyzeImageReturn {
  const { onError } = options

  const [selectedImage, setSelectedImage] = useState<SelectedImage | null>(null)
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [prompt, setPrompt] = useState<string | null>(null)
  const [status, setStatus] = useState<AnalyzeStatus>('idle')
  const [error, setError] = useState<Error | null>(null)

  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const pickImage = useCallback(
    async (source: ImageSource): Promise<void> => {
      if (!isMountedRef.current) return

      setStatus('picking')
      setError(null)
      setIngredients([])
      setPrompt(null)

      try {
        if (source === 'camera') {
          const { status: cameraStatus } =
            await ImagePicker.requestCameraPermissionsAsync()
          if (cameraStatus !== 'granted') {
            throw new Error('Camera permission is required to take a photo.')
          }
        } else {
          const { status: libraryStatus } =
            await ImagePicker.requestMediaLibraryPermissionsAsync()
          if (libraryStatus !== 'granted') {
            throw new Error('Photo library permission is required to pick an image.')
          }
        }

        const pickerOptions: ImagePicker.ImagePickerOptions = {
          mediaTypes: 'images',
          allowsEditing: true,
          quality: 0.8,
          base64: true,
        }

        const result =
          source === 'camera'
            ? await ImagePicker.launchCameraAsync(pickerOptions)
            : await ImagePicker.launchImageLibraryAsync(pickerOptions)

        if (result.canceled || !result.assets[0]) {
          if (isMountedRef.current) setStatus('idle')
          return
        }

        const asset = result.assets[0]
        if (!asset.base64) throw new Error('Failed to read image data.')

        const uriLower = asset.uri.toLowerCase()
        const mimeType: MimeType = uriLower.endsWith('.png')
          ? 'image/png'
          : uriLower.endsWith('.webp')
            ? 'image/webp'
            : 'image/jpeg'

        if (!isMountedRef.current) return
        setSelectedImage({
          uri: asset.uri,
          base64: asset.base64,
          mimeType,
        })
        setStatus('idle')
      } catch (err) {
        if (!isMountedRef.current) return
        const errorObj =
          err instanceof Error ? err : new Error('An unexpected error occurred')
        console.error('[useAnalyzeImage] Error:', errorObj.message)
        setError(errorObj)
        setStatus('error')
        onError?.(errorObj)
      }
    },
    [onError]
  )

  const uploadAndAnalyze = useCallback(
    async (): Promise<SuggestedPrompt | null> => {
      if (!isMountedRef.current) return null
      if (!selectedImage?.base64) return null

      setStatus('analyzing')
      setError(null)
      setIngredients([])
      setPrompt(null)

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()

        const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
        const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

        if (!supabaseUrl || !anonKey) {
          throw new Error('Supabase configuration missing')
        }

        const functionUrl = `${supabaseUrl}/functions/v1/analyze-image`

        const response = await fetch(functionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: anonKey,
            Authorization: `Bearer ${session?.access_token || anonKey}`,
          },
          body: JSON.stringify({
            imageBase64: selectedImage.base64,
            mimeType: selectedImage.mimeType,
          }),
        })

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error')
          throw new Error(`Server error (${response.status}): ${errorText}`)
        }

        const data: AnalyzeImageResponse = await response.json()
        const nextIngredients = Array.isArray(data.ingredients) ? data.ingredients : []

        if (!isMountedRef.current) return null
        setIngredients(nextIngredients)

        const ingredientNames = nextIngredients
          .map(i => i.name.trim())
          .filter(Boolean)
          .join(', ')

        const nextPrompt = `I have the following ingredients in my fridge: ${ingredientNames}. What can I make with these?`
        setPrompt(nextPrompt)
        setStatus('idle')

        return { prompt: nextPrompt }
      } catch (err) {
        if (!isMountedRef.current) return null
        const errorObj =
          err instanceof Error ? err : new Error('An unexpected error occurred')
        console.error('[useAnalyzeImage] Error:', errorObj.message)
        setError(errorObj)
        setStatus('error')
        onError?.(errorObj)
        return null
      }
    },
    [onError, selectedImage]
  )

  const discard = useCallback(() => {
    if (!isMountedRef.current) return
    setSelectedImage(null)
    setIngredients([])
    setPrompt(null)
    setStatus('idle')
    setError(null)
  }, [])

  return {
    selectedImage,
    ingredients,
    prompt,
    status,
    error,
    isLoading: status === 'picking' || status === 'analyzing',
    pickImage,
    uploadAndAnalyze,
    discard,
  }
}

