import type { ExecStreamFrame } from '../types';

function parseSseBlock(block: string): ExecStreamFrame | null {
  const dataLine = block
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith('data:'));

  if (!dataLine) {
    return null;
  }

  const json = dataLine.slice('data:'.length).trim();
  if (!json) {
    return null;
  }

  return JSON.parse(json) as ExecStreamFrame;
}

/**
 * Incrementally parse SSE (`text/event-stream`) frames from a byte stream.
 * Comment lines (`: open`, `: ping`) are ignored.
 */
export async function* parseSseFrames(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<ExecStreamFrame> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const abort = () => {
    reader.cancel().catch(() => undefined);
  };

  signal?.addEventListener('abort', abort, { once: true });

  try {
    while (true) {
      if (signal?.aborted) {
        throw signal.reason ?? new Error('Stream aborted');
      }

      const { value, done } = await reader.read();
      if (done) {
        break;
      }

      if (value) {
        buffer += decoder.decode(value, { stream: true });
      }

      let boundary = buffer.indexOf('\n\n');
      while (boundary !== -1) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);

        const frame = parseSseBlock(block);
        if (frame) {
          yield frame;
        }

        boundary = buffer.indexOf('\n\n');
      }
    }

    buffer += decoder.decode();
    if (buffer.trim().length > 0) {
      const frame = parseSseBlock(buffer);
      if (frame) {
        yield frame;
      }
    }
  } finally {
    signal?.removeEventListener('abort', abort);
    reader.releaseLock();
  }
}
