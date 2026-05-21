import { describe, expect, test, vi } from 'vitest';

import { SDK_PACKAGE_VERSION } from '../../src/constants';
import { AuthError, NotFoundError, RateLimitError, ValidationError } from '../../src/errors';
import { HttpTransport } from '../../src/transport/http';

function createJsonResponse(payload: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
  });
}

describe('HttpTransport', () => {
  test('unwraps JSON response envelope data', async () => {
    const fetchImpl = vi.fn(async () => createJsonResponse({ message: 'ok', data: { id: 'sandbox-1' } })) as typeof fetch;

    const transport = new HttpTransport({
      baseUrl: 'https://sandbox.brimble.io',
      apiKey: 'test-key',
      fetchImpl,
    });

    const result = await transport.requestJson<{ id: string }>({
      endpoint: '/sandboxes/sandbox-1',
      method: 'GET',
    });

    expect(result).toEqual({ id: 'sandbox-1' });
  });

  test('returns undefined for HTTP 204', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 })) as typeof fetch;

    const transport = new HttpTransport({
      baseUrl: 'https://sandbox.brimble.io',
      apiKey: 'test-key',
      fetchImpl,
    });

    const result = await transport.requestJson({
      endpoint: '/sandboxes/sandbox-1',
      method: 'DELETE',
    });

    expect(result).toBeUndefined();
  });

  test('sends SDK tracing and auth headers', async () => {
    let seenAuthHeader: string | null = null;
    let seenSourceHeader: string | null = null;
    let seenSourceVersionHeader: string | null = null;

    const fetchImpl = vi.fn(async (_url: URL | RequestInfo, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      seenAuthHeader = headers.get('x-brimble-key');
      seenSourceHeader = headers.get('source');
      seenSourceVersionHeader = headers.get('source-version');
      return createJsonResponse({ message: 'ok', data: { regions: [] } });
    }) as typeof fetch;

    const transport = new HttpTransport({
      baseUrl: 'https://sandbox.brimble.io',
      apiKey: 'header-test-key',
      fetchImpl,
    });

    await transport.requestJson({ endpoint: '/sandboxes/regions', method: 'GET' });

    expect(seenAuthHeader).toBe('header-test-key');
    expect(seenSourceHeader).toBe('sdk-package');
    expect(seenSourceVersionHeader).toBe(SDK_PACKAGE_VERSION);
  });

  test('maps auth and validation errors to typed errors', async () => {
    const authFetch = vi.fn(async () => createJsonResponse({ message: 'forbidden' }, 403)) as typeof fetch;
    const validationFetch = vi.fn(async () => createJsonResponse({ message: 'bad input' }, 400)) as typeof fetch;

    const authTransport = new HttpTransport({
      baseUrl: 'https://sandbox.brimble.io',
      apiKey: 'test-key',
      fetchImpl: authFetch,
    });

    const validationTransport = new HttpTransport({
      baseUrl: 'https://sandbox.brimble.io',
      apiKey: 'test-key',
      fetchImpl: validationFetch,
    });

    await expect(authTransport.requestJson({ endpoint: '/sandboxes', method: 'GET' })).rejects.toBeInstanceOf(AuthError);
    await expect(validationTransport.requestJson({ endpoint: '/volumes', method: 'POST' })).rejects.toBeInstanceOf(ValidationError);
  });

  test('maps not-found and rate-limit responses to typed errors', async () => {
    const notFoundFetch = vi.fn(async () => createJsonResponse({ message: 'missing' }, 404)) as typeof fetch;
    const rateLimitFetch = vi.fn(async () => createJsonResponse({ message: 'slow down' }, 429, { 'retry-after': '3' })) as typeof fetch;

    const notFoundTransport = new HttpTransport({
      baseUrl: 'https://sandbox.brimble.io',
      apiKey: 'test-key',
      fetchImpl: notFoundFetch,
    });

    const rateLimitTransport = new HttpTransport({
      baseUrl: 'https://sandbox.brimble.io',
      apiKey: 'test-key',
      fetchImpl: rateLimitFetch,
    });

    const notFoundError = await notFoundTransport
      .requestJson({ endpoint: '/sandboxes/missing', method: 'GET' })
      .catch((error) => error);
    const rateLimitError = await rateLimitTransport
      .requestJson({ endpoint: '/sandboxes', method: 'GET' })
      .catch((error) => error);

    expect(notFoundError).toBeInstanceOf(NotFoundError);
    expect(notFoundError.endpoint).toBe('GET /sandboxes/missing');
    expect(rateLimitError).toBeInstanceOf(RateLimitError);
    expect(rateLimitError.retryAfterSeconds).toBe(3);
  });
});
