import { DEFAULT_PAGE, DEFAULT_PAGE_LIMIT } from '../constants';
import { VolumeType } from '../enums';
import type { RequestOptions } from '../transport/http';
import { HttpTransport } from '../transport/http';
import { toPaginationQuery } from '../transport/pagination';
import type {
  AckMessage,
  CreateSandboxRequest,
  CreateSandboxResult,
  CreateSandboxWithVolumeInput,
  CreateVolumeInput,
  Paginated,
  Sandbox,
  SandboxReadyRequestOptions,
  SandboxRegionInput,
  SandboxRegionsResult,
  SandboxTemplate,
  TeamScopedPagination,
  UpdateSandboxEgressInput,
  Volume,
  WaitPreference,
} from '../types';
import { SandboxHandle } from './sandbox-handle';
import { ScopedSandboxResource } from './scoped-sandbox';
import { VolumesResource } from './volumes';

export type QuickstartSandboxInput = Omit<CreateSandboxRequest, 'template' | 'persistent' | 'persistentDiskGB'> & {
  template?: string;
  persistentDiskGB?: number;
  waitUntilReady?: WaitPreference;
};

const MOUNT_PATH_PATTERN = /^\/[A-Za-z0-9._/-]*$/;

export class SandboxesResource {
  private readonly transport: HttpTransport;
  private readonly volumes: VolumesResource;

  /** @internal Create the sandboxes resource wrapper. */
  public constructor(transport: HttpTransport) {
    this.transport = transport;
    this.volumes = new VolumesResource(transport);
  }

  /**
   * Create a new sandbox.
   * Region is optional; when omitted the API assigns an enabled sandbox region.
   * Pass a region slug (e.g. `eu-west`) or id to pin placement.
   * The sandbox starts asynchronously — use `waitUntilReady()` before runtime operations.
   */
  public async create(input: CreateSandboxRequest, options?: RequestOptions): Promise<SandboxHandle> {
    const body = this.buildCreateBody(input);
    this.applyMountPathDefault(body);
    this.validateMountPath(body);

    const result = (await this.transport.requestJson<CreateSandboxResult>({
      endpoint: '/sandboxes',
      method: 'POST',
      body,
      ...options,
    })) as CreateSandboxResult;

    return new SandboxHandle(this, result);
  }

  /** Create a sandbox and wait until it is `ready` before returning it. */
  public async createReady(input: CreateSandboxRequest, options: SandboxReadyRequestOptions = {}): Promise<SandboxHandle> {
    const sandbox = await this.create(input, options.request);
    await sandbox.waitUntilReady(options.wait);
    return sandbox;
  }

  /**
   * Create a volume and then create a sandbox attached to that volume.
   * This is the one-call helper for persistent sandbox workflows.
   */
  public async withVolume(input: CreateSandboxWithVolumeInput, options?: RequestOptions): Promise<SandboxHandle> {
    const region = await this.resolveRegionId(input.sandbox.region ?? input.volume.region, options);

    const volume = await this.volumes.create(
      {
        ...input.volume,
        region,
        type: VolumeType.Sandbox,
      },
      options,
    );

    return this.create(
      {
        ...input.sandbox,
        region,
        volumeId: volume.id,
      },
      options,
    );
  }

  /** Create a sandbox-scoped volume with package-level defaults and validation. */
  public createVolume(input: CreateVolumeInput, options?: RequestOptions): Promise<Volume> {
    return this.volumes.create(input, options);
  }

  /** List your sandboxes with pagination. */
  public async list(query: TeamScopedPagination = {}, options?: RequestOptions): Promise<Paginated<SandboxHandle>> {
    const page = await this.listData(query, options);

    return {
      ...page,
      data: page.data.map((sandbox) => new SandboxHandle(this, sandbox)),
    };
  }

  /** Iterate over all sandbox handles across paginated results. */
  public async *iterate(query: TeamScopedPagination = {}, options?: RequestOptions): AsyncGenerator<SandboxHandle> {
    const limit = query.limit ?? DEFAULT_PAGE_LIMIT;
    let page = query.page ?? DEFAULT_PAGE;

    while (true) {
      const paginated = await this.list({ ...query, page, limit }, options);

      for (const sandbox of paginated.data) {
        yield sandbox;
      }

      if (page >= paginated.totalPages || paginated.data.length === 0) {
        return;
      }

      page += 1;
    }
  }

  /** Fetch one sandbox handle by id. */
  public async get(sandboxId: string, options?: RequestOptions): Promise<SandboxHandle> {
    const sandbox = await this.getData(sandboxId, options);
    return new SandboxHandle(this, sandbox);
  }

  /** Fetch one sandbox and wait for `ready` before returning the handle. */
  public async getReady(sandboxId: string, options: SandboxReadyRequestOptions = {}): Promise<SandboxHandle> {
    const sandbox = await this.get(sandboxId, options.request);
    await sandbox.waitUntilReady(options.wait);
    return sandbox;
  }

  /** @internal Fetch raw sandbox payload by id. */
  public getData(sandboxId: string, options?: RequestOptions): Promise<Sandbox> {
    return this.transport.requestJson<Sandbox>({
      endpoint: `/sandboxes/${sandboxId}`,
      method: 'GET',
      ...options,
    }) as Promise<Sandbox>;
  }

  /**
   * Long-poll until the sandbox reaches a terminal provisioning status.
   * Falls back to the caller when the API does not support long-poll (404).
   */
  public async waitData(
    sandboxId: string,
    query: { timeoutSeconds?: number; status?: string } = {},
    options?: RequestOptions,
  ): Promise<Sandbox> {
    const params = new URLSearchParams();
    if (query.timeoutSeconds !== undefined) {
      params.set('timeout', String(query.timeoutSeconds));
    }
    if (query.status) {
      params.set('status', query.status);
    }

    return this.transport.requestJson<Sandbox>({
      endpoint: `/sandboxes/${sandboxId}/wait`,
      method: 'GET',
      query: params,
      timeoutMs: ((query.timeoutSeconds ?? 60) + 5) * 1000,
      ...options,
    }) as Promise<Sandbox>;
  }

  /** @internal Fetch raw paginated sandbox payload. */
  public listData(query: TeamScopedPagination = {}, options?: RequestOptions): Promise<Paginated<Sandbox>> {
    const params = toPaginationQuery(query);

    if (query.teamId) {
      params.set('teamId', query.teamId);
    }

    return this.transport.requestJson<Paginated<Sandbox>>({
      endpoint: '/sandboxes',
      method: 'GET',
      query: params,
      ...options,
    }) as Promise<Paginated<Sandbox>>;
  }

  /** List regions where sandboxes can be provisioned. */
  public listRegions(options?: RequestOptions): Promise<SandboxRegionsResult> {
    return this.transport.requestJson<SandboxRegionsResult>({
      endpoint: '/sandboxes/regions',
      method: 'GET',
      ...options,
    }) as Promise<SandboxRegionsResult>;
  }

  /** List sandbox templates available for create operations. */
  public async listTemplates(options?: RequestOptions): Promise<SandboxTemplate[]> {
    const payload = await this.transport.requestJson<unknown>({
      endpoint: '/sandbox/templates',
      method: 'GET',
      ...options,
    });

    if (Array.isArray(payload)) {
      return payload as SandboxTemplate[];
    }

    if (payload && typeof payload === 'object' && 'templates' in payload) {
      const templates = (payload as { templates?: unknown }).templates;
      if (Array.isArray(templates)) {
        return templates as SandboxTemplate[];
      }
    }

    return [];
  }

  /** Fetch one template by name from the template catalog. */
  public async getTemplate(templateName: string, options?: RequestOptions): Promise<SandboxTemplate | undefined> {
    const templates = await this.listTemplates(options);
    return templates.find((template) => template.name === templateName);
  }

  /** Destroy a sandbox (idempotent). */
  public async destroy(sandboxId: string, options?: RequestOptions): Promise<void> {
    await this.transport.requestJson({
      endpoint: `/sandboxes/${sandboxId}`,
      method: 'DELETE',
      ...options,
    });
  }

  /** Request sandbox pause. */
  public pause(sandboxId: string, options?: RequestOptions): Promise<AckMessage | undefined> {
    return this.transport.requestJson<AckMessage>({
      endpoint: `/sandboxes/${sandboxId}/pause`,
      method: 'POST',
      ...options,
    });
  }

  /** Request sandbox resume. */
  public resume(sandboxId: string, options?: RequestOptions): Promise<AckMessage | undefined> {
    return this.transport.requestJson<AckMessage>({
      endpoint: `/sandboxes/${sandboxId}/resume`,
      method: 'POST',
      ...options,
    });
  }

  /** Update sandbox outbound network policy. */
  public updateEgress(
    sandboxId: string,
    input: UpdateSandboxEgressInput,
    options?: RequestOptions,
  ): Promise<Sandbox> {
    return this.transport.requestJson<Sandbox>({
      endpoint: `/sandboxes/${sandboxId}/egress`,
      method: 'PUT',
      body: input,
      ...options,
    }) as Promise<Sandbox>;
  }

  /** Use runtime operations for a specific sandbox id. */
  public use(sandboxId: string): ScopedSandboxResource {
    return new ScopedSandboxResource(this.transport, sandboxId);
  }

  /** Opinionated Node.js quickstart (persistent sandbox + optional wait). */
  public async quickstartNode(input: QuickstartSandboxInput = {}, options?: RequestOptions): Promise<SandboxHandle> {
    return this.quickstart({
      ...input,
      template: input.template ?? 'node-22',
      persistentDiskGB: input.persistentDiskGB ?? 20,
    }, options);
  }

  /** Opinionated Python quickstart (persistent sandbox + optional wait). */
  public async quickstartPython(input: QuickstartSandboxInput = {}, options?: RequestOptions): Promise<SandboxHandle> {
    return this.quickstart({
      ...input,
      template: input.template ?? 'python-3.12',
      persistentDiskGB: input.persistentDiskGB ?? 20,
    }, options);
  }

  private async quickstart(input: QuickstartSandboxInput, options?: RequestOptions): Promise<SandboxHandle> {
    const { waitUntilReady, persistentDiskGB, ...createInput } = input;

    const sandbox = await this.create(
      {
        ...createInput,
        persistent: true,
        persistentDiskGB,
        mountPath: createInput.mountPath ?? '/workspace',
      },
      options,
    );

    if (waitUntilReady === false) {
      return sandbox;
    }

    if (typeof waitUntilReady === 'object') {
      await sandbox.waitUntilReady(waitUntilReady);
      return sandbox;
    }

    await sandbox.waitUntilReady();
    return sandbox;
  }

  private async resolveRegionId(region: SandboxRegionInput | undefined, options?: RequestOptions): Promise<string> {
    if (region && region !== 'auto') {
      return region;
    }

    const { regions } = await this.listRegions(options);
    const regionId = regions[0]?.id;

    if (!regionId) {
      throw new Error('No sandbox regions available for this account.');
    }

    return regionId;
  }

  private buildCreateBody(input: CreateSandboxRequest): CreateSandboxRequest {
    const body: CreateSandboxRequest = { ...input };

    if (!body.region || body.region === 'auto') {
      delete body.region;
    }

    return body;
  }

  private validateMountPath(input: CreateSandboxRequest): void {
    const hasPersistentVolume = input.persistent === true;
    const hasExistingVolume = typeof input.volumeId === 'string' && input.volumeId.length > 0;
    const hasStorage = hasPersistentVolume || hasExistingVolume;
    const hasMountPath = typeof input.mountPath === 'string' && input.mountPath.length > 0;

    if (hasStorage && !hasMountPath) {
      throw new Error('mountPath is required when using persistent storage (`persistent`/`persistentDiskGB` or `volumeId`).');
    }

    if (!hasMountPath) {
      return;
    }

    if (!MOUNT_PATH_PATTERN.test(input.mountPath as string) || input.mountPath === '/') {
      throw new Error('mountPath must match ^/[A-Za-z0-9._/-]*$ and cannot be "/".');
    }

    if (!hasPersistentVolume && !hasExistingVolume) {
      throw new Error('mountPath requires either `persistent: true` or `volumeId`.');
    }
  }

  private applyMountPathDefault(input: CreateSandboxRequest): void {
    const hasPersistentVolume = input.persistent === true;
    const hasExistingVolume = typeof input.volumeId === 'string' && input.volumeId.length > 0;
    const hasStorage = hasPersistentVolume || hasExistingVolume;
    const hasMountPath = typeof input.mountPath === 'string' && input.mountPath.length > 0;

    if (hasStorage && !hasMountPath) {
      input.mountPath = '/workspace';
    }
  }
}
