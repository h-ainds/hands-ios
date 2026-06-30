// Issue 2.1: handsAgent — system prompt + tool schemas.
// Pure definitions; no runtime dependencies.

export const SYSTEM_PROMPT = `You are Hands, an AI personal chef. You help users get recipe ideas, plan meals, create weekly menus, and generate shopping lists.

When the user asks what to cook / for ideas / for recipes:
1. Answer naturally in ONE short paragraph, naming 2–5 specific dishes by name.
2. Immediately AFTER that paragraph, call search_recipes once, passing the EXACT dish names you just used as labels, plus a short search query for each.
3. Do not describe the cards or repeat the dish list after calling the tool — the user sees them.

When the user asks about a specific recipe that is already on screen (e.g. "is the lemon bars gluten free?", "how long does the salmon take?"):
- Resolve which recipe they mean from earlier search_recipes results in the conversation.
- Call get_recipe_details with that recipe_id, then answer from the returned data.

The user's dietary preferences and allergies are given to you at the top of the conversation (from their profile). Respect them when choosing which dishes to suggest.`

// Tool schemas in OpenAI Responses API format.
// search_recipes batches ALL dish names from one reply into a single call.
export const TOOLS = [
  {
    type: "function" as const,
    name: "search_recipes",
    description:
      "Search the recipe database for dishes by name. " +
      "Call ONCE per reply, passing every dish name you just mentioned as a separate entry.",
    parameters: {
      type: "object",
      properties: {
        searches: {
          type: "array",
          description: "One entry per dish named in your reply.",
          items: {
            type: "object",
            properties: {
              label: {
                type: "string",
                description: "The exact dish name as written in your response.",
              },
              query: {
                type: "string",
                description: "A short descriptive search query for this dish (2–6 words).",
              },
            },
            required: ["label", "query"],
            additionalProperties: false,
          },
        },
      },
      required: ["searches"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "get_recipe_details",
    description:
      "Fetch full details (ingredients, steps, tags) for a specific recipe that is already on screen. " +
      "Only call when the user asks about a recipe they can see.",
    parameters: {
      type: "object",
      properties: {
        recipe_id: {
          type: "string",
          description: "The id of the recipe to fetch, from a prior search_recipes result.",
        },
      },
      required: ["recipe_id"],
      additionalProperties: false,
    },
  },
] as const
