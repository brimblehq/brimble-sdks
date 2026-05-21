import type { RequestOptions } from '../transport/http';
import { HttpTransport } from '../transport/http';
import { toPaginationQuery } from '../transport/pagination';
import { VolumeType } from '../enums';
import { DEFAULT_PAGE, DEFAULT_PAGE_LIMIT, MIN_VOLUME_SIZE_GB } from '../constants';
import type { CreateVolumeInput, Paginated, TeamScopedPagination, Volume } from '../types';

export class VolumesResource {
  private readonly transport: HttpTransport;

  /** @internal Create the volumes resource wrapper. */
  public constructor(transport: HttpTransport) {
    this.transport = transport;
  }

  /** List your volumes with pagination. */
  public list(query: TeamScopedPagination = {}, options?: RequestOptions): Promise<Paginated<Volume>> {
    const params = toPaginationQuery(query);

    if (query.teamId) {
      params.set('teamId', query.teamId);
    }

    return this.transport.requestJson<Paginated<Volume>>({
      endpoint: '/volumes',
      method: 'GET',
      query: params,
      ...options,
    }) as Promise<Paginated<Volume>>;
  }

  /** Iterate over all volumes across paginated results. */
  public async *iterate(query: TeamScopedPagination = {}, options?: RequestOptions): AsyncGenerator<Volume> {
    const limit = query.limit ?? DEFAULT_PAGE_LIMIT;
    let page = query.page ?? DEFAULT_PAGE;

    while (true) {
      const paginated = await this.list({ ...query, page, limit }, options);

      for (const volume of paginated.data) {
        yield volume;
      }

      if (page >= paginated.totalPages || paginated.data.length === 0) {
        return;
      }

      page += 1;
    }
  }

  /**
   * Create a new volume.
   * This SDK accepts only `type: "sandbox"` and defaults to it when omitted.
   */
  public create(input: CreateVolumeInput, options?: RequestOptions): Promise<Volume> {
    if (input.type && input.type !== VolumeType.Sandbox) {
      throw new Error('Only volume type "sandbox" is supported by this package.');
    }

    if (input.sizeGB < MIN_VOLUME_SIZE_GB) {
      throw new Error(`Volume size must be at least ${MIN_VOLUME_SIZE_GB}GB.`);
    }

    const body: CreateVolumeInput = {
      ...input,
      type: VolumeType.Sandbox,
    };

    return this.transport.requestJson<Volume>({
      endpoint: '/volumes',
      method: 'POST',
      body,
      ...options,
    }) as Promise<Volume>;
  }

  /** Fetch one volume by id. */
  public get(volumeId: string, options?: RequestOptions): Promise<Volume> {
    return this.transport.requestJson<Volume>({
      endpoint: `/volumes/${volumeId}`,
      method: 'GET',
      ...options,
    }) as Promise<Volume>;
  }

  /** Delete a volume by id. */
  public async delete(volumeId: string, options?: RequestOptions): Promise<void> {
    await this.transport.requestJson({
      endpoint: `/volumes/${volumeId}`,
      method: 'DELETE',
      ...options,
    });
  }
}
