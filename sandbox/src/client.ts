import { DEFAULT_BASE_URL, DEFAULT_TIMEOUT_MS, SANDBOX_API_KEY_ENV_NAME } from './constants';
import { SandboxesResource, SnapshotsResource, VolumesResource } from './resources';
import { HttpTransport } from './transport/http';
import type { RetryOptions } from './transport/http';

export type SandboxOptions = {
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
  retry?: RetryOptions;
  fetchImpl?: typeof fetch;
};

/**
 * Resolves the API key from the constructor options first,
 * then falls back to BRIMBLE_SANDBOX_KEY.
 */
function resolveApiKey(options: SandboxOptions): string {
  if (options.apiKey) {
    return options.apiKey;
  }

  const apiKeyFromEnv = process.env[SANDBOX_API_KEY_ENV_NAME];

  if (apiKeyFromEnv) {
    return apiKeyFromEnv;
  }

  throw new Error(
    `Sandbox API key is required. Pass "apiKey" explicitly or set ${SANDBOX_API_KEY_ENV_NAME} in your environment.`,
  );
}

export class Sandbox {
  /** Access sandbox lifecycle and per-sandbox scoped operations. */
  public readonly sandboxes: SandboxesResource;
  /** Access account-level snapshot operations. */
  public readonly snapshots: SnapshotsResource;
  /** Access volume lifecycle operations. */
  public readonly volumes: VolumesResource;

  private readonly transport: HttpTransport;

  /**
   * Creates a client instance for the Brimble Sandbox API.
   * Pass `apiKey` directly or set `BRIMBLE_SANDBOX_KEY` in your environment.
   */
  public constructor(options: SandboxOptions = {}) {
    this.transport = new HttpTransport({
      apiKey: resolveApiKey(options),
      baseUrl: options.baseUrl ?? DEFAULT_BASE_URL,
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      retry: options.retry,
      fetchImpl: options.fetchImpl,
    });

    this.sandboxes = new SandboxesResource(this.transport);
    this.snapshots = new SnapshotsResource(this.transport);
    this.volumes = new VolumesResource(this.transport);
  }
}
