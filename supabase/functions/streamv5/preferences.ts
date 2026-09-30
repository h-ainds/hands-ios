// Personalization: the caller's saved user_preferences, formatted for the model.
// Only loaded when the request sets personalize: true (the device-local Preferences
// toggle). The result rides in this turn's `instructions` and is never written to
// conversation_items, so flipping the toggle takes effect on the next message.

import { createClient } from "@supabase/supabase-js"

// deno-lint-ignore no-explicit-any
type SupabaseClient = ReturnType<typeof createClient<any, any, any>>

// Keys and order mirror lib/preferences.ts (a CHECK constraint on
// user_preferences.preferences enforces the key set).
const LABELS: Array<[key: string, label: string]> = [
  ["cooking_effort",     "Cooking effort"],
  ["dietary_needs",      "Dietary needs"],
  ["preferred_cuisines", "Preferred cuisines"],
  ["cooking_for",        "Cooking for"],
  ["pantry_situation",   "Pantry"],
  ["meal_type",          "Meal type"],
  ["notes",              "Notes"],
]

// One "- Label: value" line per non-empty answer, or null when there's nothing to say.
// List items are joined with "; " because some options contain commas
// ("Asian (Thai, Japanese, Chinese...)").
export function formatPreferences(raw: unknown): string | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null
  const prefs = raw as Record<string, unknown>

  const lines: string[] = []
  for (const [key, label] of LABELS) {
    const value = prefs[key]
    const text = typeof value === "string"
      ? value.trim()
      : Array.isArray(value)
        ? value.filter((v): v is string => typeof v === "string" && v.trim() !== "").join("; ")
        : ""
    if (text) lines.push(`- ${label}: ${text}`)
  }
  return lines.length > 0 ? lines.join("\n") : null
}

// Resolves the caller from their JWT (already verified by the gateway) and returns
// their formatted preferences. Any miss returns null so the turn degrades to an
// unpersonalized reply rather than failing.
export async function loadPreferences(
  supabase: SupabaseClient,
  accessToken: string,
): Promise<string | null> {
  const { data: { user }, error: authErr } = await supabase.auth.getUser(accessToken)
  if (authErr || !user) {
    console.error("[personalize] could not resolve user:", authErr?.message ?? "no user")
    return null
  }

  const { data, error } = await supabase
    .from("user_preferences")
    .select("preferences")
    .eq("id", user.id)
    .maybeSingle()
  if (error) {
    console.error("[personalize] preferences lookup failed:", error.message)
    return null
  }

  return formatPreferences(data?.preferences)
}
