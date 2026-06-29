import { describe, expect, test } from 'vitest';

import { ExecStream } from '../../src/streaming/exec-stream';
import { parseSseFrames } from '../../src/streaming/sse';

function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

async function collectFrames(stream: ReadableStream<Uint8Array>) {
  const frames = [];
  for await (const frame of parseSseFrames(stream)) {
    frames.push(frame);
  }
  return frames;
}

describe('parseSseFrames', () => {
  test('parses stdout and done frames while ignoring comments', async () => {
    const response = sseResponse([
      ': open\n\n',
      'data: {"type":"stdout","data":"line-1\\n"}\n\n',
      ': ping\n\n',
      'data: {"type":"stdout","data":"line-2\\n"}\n\n',
      'data: {"type":"done","exit_code":0,"duration_ms":12}\n\n',
    ]);

    const frames = await collectFrames(response.body as ReadableStream<Uint8Array>);

    expect(frames).toEqual([
      { type: 'stdout', data: 'line-1\n' },
      { type: 'stdout', data: 'line-2\n' },
      { type: 'done', exit_code: 0, duration_ms: 12 },
    ]);
  });

  test('handles frames split across byte chunks', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"type":"stdout","data":"hel'));
        controller.enqueue(encoder.encode('lo\\n"}\n\ndata: {"type":"done","exit_code":0,"duration_ms":1}\n\n'));
        controller.close();
      },
    });

    const frames = await collectFrames(stream);

    expect(frames).toEqual([
      { type: 'stdout', data: 'hello\n' },
      { type: 'done', exit_code: 0, duration_ms: 1 },
    ]);
  });
});

describe('ExecStream', () => {
  test('supports for await iteration and result()', async () => {
    const response = sseResponse([
      'data: {"type":"stdout","data":"one\\n"}\n\n',
      'data: {"type":"stderr","data":"warn\\n"}\n\n',
      'data: {"type":"done","exit_code":0,"duration_ms":4}\n\n',
    ]);

    const output = new ExecStream(response.body as ReadableStream<Uint8Array>);
    const logs = [];

    for await (const log of output) {
      logs.push(log);
    }

    expect(logs).toEqual([
      { stream: 'stdout', data: 'one\n' },
      { stream: 'stderr', data: 'warn\n' },
    ]);

    const result = await new ExecStream(
      sseResponse([
        'data: {"type":"stdout","data":"one\\n"}\n\n',
        'data: {"type":"stderr","data":"warn\\n"}\n\n',
        'data: {"type":"done","exit_code":0,"duration_ms":4}\n\n',
      ]).body as ReadableStream<Uint8Array>,
    ).result();

    expect(result).toEqual({
      stdout: 'one\n',
      stderr: 'warn\n',
      exit_code: 0,
      duration_ms: 4,
    });
  });
});
