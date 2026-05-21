import { afterEach, describe, expect, test, vi } from 'vitest';

import { Sandbox } from '../../src/client';
import { SANDBOX_API_KEY_ENV_NAME } from '../../src/constants';

const ORIGINAL_API_KEY = process.env[SANDBOX_API_KEY_ENV_NAME];

function restoreApiKeyEnv(): void {
  if (ORIGINAL_API_KEY === undefined) {
    delete process.env[SANDBOX_API_KEY_ENV_NAME];
    return;
  }

  process.env[SANDBOX_API_KEY_ENV_NAME] = ORIGINAL_API_KEY;
}

afterEach(() => {
  restoreApiKeyEnv();
});

describe('Sandbox auth resolution', () => {
  test('throws when api key is missing in both options and env', () => {
    delete process.env[SANDBOX_API_KEY_ENV_NAME];

    expect(() => new Sandbox()).toThrow(
      `Sandbox API key is required. Pass "apiKey" explicitly or set ${SANDBOX_API_KEY_ENV_NAME} in your environment.`,
    );
  });

  test('uses BRIMBLE_SANDBOX_KEY when constructor apiKey is not provided', async () => {
    process.env[SANDBOX_API_KEY_ENV_NAME] = 'env-test-key';

    let seenAuthHeader: string | null = null;

    const fetchImpl = vi.fn(async (_url: URL | RequestInfo, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      seenAuthHeader = headers.get('x-brimble-key');

      return new Response(
        JSON.stringify({
          message: 'ok',
          data: { regions: [] },
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        },
      );
    }) as typeof fetch;

    const client = new Sandbox({ fetchImpl });
    await client.sandboxes.listRegions();

    expect(seenAuthHeader).toBe('env-test-key');
  });

  test('prefers explicit apiKey over BRIMBLE_SANDBOX_KEY', async () => {
    process.env[SANDBOX_API_KEY_ENV_NAME] = 'env-test-key';

    let seenAuthHeader: string | null = null;

    const fetchImpl = vi.fn(async (_url: URL | RequestInfo, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      seenAuthHeader = headers.get('x-brimble-key');

      return new Response(
        JSON.stringify({
          message: 'ok',
          data: { regions: [] },
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        },
      );
    }) as typeof fetch;

    const client = new Sandbox({ apiKey: 'explicit-key', fetchImpl });
    await client.sandboxes.listRegions();

    expect(seenAuthHeader).toBe('explicit-key');
  });
});
