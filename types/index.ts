export interface Recipe {
  id: number
  title: string
  image: string | null
  caption: string | null
  steps: string[] | null
  tags: string[] | null
  created_at: string
  updated_at: string
  searchable_title: string | null
  user_id?: string | null
  url: string | null
  ingredients: {
    Ingredients?: string[]
    [key: string]: string[] | undefined
  } | null
}