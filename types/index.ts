export interface Recipe {
  id: number
  title: string
  image: string | null
  ingredients?: string[]
  instructions?: string[]
  prep_time?: number
  cook_time?: number
  servings?: number
  created_at?: string
  user_id?: string
}