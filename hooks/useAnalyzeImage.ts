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

interface AnalyzeImageResponse {
  ingredients: Ingredient[]
}

interface UseAnalyzeImageOptions {
  onError?: (error: Error) => void
}

interface UseAnalyzeImageReturn {
  ingredients: Ingredient[]
  status: AnalyzeStatus
  error: Error | null
  isLoading: boolean
  pickAndAnalyze: (source: ImageSource) => Promise<void>
  reset: () => void
}

export function useAnalyzeImage(options: UseAnalyzeImageOptions = {}): UseAnalyzeImageReturn {
  const { onError } = options

  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [status, setStatus] = useState<AnalyzeStatus>('idle')
  const [error, setError] = useState<Error | null>(null)

  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const pickAndAnalyze = useCallback(async (source: ImageSource): Promise<void> => {
    if (!isMountedRef.current) return

    setStatus('picking')
    setError(null)
    setIngredients([])

    try {
      // Request permissions
      if (source === 'camera') {
        const { status: cameraStatus } = await ImagePicker.requestCameraPermissionsAsync()
        if (cameraStatus !== 'granted') {
          throw new Error('Camera permission is required to take a photo.')
        }
      } else {
        const { status: libraryStatus } = await ImagePicker.requestMediaLibraryPermissionsAsync()
        if (libraryStatus !== 'granted') {
          throw new Error('Photo library permission is required to pick an image.')
        }
      }

      // Launch picker
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
        if (isMountedRef.current) {
          setStatus('idle')
        }
        return
      }

      const asset = result.assets[0]

      if (!asset.base64) {
        throw new Error('Failed to read image data.')
      }

      // Resolve MIME type from URI extension, defaulting to jpeg
      const uriLower = asset.uri.toLowerCase()
      const mimeType: 'image/jpeg' | 'image/png' | 'image/webp' =
        uriLower.endsWith('.png')
          ? 'image/png'
          : uriLower.endsWith('.webp')
          ? 'image/webp'
          : 'image/jpeg'

      if (isMountedRef.current) {
        setStatus('analyzing')
      }

      // Get auth session
      const { data: { session } } = await supabase.auth.getSession()

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
          'apikey': anonKey,
          'Authorization': `Bearer ${session?.access_token || anonKey}`,
        },
        body: JSON.stringify({
          imageBase64: asset.base64,
          mimeType,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error')
        throw new Error(`Server error (${response.status}): ${errorText}`)
      }

      const data: AnalyzeImageResponse = await response.json()

      if (isMountedRef.current) {
        setIngredients(data.ingredients)
        setStatus('idle')
      }
    } catch (err) {
      if (!isMountedRef.current) return

      const errorObj = err instanceof Error ? err : new Error('An unexpected error occurred')
      console.error('[useAnalyzeImage] Error:', errorObj.message)

      if (isMountedRef.current) {
        setError(errorObj)
        setStatus('error')
      }

      onError?.(errorObj)
    }
  }, [onError])

  const reset = useCallback(() => {
    if (isMountedRef.current) {
      setIngredients([])
      setStatus('idle')
      setError(null)
    }
  }, [])

  return {
    ingredients,
    status,
    error,
    isLoading: status === 'picking' || status === 'analyzing',
    pickAndAnalyze,
    reset,
  }
}
