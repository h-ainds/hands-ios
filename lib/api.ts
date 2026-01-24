// API utilities for calling the Next.js backend

const API_URL = process.env.EXPO_PUBLIC_API_URL || "";

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: any;
  headers?: Record<string, string>;
}

export async function apiRequest<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const { method = "GET", body, headers = {} } = options;

  const response = await fetch(`${API_URL}${endpoint}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Request failed" }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response.json();
}

// Taste vectorization - calls your Next.js API
export async function createTasteVectors(tasteText: string): Promise<any> {
  // This would call your existing API endpoint
  // For now, return a placeholder - you'll need to implement the API call
  // based on how your taste-vectorization.ts works

  // Option 1: Call your Next.js API
  // return apiRequest("/api/taste-vectors", { method: "POST", body: { tasteText } });

  // Option 2: Placeholder for development
  return {
    // Placeholder vector data
    embedding: [],
  };
}
