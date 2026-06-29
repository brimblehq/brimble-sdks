import { describe, expect, test, vi } from 'vitest';

import { CodeLanguage } from '../../src/enums';
import { Sandbox } from '../../src/client';
import { ExecStream } from '../../src/streaming';

describe('Exec env support', () => {
  test('exec forwards env object', async () => {
    let requestBody: unknown = null;

    const fetchImpl = vi.fn(async (_url: URL | RequestInfo, init?: RequestInit) => {
      if (typeof init?.body === 'string') {
        requestBody = JSON.parse(init.body) as unknown;
      }

      return new Response(
        JSON.stringify({
          message: 'ok',
          data: {
            stdout: 'ok\n',
            stderr: '',
            exit_code: 0,
            duration_ms: 4,
          },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      );
    }) as typeof fetch;

    const client = new Sandbox({
      apiKey: 'test-key',
      fetchImpl,
    });

    await client.sandboxes.use('sandbox-1').exec({
      cmd: 'printenv HELLO',
      env: { HELLO: 'WORLD' },
    });

    expect(requestBody).toMatchObject({
      cmd: 'printenv HELLO',
      env: { HELLO: 'WORLD' },
    });
  });

  test('runCode forwards env object', async () => {
    let requestBody: unknown = null;

    const fetchImpl = vi.fn(async (_url: URL | RequestInfo, init?: RequestInit) => {
      if (typeof init?.body === 'string') {
        requestBody = JSON.parse(init.body) as unknown;
      }

      return new Response(
        JSON.stringify({
          message: 'ok',
          data: {
            stdout: 'WORLD\n',
            stderr: '',
            exit_code: 0,
            duration_ms: 8,
          },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      );
    }) as typeof fetch;

    const client = new Sandbox({
      apiKey: 'test-key',
      fetchImpl,
    });

    await client.sandboxes.use('sandbox-1').runCode({
      language: CodeLanguage.Python,
      code: 'import os; print(os.getenv("HELLO"))',
      env: { HELLO: 'WORLD' },
    });

    expect(requestBody).toMatchObject({
      language: CodeLanguage.Python,
      env: { HELLO: 'WORLD' },
    });
  });

  test('stream: true returns an ExecStream and strips client callbacks from request body', async () => {
    let requestBody: unknown = null;

    const fetchImpl = vi.fn(async (_url: URL | RequestInfo, init?: RequestInit) => {
      if (typeof init?.body === 'string') {
        requestBody = JSON.parse(init.body) as unknown;
      }

      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              'data: {"type":"stdout","data":"live\\n"}\n\ndata: {"type":"done","exit_code":0,"duration_ms":2}\n\n',
            ),
          );
          controller.close();
        },
      });

      return new Response(stream, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      });
    }) as typeof fetch;

    const client = new Sandbox({ apiKey: 'test-key', fetchImpl });
    const output = await client.sandboxes.use('sandbox-1').exec({
      cmd: 'echo live',
      stream: true,
      onStdout: () => undefined,
    });

    expect(output).toBeInstanceOf(ExecStream);
    expect(requestBody).toEqual({ cmd: 'echo live', stream: true });

    const logs = [];
    for await (const log of output) {
      logs.push(log);
    }

    expect(logs).toEqual([{ stream: 'stdout', data: 'live\n' }]);
  });

  test('onStdout streams live output and still returns ExecResult', async () => {
    const fetchImpl = vi.fn(async () => {
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              'data: {"type":"stdout","data":"chunk\\n"}\n\ndata: {"type":"done","exit_code":0,"duration_ms":2}\n\n',
            ),
          );
          controller.close();
        },
      });

      return new Response(stream, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      });
    }) as typeof fetch;

    const client = new Sandbox({ apiKey: 'test-key', fetchImpl });
    const chunks: string[] = [];

    const result = await client.sandboxes.use('sandbox-1').exec({
      cmd: 'echo chunk',
      onStdout: (chunk) => {
        chunks.push(chunk);
      },
    });

    expect(chunks).toEqual(['chunk\n']);
    expect(result.stdout).toBe('chunk\n');
    expect(result.exit_code).toBe(0);
  });
});
