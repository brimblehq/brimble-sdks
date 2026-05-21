import { ExecResource } from './exec';
import { FilesResource } from './files';
import { SnapshotScopeResource } from './snapshots';
import { StatsResource } from './stats';
import { HttpTransport } from '../transport/http';
import type {
  BatchFileUploadInput,
  BatchFileUploadResponse,
  CodeInput,
  CreateSnapshotInput,
  ExecInput,
  ExecResult,
  FileUploadBody,
  Paginated,
  Pagination,
  Snapshot,
  Stats,
  StatsQuery,
} from '../types';
import type { RequestOptions } from '../transport/http';

export class ScopedSandboxResource {
  /** Lower-level exec/code runner resource. */
  public readonly execResource: ExecResource;
  /** File upload/download resource. */
  public readonly files: FilesResource;
  /** Snapshot resource scoped to this sandbox. */
  public readonly snapshots: SnapshotScopeResource;
  /** Stats resource scoped to this sandbox. */
  public readonly statsResource: StatsResource;

  /** @internal Create a sandbox-scoped resource wrapper. */
  public constructor(transport: HttpTransport, sandboxId: string) {
    this.execResource = new ExecResource(transport, sandboxId);
    this.files = new FilesResource(transport, sandboxId);
    this.snapshots = new SnapshotScopeResource(transport, sandboxId);
    this.statsResource = new StatsResource(transport, sandboxId);
  }

  /** Run a shell command in this sandbox. */
  public exec(input: ExecInput & { stream: true }, options?: RequestOptions): Promise<ReadableStream<Uint8Array>>;
  public exec(input: ExecInput, options?: RequestOptions): Promise<ExecResult>;
  public exec(input: ExecInput, options?: RequestOptions): Promise<ExecResult | ReadableStream<Uint8Array>> {
    return this.execResource.exec(input, options);
  }

  /** Run a code snippet in this sandbox. */
  public runCode(input: CodeInput & { stream: true }, options?: RequestOptions): Promise<ReadableStream<Uint8Array>>;
  public runCode(input: CodeInput, options?: RequestOptions): Promise<ExecResult>;
  public runCode(input: CodeInput, options?: RequestOptions): Promise<ExecResult | ReadableStream<Uint8Array>> {
    return this.execResource.runCode(input, options);
  }

  /** Upload bytes to a file path inside this sandbox. */
  public putFile(path: string, body: FileUploadBody, options?: RequestOptions): Promise<void> {
    return this.files.put(path, body, options);
  }

  /** Download file bytes from this sandbox as a stream. */
  public getFile(path: string, options?: RequestOptions): Promise<ReadableStream<Uint8Array>> {
    return this.files.get(path, options);
  }

  /** Upload multiple files to this sandbox in one request. */
  public putFiles(files: BatchFileUploadInput[], options?: RequestOptions): Promise<BatchFileUploadResponse> {
    return this.files.putFiles(files, options);
  }

  /** Fetch CPU, memory, and network stats for this sandbox. */
  public stats(query: StatsQuery = {}, options?: RequestOptions): Promise<Stats> {
    return this.statsResource.stats(query, options);
  }

  /** Create a snapshot for this sandbox. */
  public createSnapshot(input: CreateSnapshotInput, options?: RequestOptions): Promise<Snapshot> {
    return this.snapshots.create(input, options);
  }

  /** List snapshots for this sandbox. */
  public listSnapshots(query: Pagination = {}, options?: RequestOptions): Promise<Paginated<Snapshot>> {
    return this.snapshots.list(query, options);
  }
}
