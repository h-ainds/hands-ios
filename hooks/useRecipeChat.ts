import { useState, useCallback, useRef, useEffect } from "react";
import { parseAnswerXml, ParsedAnswer } from "@/lib/parseAnswerXml";
import { supabase } from "@/lib/supabase/client";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type RecipeCardData = {
  messageIndex: number;
  recipes: ParsedAnswer;
};

export type StreamingStatus =
  | "idle"
  | "connecting"
  | "streaming"
  | "typing"
  | "error";

export type RecipeContext = {
  title: string;
  caption: string | null;
  ingredients: { [key: string]: string[] | undefined } | null;
  steps: string[] | null;
  tags: string[] | null;
};

export type ChatSendAttachment = {
  context?: string;
  imageBase64?: string;
  mimeType?: string;
  recipeContext?: RecipeContext;
};

const DEFAULT_IMAGE_CONTEXT = "What can I make with these ingredients?";

interface UseRecipeChatOptions {
  timeout?: number;
  typingDelay?: number;
  onError?: (error: Error) => void;
}

interface UseRecipeChatReturn {
  messages: ChatMessage[];
  recipeCards: RecipeCardData[];
  status: StreamingStatus;
  error: Error | null;
  isLoading: boolean;
  sendMessage: (
    message: string,
    conversationId?: string,
    payload?: ChatSendAttachment,
  ) => Promise<void>;
  clearChat: () => void;
  cancelRequest: () => void;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  setRecipeCards: React.Dispatch<React.SetStateAction<RecipeCardData[]>>;
}

const DEFAULT_TIMEOUT = 30000; // 30 seconds
const DEFAULT_TYPING_DELAY = 6;

async function filterExistingRecipeItems(
  items: ParsedAnswer["items"],
): Promise<ParsedAnswer["items"]> {
  if (!items || items.length === 0) return [];

  const normalizedIds = Array.from(
    new Set(
      items
        .map((item) => String(item?.id ?? "").trim())
        .filter((id) => id.length > 0),
    ),
  );

  if (normalizedIds.length === 0) return [];

  const numericIds = normalizedIds
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id));

  if (numericIds.length === 0) return [];

  const { data, error } = await supabase
    .from("recipes")
    .select("id")
    .in("id", numericIds);

  if (error) {
    console.error("[useRecipeChat] Failed to validate recipe IDs:", error);
    return [];
  }

  const validIds = new Set((data || []).map((row) => String(row.id)));
  const validItems = items.filter((item) => validIds.has(String(item.id)));

  const droppedCount = items.length - validItems.length;
  if (droppedCount > 0) {
    console.warn(
      `[useRecipeChat] Dropped ${droppedCount} invalid recipe card(s) before render/save.`,
    );
  }

  return validItems;
}

export function useRecipeChat(
  options: UseRecipeChatOptions = {},
): UseRecipeChatReturn {
  const {
    timeout = DEFAULT_TIMEOUT,
    typingDelay = DEFAULT_TYPING_DELAY,
    onError,
  } = options;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [recipeCards, setRecipeCards] = useState<RecipeCardData[]>([]);
  const [status, setStatus] = useState<StreamingStatus>("idle");
  const [error, setError] = useState<Error | null>(null);
  const [currentConversationId, setCurrentConversationId] = useState<
    string | null
  >(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);
  const messagesRef = useRef<ChatMessage[]>([]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      abortControllerRef.current?.abort();
    };
  }, []);

  // Type out assistant text character by character
  const typeAssistantText = useCallback(
    async (text: string): Promise<void> => {
      let current = "";

      for (let i = 0; i < text.length; i++) {
        if (!isMountedRef.current) break;

        current += text[i];
        const currentText = current;

        if (isMountedRef.current) {
          setMessages((prev) =>
            prev.map((msg, idx) =>
              idx === prev.length - 1 ? { ...msg, content: currentText } : msg,
            ),
          );
        }

        await new Promise((res) => setTimeout(res, typingDelay));
      }
    },
    [typingDelay],
  );

  // Save message to Supabase conversation
  const saveMessageToConversation = useCallback(
    async (
      convId: string,
      role: "user" | "assistant",
      content: string,
      recipes?: ParsedAnswer,
    ) => {
      try {
        const { data: conv } = await supabase
          .from("conversations")
          .select("content")
          .eq("id", convId)
          .single();

        const currentContent = conv?.content || [];
        const newMessage: any = { role, content };

        if (recipes && recipes.items.length > 0) {
          const validItems = await filterExistingRecipeItems(recipes.items);
          if (validItems.length > 0) {
            newMessage.recipes = validItems;
          }
        }

        const newContent = [...currentContent, newMessage];

        await supabase
          .from("conversations")
          .update({
            content: newContent,
            updated_at: new Date().toISOString(),
          })
          .eq("id", convId);
      } catch (error) {
        console.error("Error saving message:", error);
      }
    },
    [],
  );

  // Send message and handle streaming response
  const sendMessage = useCallback(
    async (
      message: string,
      conversationId?: string,
      payload?: ChatSendAttachment,
    ) => {
      if (!message.trim() && !payload?.imageBase64) return;

      // Cancel any existing request
      abortControllerRef.current?.abort();
      abortControllerRef.current = new AbortController();

      const userMessage = message.trim();
      let activeConversationId = conversationId || currentConversationId;

      // Capture history BEFORE setMessages — once setMessages fires and the effect
      // runs, messagesRef will include the new user message, making findLast() in the
      // edge function return the current prompt instead of the previous one.
      const historySnapshot = messagesRef.current
        .slice(-6)
        .map((m) => ({ role: m.role, content: m.content }));

      // Add user message and update status
      if (isMountedRef.current) {
        setMessages((prev) => [
          ...prev,
          { role: "user" as const, content: userMessage },
        ]);
        setStatus("connecting");
        setError(null);
      }

      // Create new conversation if needed
      if (!activeConversationId) {
        try {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (user) {
            const { data, error } = await supabase
              .from("conversations")
              .insert({
                title: userMessage.slice(0, 50) + "...",
                user_id: user.id,
                content: [{ role: "user", content: userMessage }],
              })
              .select("id")
              .single();

            if (!error && data) {
              activeConversationId = data.id;
              setCurrentConversationId(data.id);
            }
          }
        } catch (err) {
          console.error("Error creating conversation:", err);
        }
      } else {
        // Save user message to existing conversation
        await saveMessageToConversation(
          activeConversationId,
          "user",
          userMessage,
        );
      }

      // Create timeout
      const timeoutId = setTimeout(() => {
        abortControllerRef.current?.abort();
        if (isMountedRef.current) {
          const timeoutError = new Error(
            "Request timed out. Please check your connection and try again.",
          );
          setError(timeoutError);
          setStatus("error");
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant" as const,
              content: "Sorry, the request timed out. Please try again.",
            },
          ]);
          onError?.(timeoutError);
        }
      }, timeout);

      try {
        // Get the current session for authentication
        const {
          data: { session },
        } = await supabase.auth.getSession();

        // Build the Edge Function URL
        const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
        const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

        if (!supabaseUrl || !anonKey) {
          throw new Error("Supabase configuration missing");
        }

        const functionUrl = `${supabaseUrl}/functions/v1/streamv5`;

        const normalizedContext = (payload?.context ?? "").trim();
        const isImageSend = Boolean(payload?.imageBase64);
        const promptForModel = isImageSend
          ? normalizedContext || DEFAULT_IMAGE_CONTEXT
          : userMessage;
        const history = messagesRef.current
          .filter((m) => m.role === "user")
          .slice(-2)
          .map((m) => m.content);

        const requestBody: Record<string, unknown> = {
          prompt: promptForModel,
          history,
        };
        if (isImageSend && payload?.imageBase64) {
          requestBody.context = normalizedContext || DEFAULT_IMAGE_CONTEXT;
          requestBody.imageBase64 = payload.imageBase64;
          if (payload.mimeType) requestBody.mimeType = payload.mimeType;
        }
        if (payload?.recipeContext) {
          requestBody.recipeContext = payload.recipeContext;
        }

        // Make POST request to streaming endpoint
        const response = await fetch(functionUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/plain",
            apikey: anonKey,
            Authorization: `Bearer ${session?.access_token || anonKey}`,
          },
          body: JSON.stringify(requestBody),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => "Unknown error");
          throw new Error(`Server error (${response.status}): ${errorText}`);
        }

        if (isMountedRef.current) {
          setStatus("streaming");
        }

        // Read stream as text (React Native compatible)
        const fullResponse = await response.text();

        clearTimeout(timeoutId);

        if (!isMountedRef.current) return;

        console.log("[Stream] Response length:", fullResponse.length);
        console.log(
          "[Stream] Response (first 1500 chars):",
          fullResponse.substring(0, 1500),
        );

        if (!isMountedRef.current) return;

        if (isMountedRef.current) {
          setStatus("typing");
        }

        // Strip markdown code fences if LLM wraps output in them
        const cleanXml = fullResponse
          .replace(/^```(?:xml)?\s*/i, "")
          .replace(/\s*```$/i, "")
          .trim();

        // Always extract clean display text — never show raw XML
        const extractDisplayText = (raw: string): string => {
          // Try well-formed </text> first, then fall back to stopping at <items>
          const m = raw.match(/<text>([\s\S]*?)(?:<\/text>|<items>)/);
          if (m?.[1]?.trim()) return m[1].trim();
          // Last resort: grab everything after <text> until the next tag
          const m2 = raw.match(/<text>([^<]+)/);
          if (m2?.[1]?.trim()) return m2[1].trim();
          return "";
        };

        const displayText =
          extractDisplayText(cleanXml) ||
          "I couldn't find any recipes for that. Try asking differently!";

        // Parse items for recipe cards (separate from display)
        const parsed = parseAnswerXml(cleanXml);
        console.log("[useRecipeChat] displayText:", displayText);
        console.log(
          "[useRecipeChat] Parsed items:",
          parsed?.items?.length ?? 0,
        );

        let assistantMessageIndex = -1;

        // Add empty assistant message for typing effect
        if (isMountedRef.current) {
          setMessages((prev) => {
            assistantMessageIndex = prev.length;
            return [...prev, { role: "assistant" as const, content: "" }];
          });
        }

        // Type out ONLY the clean display text
        await typeAssistantText(displayText);

        // Add recipe cards if items were parsed
        let validatedParsed: ParsedAnswer | null = null;
        if (parsed?.items && parsed.items.length > 0) {
          const validItems = await filterExistingRecipeItems(parsed.items);
          if (validItems.length > 0) {
            validatedParsed = { ...parsed, items: validItems };
          }
        }

        if (validatedParsed?.items && validatedParsed.items.length > 0 && isMountedRef.current) {
          console.log(
            "[useRecipeChat] Adding recipe cards:",
            validatedParsed.items.length,
            "items",
          );
          setRecipeCards((prev) => [
            ...prev,
            {
              messageIndex: assistantMessageIndex,
              recipes: validatedParsed,
            },
          ]);
        }

        // Save assistant message to conversation
        if (activeConversationId) {
          await saveMessageToConversation(
            activeConversationId,
            "assistant",
            displayText,
            validatedParsed || undefined,
          );
        }

        if (isMountedRef.current) {
          setStatus("idle");
        }
      } catch (err) {
        clearTimeout(timeoutId);

        if (!isMountedRef.current) return;

        // Don't treat abort as an error
        if (err instanceof Error && err.name === "AbortError") {
          if (isMountedRef.current) {
            setStatus("idle");
          }
          return;
        }

        const errorObj =
          err instanceof Error
            ? err
            : new Error("An unexpected error occurred");
        console.error("[useRecipeChat] Error:", errorObj.message);

        if (isMountedRef.current) {
          setError(errorObj);
          setStatus("error");

          // Add error message to chat
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant" as const,
              content: "Sorry, I encountered an error. Please try again.",
            },
          ]);
        }

        onError?.(errorObj);
      } finally {
        clearTimeout(timeoutId);
      }
    },
    [
      timeout,
      typeAssistantText,
      onError,
      currentConversationId,
      saveMessageToConversation,
    ],
  );

  // Clear all chat state
  const clearChat = useCallback(() => {
    abortControllerRef.current?.abort();
    if (isMountedRef.current) {
      setMessages([]);
      setRecipeCards([]);
      setStatus("idle");
      setError(null);
      setCurrentConversationId(null);
    }
  }, []);

  // Cancel current request
  const cancelRequest = useCallback(() => {
    abortControllerRef.current?.abort();
    if (isMountedRef.current) {
      setStatus("idle");
    }
  }, []);

  return {
    messages,
    recipeCards,
    status,
    error,
    isLoading:
      status === "connecting" || status === "streaming" || status === "typing",
    sendMessage,
    clearChat,
    cancelRequest,
    setMessages,
    setRecipeCards,
  };
}
