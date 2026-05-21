import type { Stats, StatsQuery } from '../types';
import type { RequestOptions } from '../transport/http';
import { HttpTransport } from '../transport/http';

export class StatsResource {
  private readonly transport: HttpTransport;
  private readonly sandboxId: string;

  /** @internal Create the stats wrapper for one sandbox. */
  public constructor(transport: HttpTransport, sandboxId: string) {
    this.transport = transport;
    this.sandboxId = sandboxId;
  }

  /** Fetch sandbox usage stats for a lookback window. */
  public stats(query: StatsQuery = {}, options?: RequestOptions): Promise<Stats> {
    const params = new URLSearchParams();

    if (query.hoursAgo !== undefined) {
      params.set('hoursAgo', String(query.hoursAgo));
    }

    return this.transport.requestJson<Stats>({
      endpoint: `/sandboxes/${this.sandboxId}/stats`,
      method: 'GET',
      query: params,
      ...options,
    }) as Promise<Stats>;
  }
}
