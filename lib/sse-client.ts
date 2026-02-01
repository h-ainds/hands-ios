/**
 * Server-Sent Events (SSE) Client for React Native
 *
 * Provides EventSource-like functionality that works reliably in React Native
 * by parsing SSE streams from fetch responses.
 */

export interface SSEMessage {
  event: string
  data: string
  id?: string
  retry?: number
}

export interface SSEClientOptions {
  headers?: Record<string, string>
  onMessage?: (message: SSEMessage) => void
  onError?: (error: Error) => void
  onOpen?: () => void
  signal?: AbortSignal
}

/**
 * Parse SSE stream line by line
 */
function parseSSELine(line: string, currentMessage: Partial<SSEMessage>): SSEMessage | null {
  if (line.startsWith('event:')) {
    currentMessage.event = line.slice(6).trim()
  } else if (line.startsWith('data:')) {
    const data = line.slice(5).trim()
    currentMessage.data = currentMessage.data ? `${currentMessage.data}\n${data}` : data
  } else if (line.startsWith('id:')) {
    currentMessage.id = line.slice(3).trim()
  } else if (line.startsWith('retry:')) {
    const retry = parseInt(line.slice(6).trim(), 10)
    if (!isNaN(retry)) {
      currentMessage.retry = retry
    }
  } else if (line === '') {
    // Empty line signals end of message
    if (currentMessage.data !== undefined) {
      const completeMessage: SSEMessage = {
        event: currentMessage.event || 'message',
        data: currentMessage.data,
        id: currentMessage.id,
        retry: currentMessage.retry,
      }
      return completeMessage
    }
  }

  return null
}

/**
 * SSE Client for React Native
 *
 * Usage:
 * ```typescript
 * const sse = new SSEClient('https://api.example.com/stream', {
 *   headers: { Authorization: 'Bearer token' },
 *   onMessage: (message) => console.log(message),
 *   onError: (error) => console.error(error),
 * })
 *
 * await sse.connect()
 *
 * // Later:
 * sse.close()
 * ```
 */
export class SSEClient {
  private url: string
  private options: SSEClientOptions
  private abortController: AbortController | null = null
  private isConnected = false

  constructor(url: string, options: SSEClientOptions = {}) {
    this.url = url
    this.options = options
  }

  /**
   * Connect to SSE stream
   */
  async connect(): Promise<void> {
    if (this.isConnected) {
      throw new Error('SSE client is already connected')
    }

    this.abortController = new AbortController()
    this.isConnected = true

    try {
      const response = await fetch(this.url, {
        method: 'GET',
        headers: {
          Accept: 'text/event-stream',
          'Cache-Control': 'no-cache',
          ...this.options.headers,
        },
        signal: this.options.signal || this.abortController.signal,
      })

      if (!response.ok) {
        throw new Error(`SSE connection failed: ${response.status} ${response.statusText}`)
      }

      if (!response.body) {
        throw new Error('Response body is not available')
      }

      // Notify connection opened
      this.options.onOpen?.()

      // Read response as text in React Native compatible way
      const text = await response.text()

      // Parse SSE stream
      const lines = text.split('\n')
      let currentMessage: Partial<SSEMessage> = {}

      for (const line of lines) {
        const message = parseSSELine(line, currentMessage)
        if (message) {
          this.options.onMessage?.(message)
          currentMessage = {} // Reset for next message
        }
      }

      this.isConnected = false
    } catch (error) {
      this.isConnected = false

      if (error instanceof Error && error.name === 'AbortError') {
        // Connection was aborted, don't treat as error
        return
      }

      const err = error instanceof Error ? error : new Error('SSE connection error')
      this.options.onError?.(err)
      throw err
    }
  }

  /**
   * Close the SSE connection
   */
  close(): void {
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }
    this.isConnected = false
  }

  /**
   * Check if connected
   */
  get connected(): boolean {
    return this.isConnected
  }
}

/**
 * Helper function to create and connect SSE client
 */
export async function connectSSE(
  url: string,
  options: SSEClientOptions = {}
): Promise<SSEClient> {
  const client = new SSEClient(url, options)
  await client.connect()
  return client
}
