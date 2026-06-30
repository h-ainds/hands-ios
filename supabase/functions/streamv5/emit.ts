import type { ServerEvent } from "../../../types/chat.ts"

/**
 * Bind an SSE emitter to a ReadableStream controller.
 *
 * The promise-chain mutex serialises concurrent callers so parallel tool
 * handlers can never interleave a partial SSE frame.  `flush()` must be
 * awaited before calling controller.close() to guarantee all queued frames
 * have been written.
 */
export function makeEmitter(
  controller: ReadableStreamDefaultController<Uint8Array>,
  enc: TextEncoder,
) {
  let chain = Promise.resolve()

  function emit(event: ServerEvent): void {
    chain = chain.then(() => {
      controller.enqueue(enc.encode(`data: ${JSON.stringify(event)}\n\n`))
    })
  }

  async function flush(): Promise<void> {
    await chain
  }

  return { emit, flush }
}
