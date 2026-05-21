import type { RequestOptions } from '../transport/http';
import { HttpTransport } from '../transport/http';
import { toPaginationQuery } from '../transport/pagination';
import type { CreateSnapshotInput, Paginated, Pagination, Snapshot } from '../types';
import { DEFAULT_PAGE, DEFAULT_PAGE_LIMIT } from '../constants';

export class SnapshotScopeResource {
  private readonly transport: HttpTransport;
  private readonly sandboxId: string;

  /** @internal Create a sandbox-scoped snapshots wrapper. */
  public constructor(transport: HttpTransport, sandboxId: string) {
    this.transport = transport;
    this.sandboxId = sandboxId;
  }

  /** Create a snapshot for this specific sandbox. */
  public create(input: CreateSnapshotInput, options?: RequestOptions): Promise<Snapshot> {
    return this.transport.requestJson<Snapshot>({
      endpoint: `/sandboxes/${this.sandboxId}/snapshots`,
      method: 'POST',
      body: input,
      ...options,
    }) as Promise<Snapshot>;
  }

  /** List snapshots for this specific sandbox. */
  public list(query: Pagination = {}, options?: RequestOptions): Promise<Paginated<Snapshot>> {
    return this.transport.requestJson<Paginated<Snapshot>>({
      endpoint: `/sandboxes/${this.sandboxId}/snapshots`,
      method: 'GET',
      query: toPaginationQuery(query),
      ...options,
    }) as Promise<Paginated<Snapshot>>;
  }

  /** Iterate over all snapshots for this sandbox across pages. */
  public async *iterate(query: Pagination = {}, options?: RequestOptions): AsyncGenerator<Snapshot> {
    const limit = query.limit ?? DEFAULT_PAGE_LIMIT;
    let page = query.page ?? DEFAULT_PAGE;

    while (true) {
      const paginated = await this.list({ ...query, page, limit }, options);

      for (const snapshot of paginated.data) {
        yield snapshot;
      }

      if (page >= paginated.totalPages || paginated.data.length === 0) {
        return;
      }

      page += 1;
    }
  }
}

export class SnapshotsResource {
  private readonly transport: HttpTransport;

  /** @internal Create the global snapshots resource wrapper. */
  public constructor(transport: HttpTransport) {
    this.transport = transport;
  }

  /** List all snapshots owned by the current caller. */
  public listAll(query: Pagination = {}, options?: RequestOptions): Promise<Paginated<Snapshot>> {
    return this.transport.requestJson<Paginated<Snapshot>>({
      endpoint: '/sandboxes/snapshots',
      method: 'GET',
      query: toPaginationQuery(query),
      ...options,
    }) as Promise<Paginated<Snapshot>>;
  }

  /** Iterate over all snapshots owned by the caller across pages. */
  public async *iterateAll(query: Pagination = {}, options?: RequestOptions): AsyncGenerator<Snapshot> {
    const limit = query.limit ?? DEFAULT_PAGE_LIMIT;
    let page = query.page ?? DEFAULT_PAGE;

    while (true) {
      const paginated = await this.listAll({ ...query, page, limit }, options);

      for (const snapshot of paginated.data) {
        yield snapshot;
      }

      if (page >= paginated.totalPages || paginated.data.length === 0) {
        return;
      }

      page += 1;
    }
  }

  /** Delete a snapshot by id. */
  public async delete(snapshotId: string, options?: RequestOptions): Promise<void> {
    await this.transport.requestJson({
      endpoint: `/sandboxes/snapshots/${snapshotId}`,
      method: 'DELETE',
      ...options,
    });
  }
}
