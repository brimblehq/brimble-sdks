import {
  DEFAULT_RETRY_BASE_DELAY_MS,
  DEFAULT_RETRY_MAX_ATTEMPTS,
  DEFAULT_RETRY_MAX_DELAY_MS,
  DEFAULT_RETRY_STATUSES,
  SDK_PACKAGE_VERSION,
  DEFAULT_TIMEOUT_MS,
} from '../constants';
import { AuthError, NotFoundError, RateLimitError, SandboxApiError, ValidationError } from '../errors';
import { buildApiKeyHeader } from './auth';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type RetryOptions = {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  retryStatuses?: number[];
  retryMethods?: HttpMethod[];
};

export type RequestOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
  idempotencyKey?: string;
  retry?: RetryOptions | false;
};

export type JsonRequestArgs = RequestOptions & {
  endpoint: string;
  method: HttpMethod;
  query?: URLSearchParams;
  body?: JsonValue | undefined;
  headers?: Record<string, string>;
};

export type BinaryRequestArgs = RequestOptions & {
  endpoint: string;
  method: HttpMethod;
  query?: URLSearchParams;
  body?: ReadableStream<Uint8Array> | Buffer | Uint8Array;
  headers?: Record<string, string>;
};

export type HttpTransportConfig = {
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  retry?: RetryOptions;
};

type ResponseEnvelope<T> = {
  message: string;
  data?: T;
};

type NormalizedRetryConfig = {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryStatuses: number[];
  retryMethods: HttpMethod[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasMessage(value: unknown): value is { message: string } {
  return isRecord(value) && typeof value.message === 'string';
}

function isEnvelope<T>(value: unknown): value is ResponseEnvelope<T> {
  return hasMessage(value);
}

function maybeJoinSignal(signal: AbortSignal | undefined, timeoutMs: number): { signal: AbortSignal; cleanup: () => void } {
  if (!signal) {
    return { signal: AbortSignal.timeout(timeoutMs), cleanup: () => {} };
  }

  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => {
    timeoutController.abort(new DOMException('The operation timed out.', 'AbortError'));
  }, timeoutMs);

  const mergedController = new AbortController();

  const onCallerAbort = () => {
    mergedController.abort(signal.reason);
  };

  const onTimeoutAbort = () => {
    mergedController.abort(timeoutController.signal.reason);
  };

  if (signal.aborted) {
    mergedController.abort(signal.reason);
  } else {
    signal.addEventListener('abort', onCallerAbort, { once: true });
  }

  timeoutController.signal.addEventListener('abort', onTimeoutAbort, { once: true });

  const cleanup = () => {
    clearTimeout(timeoutId);
    signal.removeEventListener('abort', onCallerAbort);
    timeoutController.signal.removeEventListener('abort', onTimeoutAbort);
  };

  return { signal: mergedController.signal, cleanup };
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    return response.json() as Promise<unknown>;
  }

  const text = await response.text();
  return text.length > 0 ? text : null;
}

function buildUrl(baseUrl: string, endpoint: string, query?: URLSearchParams): string {
  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const normalizedPath = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const url = new URL(`${normalizedBaseUrl}${normalizedPath}`);

  if (query) {
    url.search = query.toString();
  }

  return url.toString();
}

function normalizeRetryConfig(retry?: RetryOptions): NormalizedRetryConfig {
  return {
    maxAttempts: Math.max(1, retry?.maxAttempts ?? DEFAULT_RETRY_MAX_ATTEMPTS),
    baseDelayMs: Math.max(0, retry?.baseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS),
    maxDelayMs: Math.max(0, retry?.maxDelayMs ?? DEFAULT_RETRY_MAX_DELAY_MS),
    retryStatuses: retry?.retryStatuses ?? [...DEFAULT_RETRY_STATUSES],
    retryMethods: retry?.retryMethods ?? ['GET', 'DELETE', 'PUT'],
  };
}

function mergeRetryConfig(base: NormalizedRetryConfig, override?: RetryOptions | false): NormalizedRetryConfig {
  if (override === false) {
    return {
      ...base,
      maxAttempts: 1,
    };
  }

  if (!override) {
    return base;
  }

  return normalizeRetryConfig({
    maxAttempts: override.maxAttempts ?? base.maxAttempts,
    baseDelayMs: override.baseDelayMs ?? base.baseDelayMs,
    maxDelayMs: override.maxDelayMs ?? base.maxDelayMs,
    retryStatuses: override.retryStatuses ?? base.retryStatuses,
    retryMethods: override.retryMethods ?? base.retryMethods,
  });
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function canRetryByMethod(method: HttpMethod, retryMethods: HttpMethod[], idempotencyKey?: string): boolean {
  if (retryMethods.includes(method)) {
    return true;
  }

  if (method === 'POST' && idempotencyKey) {
    return true;
  }

  return false;
}

function canRetryBody(body: string | ReadableStream<Uint8Array> | Buffer | Uint8Array | undefined): boolean {
  if (!body) {
    return true;
  }

  if (typeof body === 'string') {
    return true;
  }

  if (Buffer.isBuffer(body) || body instanceof Uint8Array) {
    return true;
  }

  return false;
}

function computeRetryDelayMs(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  const exponent = Math.max(0, attempt - 1);
  const delayMs = baseDelayMs * (2 ** exponent);
  return Math.min(maxDelayMs, delayMs);
}

async function sleep(ms: number): Promise<void> {
  if (ms <= 0) {
    return;
  }

  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function parseRetryAfterSeconds(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const asNumber = Number(value);

  if (Number.isFinite(asNumber)) {
    return asNumber;
  }

  return null;
}

function getRequestId(response: Response): string | null {
  return response.headers.get('x-request-id') ?? response.headers.get('x-correlation-id') ?? null;
}

export class HttpTransport {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly retry: NormalizedRetryConfig;

  /** Create a transport used by all SDK resources. */
  public constructor(config: HttpTransportConfig) {
    this.baseUrl = config.baseUrl;
    this.apiKey = config.apiKey;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = config.fetchImpl ?? globalThis.fetch;
    this.retry = normalizeRetryConfig(config.retry);
  }

  /**
   * Send a JSON request and return the unwrapped `data` payload.
   * If the endpoint returns 204, this resolves to `undefined`.
   */
  public async requestJson<T>(args: JsonRequestArgs): Promise<T | undefined> {
    const headers = args.body !== undefined ? { 'content-type': 'application/json', ...(args.headers ?? {}) } : args.headers;

    const response = await this.executeRequest({
      endpoint: args.endpoint,
      method: args.method,
      query: args.query,
      body: args.body !== undefined ? JSON.stringify(args.body) : undefined,
      headers,
      signal: args.signal,
      timeoutMs: args.timeoutMs,
      idempotencyKey: args.idempotencyKey,
      retry: args.retry,
    });

    if (response.status === 204) {
      return undefined;
    }

    const payload = await parseResponseBody(response);

    if (!response.ok) {
      throw this.toApiError(response, args.method, args.endpoint, payload);
    }

    if (isEnvelope<T>(payload)) {
      if ('data' in payload) {
        return payload.data;
      }

      return payload as T;
    }

    return payload as T;
  }

  /**
   * Send a binary upload request (for file writes).
   * Returns when the API acknowledges success.
   */
  public async requestBinary(args: BinaryRequestArgs): Promise<void> {
    const response = await this.executeRequest({
      endpoint: args.endpoint,
      method: args.method,
      query: args.query,
      body: args.body,
      headers: args.headers,
      signal: args.signal,
      timeoutMs: args.timeoutMs,
      idempotencyKey: args.idempotencyKey,
      retry: args.retry,
    });

    if (response.ok || response.status === 204) {
      return;
    }

    const payload = await parseResponseBody(response);
    throw this.toApiError(response, args.method, args.endpoint, payload);
  }

  /**
   * Send a JSON request and return the raw response stream.
   * Used for endpoints that stream SSE frames (`text/event-stream`).
   */
  public async requestJsonStream(args: JsonRequestArgs): Promise<ReadableStream<Uint8Array>> {
    const headers = args.body !== undefined ? { 'content-type': 'application/json', ...(args.headers ?? {}) } : args.headers;

    const response = await this.executeRequest({
      endpoint: args.endpoint,
      method: args.method,
      query: args.query,
      body: args.body !== undefined ? JSON.stringify(args.body) : undefined,
      headers,
      signal: args.signal,
      timeoutMs: args.timeoutMs,
      idempotencyKey: args.idempotencyKey,
      retry: args.retry,
    });

    if (!response.ok) {
      const payload = await parseResponseBody(response);
      throw this.toApiError(response, args.method, args.endpoint, payload);
    }

    if (!response.body) {
      throw new SandboxApiError({
        status: response.status,
        message: 'Expected a response stream but received an empty body',
        endpoint: `${args.method} ${args.endpoint}`,
        responseBody: null,
        requestId: getRequestId(response),
      });
    }

    return response.body;
  }

  /**
   * Request a binary response stream (for file downloads).
   * Throws if the API returns an error status.
   */
  public async requestStream(args: RequestOptions & { endpoint: string; method: HttpMethod; query?: URLSearchParams }): Promise<ReadableStream<Uint8Array>> {
    const response = await this.executeRequest({
      endpoint: args.endpoint,
      method: args.method,
      query: args.query,
      signal: args.signal,
      timeoutMs: args.timeoutMs,
      idempotencyKey: args.idempotencyKey,
      retry: args.retry,
    });

    if (!response.ok) {
      const payload = await parseResponseBody(response);
      throw this.toApiError(response, args.method, args.endpoint, payload);
    }

    if (!response.body) {
      throw new SandboxApiError({
        status: response.status,
        message: 'Expected a response stream but received an empty body',
        endpoint: `${args.method} ${args.endpoint}`,
        responseBody: null,
        requestId: getRequestId(response),
      });
    }

    return response.body;
  }

  private async executeRequest(args: {
    endpoint: string;
    method: HttpMethod;
    query?: URLSearchParams;
    body?: string | ReadableStream<Uint8Array> | Buffer | Uint8Array;
    headers?: Record<string, string>;
    signal?: AbortSignal;
    timeoutMs?: number;
    idempotencyKey?: string;
    retry?: RetryOptions | false;
  }): Promise<Response> {
    const timeoutMs = args.timeoutMs ?? this.timeoutMs;
    const retryConfig = mergeRetryConfig(this.retry, args.retry);
    const canRetryMethod = canRetryByMethod(args.method, retryConfig.retryMethods, args.idempotencyKey);
    const replayableBody = canRetryBody(args.body);

    let lastError: unknown;

    for (let attempt = 1; attempt <= retryConfig.maxAttempts; attempt += 1) {
      const { signal, cleanup } = maybeJoinSignal(args.signal, timeoutMs);

      try {
        const response = await this.fetchImpl(buildUrl(this.baseUrl, args.endpoint, args.query), {
          method: args.method,
          headers: {
            'x-brimble-key': buildApiKeyHeader(this.apiKey),
            source: 'sdk-package',
            'source-version': SDK_PACKAGE_VERSION,
            ...(args.idempotencyKey ? { 'idempotency-key': args.idempotencyKey } : {}),
            ...(args.headers ?? {}),
          },
          body: args.body as BodyInit | undefined,
          signal,
        });

        const shouldRetry =
          attempt < retryConfig.maxAttempts &&
          canRetryMethod &&
          replayableBody &&
          retryConfig.retryStatuses.includes(response.status) &&
          !signal.aborted;

        if (shouldRetry) {
          await sleep(computeRetryDelayMs(attempt, retryConfig.baseDelayMs, retryConfig.maxDelayMs));
          continue;
        }

        return response;
      } catch (error) {
        lastError = error;

        const shouldRetry =
          attempt < retryConfig.maxAttempts &&
          canRetryMethod &&
          replayableBody &&
          !isAbortError(error) &&
          !(args.signal?.aborted ?? false);

        if (!shouldRetry) {
          throw error;
        }

        await sleep(computeRetryDelayMs(attempt, retryConfig.baseDelayMs, retryConfig.maxDelayMs));
      } finally {
        cleanup();
      }
    }

    if (lastError) {
      throw lastError;
    }

    throw new Error('HTTP request failed before receiving a response.');
  }

  private toApiError(response: Response, method: HttpMethod, endpoint: string, responseBody: unknown): SandboxApiError {
    let message = response.statusText || 'Sandbox API request failed';

    if (hasMessage(responseBody)) {
      message = responseBody.message;
    } else if (typeof responseBody === 'string' && responseBody.trim().length > 0) {
      message = responseBody;
    }

    const baseArgs = {
      status: response.status,
      message,
      endpoint: `${method} ${endpoint}`,
      responseBody,
      requestId: getRequestId(response),
    };

    if (response.status === 401 || response.status === 403) {
      return new AuthError(baseArgs);
    }

    if (response.status === 400 || response.status === 422) {
      return new ValidationError(baseArgs);
    }

    if (response.status === 404) {
      return new NotFoundError(baseArgs);
    }

    if (response.status === 429) {
      return new RateLimitError({
        ...baseArgs,
        retryAfterSeconds: parseRetryAfterSeconds(response.headers.get('retry-after')),
      });
    }

    return new SandboxApiError(baseArgs);
  }
}
