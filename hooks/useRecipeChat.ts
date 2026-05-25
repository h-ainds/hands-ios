import { useState, useCallback, useRef, useEffect } from "react";
import { parseSegments, stripMarkers, MessageSegment } from "@/lib/parseSegments";
import { supabase } from "@/lib/supabase/client";

export type { MessageSegment };

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  segments?: MessageSegment[];
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
}

const DEFAULT_TIMEOUT = 30000;
const DEFAULT_TYPING_DELAY = 2;

export function useRecipeChat(
  options: UseRecipeChatOptions = {},
): UseRecipeChatReturn {
  const {
    timeout = DEFAULT_TIMEOUT,
    typingDelay = DEFAULT_TYPING_DELAY,
    onError,
  } = options;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<StreamingStatus>("idle");
  const [error, setError] = useState<Error | null>(null);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);
  const messagesRef = useRef<ChatMessage[]>([]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      abortControllerRef.current?.abort();
    };
  }, []);

  const typeSegmentsInOrder = useCallback(
    async (segs: MessageSegment[]): Promise<void> => {
      for (const seg of segs) {
        if (!isMountedRef.current) break;

        if (seg.type === "text") {
          let typed = "";
          for (let i = 0; i < seg.content.length; i++) {
            if (!isMountedRef.current) break;
            typed += seg.content[i];
            const snapshot = typed;
            setMessages((prev) => {
              const lastIdx = prev.length - 1;
              return prev.map((msg, idx) => {
                if (idx !== lastIdx) return msg;
                const existing = msg.segments || [];
                const last = existing[existing.length - 1];
                if (last?.type === "text") {
                  return {
                    ...msg,
                    segments: [
                      ...existing.slice(0, -1),
                      { type: "text" as const, content: snapshot },
                    ],
                  };
                }
                return {
                  ...msg,
                  segments: [...existing, { type: "text" as const, content: snapshot }],
                };
              });
            });
            await new Promise((res) => setTimeout(res, typingDelay));
          }
        } else {
          // Card: append immediately, brief pause so user sees it land
          setMessages((prev) => {
            const lastIdx = prev.length - 1;
            return prev.map((msg, idx) =>
              idx !== lastIdx
                ? msg
                : { ...msg, segments: [...(msg.segments || []), seg] },
            );
          });
          await new Promise((res) => setTimeout(res, 120));
        }
      }
    },
    [typingDelay],
  );

  const saveMessageToConversation = useCallback(
    async (
      convId: string,
      role: "user" | "assistant",
      content: string,
      recipes?: Array<{ id: string; title: string; image: string; caption: string }>,
    ) => {
      try {
        const { data: conv } = await supabase
          .from("conversations")
          .select("content")
          .eq("id", convId)
          .single();

        const currentContent = conv?.content || [];
        const newMessage: any = { role, content };
        if (recipes && recipes.length > 0) {
          newMessage.recipes = recipes;
        }

        await supabase
          .from("conversations")
          .update({
            content: [...currentContent, newMessage],
            updated_at: new Date().toISOString(),
          })
          .eq("id", convId);
      } catch (err) {
        console.error("Error saving message:", err);
      }
    },
    [],
  );

  const sendMessage = useCallback(
    async (
      message: string,
      conversationId?: string,
      payload?: ChatSendAttachment,
    ) => {
      if (!message.trim() && !payload?.imageBase64) return;

      abortControllerRef.current?.abort();
      abortControllerRef.current = new AbortController();

      const userMessage = message.trim();
      let activeConversationId = conversationId || currentConversationId;

      const historySnapshot = messagesRef.current
        .slice(-6)
        .map((m) => ({ role: m.role, content: m.content }));

      if (isMountedRef.current) {
        setMessages((prev) => [
          ...prev,
          { role: "user" as const, content: userMessage },
        ]);
        setStatus("connecting");
        setError(null);
      }

      if (!activeConversationId) {
        try {
          const { data: { user } } = await supabase.auth.getUser();
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
        await saveMessageToConversation(activeConversationId, "user", userMessage);
      }

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
            { role: "assistant" as const, content: "Sorry, the request timed out. Please try again." },
          ]);
          onError?.(timeoutError);
        }
      }, timeout);

      try {
        const { data: { session } } = await supabase.auth.getSession();
        const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
        const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

        if (!supabaseUrl || !anonKey) throw new Error("Supabase configuration missing");

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

        const requestBody: Record<string, unknown> = { prompt: promptForModel, history };
        if (isImageSend && payload?.imageBase64) {
          requestBody.context = normalizedContext || DEFAULT_IMAGE_CONTEXT;
          requestBody.imageBase64 = payload.imageBase64;
          if (payload.mimeType) requestBody.mimeType = payload.mimeType;
        }
        if (payload?.recipeContext) {
          requestBody.recipeContext = payload.recipeContext;
        }

        const response = await fetch(functionUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
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

        if (isMountedRef.current) setStatus("streaming");

        const fullResponse = await response.text();
        clearTimeout(timeoutId);

        if (!isMountedRef.current) return;

        console.log("[Stream] Response length:", fullResponse.length);
        console.log("[Stream] Response (first 500 chars):", fullResponse.substring(0, 500));

        if (isMountedRef.current) setStatus("typing");

        // Parse JSON payload from edge function
        let responsePayload: { text: string; recipes: Array<{ id: string; title: string; image: string; caption: string }> }
        try {
          responsePayload = JSON.parse(fullResponse);
        } catch {
          responsePayload = { text: fullResponse || "I couldn't find any recipes for that. Try asking differently!", recipes: [] };
        }

        const { text: rawText, recipes } = responsePayload;
        const cleanText = stripMarkers(rawText) || "I couldn't find any recipes for that. Try asking differently!";
        const recipeMap = new Map(recipes.map(r => [r.id, r]));
        const segments = parseSegments(rawText, recipeMap);

        // Brief thinking pause — keeps the dots visible a moment longer before text appears
        await new Promise((res) => setTimeout(res, 700));
        if (!isMountedRef.current) return;

        // Add assistant message — content set upfront for history; segments built progressively
        if (isMountedRef.current) {
          setMessages((prev) => [
            ...prev,
            { role: "assistant" as const, content: cleanText, segments: [] as MessageSegment[] },
          ]);
        }

        // Type segments in order: text chars then card inline, then next text chars, etc.
        await typeSegmentsInOrder(segments);

        // Save to conversation
        if (activeConversationId) {
          await saveMessageToConversation(
            activeConversationId,
            "assistant",
            cleanText,
            recipes.length > 0 ? recipes : undefined,
          );
        }

        if (isMountedRef.current) setStatus("idle");
      } catch (err) {
        clearTimeout(timeoutId);
        if (!isMountedRef.current) return;

        if (err instanceof Error && err.name === "AbortError") {
          if (isMountedRef.current) setStatus("idle");
          return;
        }

        const errorObj = err instanceof Error ? err : new Error("An unexpected error occurred");
        console.error("[useRecipeChat] Error:", errorObj.message);

        if (isMountedRef.current) {
          setError(errorObj);
          setStatus("error");
          setMessages((prev) => [
            ...prev,
            { role: "assistant" as const, content: "Sorry, I encountered an error. Please try again." },
          ]);
        }

        onError?.(errorObj);
      } finally {
        clearTimeout(timeoutId);
      }
    },
    [timeout, typeSegmentsInOrder, onError, currentConversationId, saveMessageToConversation],
  );

  const clearChat = useCallback(() => {
    abortControllerRef.current?.abort();
    if (isMountedRef.current) {
      setMessages([]);
      setStatus("idle");
      setError(null);
      setCurrentConversationId(null);
    }
  }, []);

  const cancelRequest = useCallback(() => {
    abortControllerRef.current?.abort();
    if (isMountedRef.current) setStatus("idle");
  }, []);

  return {
    messages,
    status,
    error,
    isLoading: status === "connecting" || status === "streaming" || status === "typing",
    sendMessage,
    clearChat,
    cancelRequest,
    setMessages,
  };
}
