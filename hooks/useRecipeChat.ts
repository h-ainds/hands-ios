import { useState, useCallback, useRef, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import { finalizeAttachment } from "@/lib/attachments";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  /** Set on user turns that carried an image, so the bubble keeps showing it. */
  attachmentId?: string;
  /** Local uri (optimistic) or signed URL (history) for rendering the image. */
  imageUri?: string;
};

export type RecipeCardData = {
  messageIndex: number;
  recipes: {
    text?: string;
    items: { id: string; title: string; caption: string; image: string }[];
  };
};

export type StreamingStatus =
  | "idle"
  | "connecting"
  | "streaming"
  | "typing"
  | "error";

export type ChatSendAttachment = {
  context?: string;
  /** Id of an already-uploaded attachment (bytes live in Storage). */
  attachmentId?: string;
  /** Local uri for optimistic in-bubble display after send. */
  imageUri?: string;
};

const DEFAULT_IMAGE_CONTEXT = "What can I make with these ingredients?";
const DEFAULT_TIMEOUT = 30000;

interface UseRecipeChatOptions {
  timeout?: number;
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

export function useRecipeChat(
  options: UseRecipeChatOptions = {},
): UseRecipeChatReturn {
  const { timeout = DEFAULT_TIMEOUT, onError } = options;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [recipeCards, setRecipeCards] = useState<RecipeCardData[]>([]);
  const [status, setStatus] = useState<StreamingStatus>("idle");
  const [error, setError] = useState<Error | null>(null);
  const [currentConversationId, setCurrentConversationId] = useState<
    string | null
  >(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);
  // Tracks Responses API context: [user1, ...output1, user2, ...output2, ...]
  const conversationContextRef = useRef<unknown[]>([]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      abortControllerRef.current?.abort();
    };
  }, []);

  const saveMessageToConversation = useCallback(
    async (
      convId: string,
      role: "user" | "assistant",
      content: string,
      attachmentId?: string,
    ): Promise<number | null> => {
      try {
        const { data: conv } = await supabase
          .from("conversations")
          .select("content")
          .eq("id", convId)
          .single();

        const currentContent = (conv?.content as unknown[]) || [];
        const messageIndex = currentContent.length;
        const message: Record<string, unknown> = { role, content };
        if (attachmentId) message.attachment_id = attachmentId;
        const newContent = [...currentContent, message];

        await supabase
          .from("conversations")
          .update({
            content: newContent,
            updated_at: new Date().toISOString(),
          })
          .eq("id", convId);

        return messageIndex;
      } catch (err) {
        console.error("Error saving message:", err);
        return null;
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
      if (!message.trim() && !payload?.attachmentId) return;

      abortControllerRef.current?.abort();
      abortControllerRef.current = new AbortController();

      const userMessage = message.trim();
      const attachmentId = payload?.attachmentId;
      let activeConversationId = conversationId || currentConversationId;

      // Snapshot context before this turn so we can extend it after response
      const contextSnapshot = [...conversationContextRef.current];

      if (isMountedRef.current) {
        setMessages((prev) => [
          ...prev,
          {
            role: "user" as const,
            content: userMessage,
            attachmentId,
            imageUri: payload?.imageUri,
          },
        ]);
        setStatus("connecting");
        setError(null);
      }

      // Create or update conversation in Supabase
      if (!activeConversationId) {
        try {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (user) {
            const firstMessage: Record<string, unknown> = {
              role: "user",
              content: userMessage,
            };
            if (attachmentId) firstMessage.attachment_id = attachmentId;

            const { data, error: insertError } = await supabase
              .from("conversations")
              .insert({
                title: (userMessage || (attachmentId ? "Photo" : "")).slice(0, 50) + "...",
                user_id: user.id,
                content: [firstMessage],
              })
              .select("id")
              .single();

            if (!insertError && data) {
              activeConversationId = data.id;
              setCurrentConversationId(data.id);
              // First message → index 0. Bind the attachment to this bubble.
              if (attachmentId) {
                await finalizeAttachment(attachmentId, data.id, 0);
              }
            }
          }
        } catch (err) {
          console.error("Error creating conversation:", err);
        }
      } else {
        const messageIndex = await saveMessageToConversation(
          activeConversationId,
          "user",
          userMessage,
          attachmentId,
        );
        if (attachmentId && messageIndex !== null) {
          await finalizeAttachment(attachmentId, activeConversationId, messageIndex);
        }
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
            {
              role: "assistant" as const,
              content: "Sorry, the request timed out. Please try again.",
            },
          ]);
          onError?.(timeoutError);
        }
      }, timeout);

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
        const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
        if (!supabaseUrl || !anonKey) {
          throw new Error("Supabase configuration missing");
        }

        const isImageSend = Boolean(attachmentId);
        const promptForModel = isImageSend
          ? payload?.context?.trim() || DEFAULT_IMAGE_CONTEXT
          : userMessage;

        // Only a reference travels in the payload — the bytes are already in Storage.
        const requestBody: Record<string, unknown> = {
          message: promptForModel,
          conversation_id: activeConversationId,
        };
        if (attachmentId) requestBody.attachment_id = attachmentId;

        const response = await fetch(
          `${supabaseUrl}/functions/v1/streamv5`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "text/event-stream",
              apikey: anonKey,
              Authorization: `Bearer ${session?.access_token || anonKey}`,
            },
            body: JSON.stringify(requestBody),
            signal: abortControllerRef.current.signal,
          },
        );

        if (!response.ok) {
          const errorText = await response.text().catch(() => "Unknown error");
          throw new Error(`Server error (${response.status}): ${errorText}`);
        }

        if (isMountedRef.current) setStatus("streaming");

        // Add empty assistant message to be filled by stream
        if (isMountedRef.current) {
          setMessages((prev) => [
            ...prev,
            { role: "assistant" as const, content: "" },
          ]);
        }

        let accumulatedText = "";
        // Recipe cards collected during the stream; flushed to state after done.
        const streamedCards: RecipeCardData["recipes"]["items"][] = [];

        const processLine = (data: string) => {
          if (!data || data === "[DONE]") return;
          let event: Record<string, unknown>;
          try { event = JSON.parse(data) as Record<string, unknown>; } catch { return; }

          // streamv5 ServerEvent format — discriminant field is `t`
          if (event.t === "text.delta") {
            accumulatedText += (event.delta as string) ?? "";
            if (isMountedRef.current) {
              const text = accumulatedText;
              setMessages((prev) =>
                prev.map((msg, idx) =>
                  idx === prev.length - 1 ? { ...msg, content: text } : msg,
                ),
              );
            }
          } else if (event.t === "recipe.cards") {
            const items = (event.items as any[]) ?? [];
            if (items.length > 0) {
              streamedCards.push(
                items.map((item: any) => ({
                  id: String(item.id ?? ""),
                  title: String(item.title ?? ""),
                  caption: item.caption ?? "",
                  image: item.image ?? "",
                })),
              );
            }
          }
        };

        if (response.body) {
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              if (line.startsWith("data: ")) processLine(line.slice(6).trim());
            }
          }
        } else {
          // Fallback: buffer entire response (no streaming support)
          const raw = await response.text();
          for (const line of raw.split("\n")) {
            if (line.startsWith("data: ")) processLine(line.slice(6).trim());
          }
          if (isMountedRef.current) {
            setMessages((prev) =>
              prev.map((msg, idx) =>
                idx === prev.length - 1 ? { ...msg, content: accumulatedText } : msg,
              ),
            );
          }
        }

        clearTimeout(timeoutId);
        if (!isMountedRef.current) return;

        // Flush collected recipe cards — messageIndex is the assistant message (last in state)
        if (streamedCards.length > 0) {
          setMessages((prev) => {
            const assistantIdx = prev.length - 1;
            setRecipeCards((prevCards) => [
              ...prevCards,
              ...streamedCards.map((items) => ({
                messageIndex: assistantIdx,
                recipes: { items },
              })),
            ]);
            return prev;
          });
        }

        // Context management: streamv5 uses SupabaseSession (conversation_id) for
        // multi-turn state, so conversationContextRef is no longer the primary mechanism.
        conversationContextRef.current = [
          ...contextSnapshot,
          { role: "user", content: promptForModel },
        ];

        if (activeConversationId) {
          await saveMessageToConversation(
            activeConversationId,
            "assistant",
            accumulatedText,
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

        const errorObj =
          err instanceof Error ? err : new Error("An unexpected error occurred");
        console.error("[useRecipeChat] Error:", errorObj.message);

        if (isMountedRef.current) {
          setError(errorObj);
          setStatus("error");
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
    [timeout, onError, currentConversationId, saveMessageToConversation],
  );

  const clearChat = useCallback(() => {
    abortControllerRef.current?.abort();
    if (isMountedRef.current) {
      setMessages([]);
      setRecipeCards([]);
      setStatus("idle");
      setError(null);
      setCurrentConversationId(null);
      conversationContextRef.current = [];
    }
  }, []);

  const cancelRequest = useCallback(() => {
    abortControllerRef.current?.abort();
    if (isMountedRef.current) setStatus("idle");
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
