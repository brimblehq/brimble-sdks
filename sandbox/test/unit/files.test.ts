import { describe, expect, test, vi } from 'vitest';

import { Sandbox } from '../../src/client';

describe('FilesResource putFiles', () => {
  test('encodes files as base64 payload and normalizes leading slash', async () => {
    let requestBody: unknown = null;

    const fetchImpl = vi.fn(async (_url: URL | RequestInfo, init?: RequestInit) => {
      if (typeof init?.body === 'string') {
        requestBody = JSON.parse(init.body) as unknown;
      }

      return new Response(
        JSON.stringify({
          message: 'Batch file upload completed',
          data: {
            uploaded: 2,
            failed: 0,
            results: [
              { path: '/tmp/a.txt', bytes: 5, success: true },
              { path: '/tmp/b.txt', bytes: 4, success: true },
            ],
          },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      );
    }) as typeof fetch;

    const client = new Sandbox({ apiKey: 'test-key', fetchImpl });
    const result = await client.sandboxes.use('sandbox-1').putFiles([
      { path: 'tmp/a.txt', body: 'hello' },
      { path: '/tmp/b.txt', body: new Uint8Array([1, 2, 3, 4]) },
    ]);

    expect(result.uploaded).toBe(2);
    expect(requestBody).toEqual({
      files: [
        { path: '/tmp/a.txt', content_base64: 'aGVsbG8=' },
        { path: '/tmp/b.txt', content_base64: 'AQIDBA==' },
      ],
    });
  });

  test('validates min/max number of files', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('fetch should not be called for validation failures');
    }) as typeof fetch;

    const client = new Sandbox({ apiKey: 'test-key', fetchImpl });
    const scope = client.sandboxes.use('sandbox-1');

    await expect(scope.putFiles([])).rejects.toThrow('putFiles requires at least one file.');

    const tooMany = Array.from({ length: 101 }, (_, index) => ({
      path: `/tmp/${index}.txt`,
      body: 'x',
    }));
    await expect(scope.putFiles(tooMany)).rejects.toThrow('putFiles supports at most 100 files per request.');
  });
});
