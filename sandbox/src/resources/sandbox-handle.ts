import {
  DEFAULT_SANDBOX_LONG_POLL_TIMEOUT_SECONDS,
  DEFAULT_SANDBOX_READY_TIMEOUT_MS,
  DEFAULT_SANDBOX_WAIT_POLL_INTERVAL_MS,
} from '../constants';
import { SandboxStatus } from '../enums';
import { NotFoundError } from '../errors';
import type { RequestOptions } from '../transport/http';
import type {
  AckMessage,
  BatchFileUploadInput,
  BatchFileUploadResponse,
  CodeInput,
  CreateSandboxResult,
  CreateSnapshotInput,
  ExecInput,
  ExecResult,
  FileUploadBody,
  Paginated,
  Pagination,
  Sandbox,
  SandboxRuntimeOptions,
  Snapshot,
  Stats,
  StatsQuery,
  WaitPreference,
  WaitUntilReadyOptions,
  UpdateSandboxEgressInput,
} from '../types';
import { ScopedSandboxResource } from './scoped-sandbox';
import type { SandboxesResource } from './sandboxes';
import type { ExecStream } from '../streaming';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export class SandboxHandle {
  private readonly sandboxes: SandboxesResource;
  private readonly scope: ScopedSandboxResource;
  private sandboxState: Sandbox | CreateSandboxResult;

  /** Snapshot operations grouped under a dedicated namespace. */
  public readonly snapshots: {
    create: (input: CreateSnapshotInput, options?: RequestOptions) => Promise<Snapshot>;
    list: (query?: Pagination, options?: RequestOptions) => Promise<Paginated<Snapshot>>;
  };

  /** @internal Create a sandbox handle from create/get responses. */
  public constructor(sandboxes: SandboxesResource, state: Sandbox | CreateSandboxResult) {
    this.sandboxes = sandboxes;
    this.sandboxState = state;
    this.scope = this.sandboxes.use(state.id);

    this.snapshots = {
      create: (input, options) => this.createSnapshot(input, options),
      list: (query = {}, options) => this.listSnapshots(query, options),
    };
  }

  /** Current sandbox id. */
  public get id(): string {
    return this.sandboxState.id;
  }

  /** Current cached sandbox status. */
  public get status(): SandboxStatus {
    return this.sandboxState.status;
  }

  /** Current cached sandbox payload. */
  public get data(): Sandbox | CreateSandboxResult {
    return this.sandboxState;
  }

  /** Refresh sandbox details from the API and update local state. */
  public async refresh(options?: RequestOptions): Promise<Sandbox> {
    const sandbox = await this.sandboxes.getData(this.id, options);
    this.sandboxState = sandbox;
    return sandbox;
  }

  /** Destroy this sandbox (idempotent). */
  public async destroy(options?: RequestOptions): Promise<void> {
    await this.sandboxes.destroy(this.id, options);
  }

  /** Request pause for this sandbox and refresh cached state. */
  public async pause(options?: RequestOptions): Promise<AckMessage | undefined> {
    const response = await this.sandboxes.pause(this.id, options);
    await this.refresh(options);
    return response;
  }

  /** Request resume for this sandbox and refresh cached state. */
  public async resume(options?: RequestOptions): Promise<AckMessage | undefined> {
    const response = await this.sandboxes.resume(this.id, options);
    await this.refresh(options);
    return response;
  }

  /** Update outbound network policy for this sandbox and refresh local state. */
  public async updateEgress(input: UpdateSandboxEgressInput, options?: RequestOptions): Promise<Sandbox> {
    const sandbox = await this.sandboxes.updateEgress(this.id, input, options);
    this.sandboxState = sandbox;
    return sandbox;
  }

  /**
   * Wait until the sandbox becomes `ready`.
   * Uses server long-poll when available; falls back to fast polling on 404.
   */
  public async waitUntilReady(options: WaitUntilReadyOptions = {}): Promise<Sandbox> {
    if (this.status === SandboxStatus.Ready) {
      return this.refresh({ signal: options.signal });
    }

    const timeoutMs = options.timeoutMs ?? DEFAULT_SANDBOX_READY_TIMEOUT_MS;
    const deadline = Date.now() + timeoutMs;

    while (true) {
      if (options.signal?.aborted) {
        throw new Error('waitUntilReady aborted by signal');
      }

      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) {
        throw new Error(`Sandbox ${this.id} did not become ready within ${timeoutMs}ms`);
      }

      const waitSeconds = Math.min(
        DEFAULT_SANDBOX_LONG_POLL_TIMEOUT_SECONDS,
        Math.max(1, Math.ceil(remainingMs / 1000)),
      );

      try {
        const sandbox = await this.sandboxes.waitData(
          this.id,
          { timeoutSeconds: waitSeconds, status: SandboxStatus.Ready },
          { signal: options.signal },
        );
        this.sandboxState = sandbox;
        if (sandbox.status === SandboxStatus.Ready) {
          return sandbox;
        }
        if (sandbox.status === SandboxStatus.Failed) {
          throw new Error(`Sandbox ${this.id} failed to provision`);
        }
      } catch (error) {
        if (error instanceof NotFoundError) {
          return this.pollUntilReady(options, deadline);
        }
        throw error;
      }
    }
  }

  private async pollUntilReady(options: WaitUntilReadyOptions, deadline: number): Promise<Sandbox> {
    const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_SANDBOX_WAIT_POLL_INTERVAL_MS;

    while (true) {
      if (options.signal?.aborted) {
        throw new Error('waitUntilReady aborted by signal');
      }

      const sandbox = await this.refresh({ signal: options.signal });
      if (sandbox.status === SandboxStatus.Ready) {
        return sandbox;
      }
      if (sandbox.status === SandboxStatus.Failed) {
        throw new Error(`Sandbox ${this.id} failed to provision`);
      }

      if (Date.now() >= deadline) {
        const timeoutMs = options.timeoutMs ?? DEFAULT_SANDBOX_READY_TIMEOUT_MS;
        throw new Error(`Sandbox ${this.id} did not become ready within ${timeoutMs}ms`);
      }

      await delay(pollIntervalMs);
    }
  }

  /**
   * Run a shell command in this sandbox.
   * By default this throws when not ready; set `waitUntilReady` to auto-wait.
   */
  public exec(input: ExecInput & { stream: true }, options?: SandboxRuntimeOptions): Promise<ExecStream>;
  public exec(input: ExecInput, options?: SandboxRuntimeOptions): Promise<ExecResult>;
  public async exec(input: ExecInput, options: SandboxRuntimeOptions = {}): Promise<ExecResult | ExecStream> {
    await this.ensureReady(options.waitUntilReady);
    return this.scope.exec(input, options);
  }

  /**
   * Run a code snippet in this sandbox.
   * By default this throws when not ready; set `waitUntilReady` to auto-wait.
   */
  public runCode(input: CodeInput & { stream: true }, options?: SandboxRuntimeOptions): Promise<ExecStream>;
  public runCode(input: CodeInput, options?: SandboxRuntimeOptions): Promise<ExecResult>;
  public async runCode(input: CodeInput, options: SandboxRuntimeOptions = {}): Promise<ExecResult | ExecStream> {
    await this.ensureReady(options.waitUntilReady);
    return this.scope.runCode(input, options);
  }

  /**
   * Upload a file into this sandbox.
   * By default this throws when not ready; set `waitUntilReady` to auto-wait.
   */
  public async putFile(path: string, body: FileUploadBody, options: SandboxRuntimeOptions = {}): Promise<void> {
    await this.ensureReady(options.waitUntilReady);
    await this.scope.putFile(path, body, options);
  }

  /**
   * Download a file from this sandbox.
   * By default this throws when not ready; set `waitUntilReady` to auto-wait.
   */
  public async getFile(path: string, options: SandboxRuntimeOptions = {}): Promise<AsyncIterable<Uint8Array>> {
    await this.ensureReady(options.waitUntilReady);
    return this.scope.getFile(path, options);
  }

  /**
   * Upload multiple files in one call.
   * By default this throws when not ready; set `waitUntilReady` to auto-wait.
   */
  public async putFiles(files: BatchFileUploadInput[], options: SandboxRuntimeOptions = {}): Promise<BatchFileUploadResponse> {
    await this.ensureReady(options.waitUntilReady);
    return this.scope.putFiles(files, options);
  }

  /**
   * Fetch usage stats for this sandbox.
   * By default this throws when not ready; set `waitUntilReady` to auto-wait.
   */
  public async stats(query: StatsQuery = {}, options: SandboxRuntimeOptions = {}): Promise<Stats> {
    await this.ensureReady(options.waitUntilReady);
    return this.scope.stats(query, options);
  }

  /**
   * Create a snapshot for this sandbox.
   * By default this throws when not ready; set `waitUntilReady` to auto-wait.
   */
  public async createSnapshot(input: CreateSnapshotInput, options: SandboxRuntimeOptions = {}): Promise<Snapshot> {
    await this.ensureReady(options.waitUntilReady);
    return this.scope.createSnapshot(input, options);
  }

  /**
   * List snapshots for this sandbox.
   * By default this throws when not ready; set `waitUntilReady` to auto-wait.
   */
  public async listSnapshots(query: Pagination = {}, options: SandboxRuntimeOptions = {}): Promise<Paginated<Snapshot>> {
    await this.ensureReady(options.waitUntilReady);
    return this.scope.listSnapshots(query, options);
  }

  private async ensureReady(waitUntilReady: WaitPreference | undefined): Promise<void> {
    if (this.status === SandboxStatus.Ready) {
      return;
    }

    if (waitUntilReady) {
      if (typeof waitUntilReady === 'object') {
        await this.waitUntilReady(waitUntilReady);
        return;
      }

      await this.waitUntilReady();
      return;
    }

    this.assertReady();
  }

  private assertReady(): void {
    if (this.status !== SandboxStatus.Ready) {
      throw new Error(`Sandbox ${this.id} is ${this.status}. Call waitUntilReady() or refresh() before runtime operations.`);
    }
  }
}
