import type { CodeInput, ExecInput, ExecResult } from '../types';
import type { RequestOptions } from '../transport/http';
import { HttpTransport } from '../transport/http';

export class ExecResource {
  private readonly transport: HttpTransport;
  private readonly sandboxId: string;

  /** @internal Create the exec/code runner wrapper for one sandbox. */
  public constructor(transport: HttpTransport, sandboxId: string) {
    this.transport = transport;
    this.sandboxId = sandboxId;
  }

  /** Run a shell command in the sandbox. */
  public exec(input: ExecInput & { stream: true }, options?: RequestOptions): Promise<ReadableStream<Uint8Array>>;
  public exec(input: ExecInput, options?: RequestOptions): Promise<ExecResult>;
  public exec(input: ExecInput, options?: RequestOptions): Promise<ExecResult | ReadableStream<Uint8Array>> {
    if (input.stream === true) {
      return this.transport.requestJsonStream({
        endpoint: `/sandboxes/${this.sandboxId}/exec`,
        method: 'POST',
        body: input,
        ...options,
      });
    }

    return this.transport.requestJson<ExecResult>({
      endpoint: `/sandboxes/${this.sandboxId}/exec`,
      method: 'POST',
      body: input,
      ...options,
    }) as Promise<ExecResult>;
  }

  /** Run a code snippet in the sandbox. */
  public runCode(input: CodeInput & { stream: true }, options?: RequestOptions): Promise<ReadableStream<Uint8Array>>;
  public runCode(input: CodeInput, options?: RequestOptions): Promise<ExecResult>;
  public runCode(input: CodeInput, options?: RequestOptions): Promise<ExecResult | ReadableStream<Uint8Array>> {
    if (input.stream === true) {
      return this.transport.requestJsonStream({
        endpoint: `/sandboxes/${this.sandboxId}/code`,
        method: 'POST',
        body: input,
        ...options,
      });
    }

    return this.transport.requestJson<ExecResult>({
      endpoint: `/sandboxes/${this.sandboxId}/code`,
      method: 'POST',
      body: input,
      ...options,
    }) as Promise<ExecResult>;
  }
}
