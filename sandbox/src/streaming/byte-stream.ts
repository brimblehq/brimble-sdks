/**
 * Ensure a response body can be consumed with `for await (const chunk of stream)`.
 */
export function asByteStream(stream: ReadableStream<Uint8Array>): AsyncIterable<Uint8Array> {
  if (Symbol.asyncIterator in stream) {
    return stream as AsyncIterable<Uint8Array>;
  }

  return {
    async *[Symbol.asyncIterator]() {
      const reader = stream.getReader();

      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) {
            break;
          }

          yield value;
        }
      } finally {
        reader.releaseLock();
      }
    },
  };
}
