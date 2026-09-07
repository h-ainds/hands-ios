import { useState, useCallback, useRef, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import { finalizeAttachment } from "@/lib/attachments";
import type { RecipeCard, ServerEvent } from "@/types/chat";
import { chatReducer, initialChatState } from "@/hooks/chatReducer";
import type { ChatAction } from "@/hooks/chatReducer";

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

export type ChatSendOptions = {
  /**
   * Re-run the previous user message to replace the answer it produced.
   * Skips the optimistic user turn and the user-message write (both already
   * exist), and overwrites the trailing assistant message on persist instead
   * of appending a second one.
   */
  regenerate?: boolean;
};

const DEFAULT_IMAGE_CONTEXT = "What can I make with these ingredients?";
const DEFAULT_TIMEOUT = 30000;

interface UseRecipeChatOptions {
  /**
   * Reducer dispatch owned by the screen. The hook pushes the synthetic
   * user_turn action plus every parsed SSE ServerEvent straight through it —
   * the reducer is the single source of truth for the rendered turns.
   */
  dispatch: React.Dispatch<ChatAction>;
  timeout?: number;
  onError?: (error: Error) => void;
}

interface UseRecipeChatReturn {
  status: StreamingStatus;
  error: Error | null;
  isLoading: boolean;
  sendMessage: (
    message: string,
    conversationId?: string,
    payload?: ChatSendAttachment,
    options?: ChatSendOptions,
  ) => Promise<void>;
  cancelRequest: () => void;
}

export function useRecipeChat(
  options: UseRecipeChatOptions,
): UseRecipeChatReturn {
  const { dispatch, timeout = DEFAULT_TIMEOUT, onError } = options;

  const [status, setStatus] = useState<StreamingStatus>("idle");
  const [error, setError] = useState<Error | null>(null);
  const [currentConversationId, setCurrentConversationId] = useState<
    string | null
  >(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);

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
      recipes?: RecipeCard[],
      opts?: { replaceLastAssistant?: boolean },
    ): Promise<number | null> => {
      try {
        const { data: conv } = await supabase
          .from("conversations")
          .select("content")
          .eq("id", convId)
          .single();

        const currentContent =
          (conv?.content as Record<string, unknown>[]) || [];

        // On a regenerate the stale answer is dropped so the rewritten one
        // takes its index — history must match what the user is looking at.
        const base =
          opts?.replaceLastAssistant &&
          currentContent[currentContent.length - 1]?.role === "assistant"
            ? currentContent.slice(0, -1)
            : currentContent;

        const messageIndex = base.length;
        const message: Record<string, unknown> = { role, content };
        if (attachmentId) message.attachment_id = attachmentId;
        if (recipes && recipes.length > 0) message.recipes = recipes;
        const newContent = [...base, message];

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
      options?: ChatSendOptions,
    ) => {
      if (!message.trim() && !payload?.attachmentId) return;

      const regenerate = options?.regenerate === true;

      abortControllerRef.current?.abort();
      abortControllerRef.current = new AbortController();

      const userMessage = message.trim();
      const attachmentId = payload?.attachmentId;
      let activeConversationId = conversationId || currentConversationId;

      if (isMountedRef.current) {
        // Optimistic user turn — the reducer owns it, image included. On a
        // regenerate the user turn is already on screen; the screen dispatches
        // `retry` instead, which clears the answer we are about to replace.
        if (!regenerate) {
          dispatch({
            t: "user_turn",
            content: userMessage,
            image_uri: payload?.imageUri,
          });
        }
        setStatus("connecting");
        setError(null);
      }

      // Create or update conversation in Supabase. Skipped on a regenerate —
      // the user message is already stored and must not be written twice.
      if (regenerate) {
        // nothing to write; activeConversationId is whatever the turn used.
      } else if (!activeConversationId) {
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
          dispatch({
            t: "text.delta",
            delta: "Sorry, the request timed out. Please try again.",
          });
          dispatch({ t: "done" });
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

        // Assistant text is accumulated here purely so we can persist the final
        // turn; the rendered turn is built entirely by the reducer.
        let accumulatedText = "";

        // Shadow of the screen's reduced state, fed the identical actions, so
        // the persisted turn (text + recipe cards) is derived from the same
        // final reduced state the user sees — not from raw stream events.
        let shadowState = chatReducer(initialChatState, {
          t: "user_turn",
          content: userMessage,
        });

        const processLine = (data: string) => {
          if (!data || data === "[DONE]") return;
          let event: ServerEvent;
          try {
            event = JSON.parse(data) as ServerEvent;
          } catch {
            return;
          }
          if (event.t === "text.delta") accumulatedText += event.delta ?? "";
          shadowState = chatReducer(shadowState, event);
          // Every parsed SSE event goes straight into the reducer — this is what
          // fixes multi-tool ordering: tool.call.started creates a skeleton block
          // at its true position and recipe.cards hydrates it by tool_use_id.
          if (isMountedRef.current) dispatch(event);
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
        }

        clearTimeout(timeoutId);
        if (!isMountedRef.current) return;

        if (activeConversationId) {
          // Cards that survived the full reduction (hydrated, not failed) are
          // exactly what's on screen — persist them with the assistant turn so
          // loadConversation can rebuild the cards on reopen.
          const finalTurn = shadowState.turns[shadowState.turns.length - 1];
          const recipeCards: RecipeCard[] =
            finalTurn?.role === "assistant"
              ? finalTurn.blocks.flatMap((block) =>
                  block.kind === "recipe_cards" && block.status === "ready"
                    ? block.items
                    : [],
                )
              : [];

          await saveMessageToConversation(
            activeConversationId,
            "assistant",
            accumulatedText,
            undefined,
            recipeCards,
            { replaceLastAssistant: regenerate },
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
          dispatch({
            t: "text.delta",
            delta: "Sorry, I encountered an error. Please try again.",
          });
          dispatch({ t: "done" });
        }
        onError?.(errorObj);
      } finally {
        clearTimeout(timeoutId);
      }
    },
    [timeout, onError, currentConversationId, saveMessageToConversation, dispatch],
  );

  const cancelRequest = useCallback(() => {
    abortControllerRef.current?.abort();
    if (isMountedRef.current) setStatus("idle");
  }, []);

  return {
    status,
    error,
    isLoading:
      status === "connecting" || status === "streaming" || status === "typing",
    sendMessage,
    cancelRequest,
  };
}
