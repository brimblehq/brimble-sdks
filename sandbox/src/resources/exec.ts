import type { CodeInput, ExecInput, ExecResult } from '../types';
import type { JsonValue, RequestOptions } from '../transport/http';
import { HttpTransport } from '../transport/http';
import { consumeExecStream, ExecStream } from '../streaming';

function wantsLiveOutput(input: ExecInput | CodeInput): boolean {
  return Boolean(input.onStdout || input.onStderr);
}

function toRequestBody(input: ExecInput | CodeInput): JsonValue {
  const { onStdout: _onStdout, onStderr: _onStderr, ...payload } = input;
  return payload as JsonValue;
}

function toStreamBody(input: ExecInput | CodeInput): JsonValue {
  return { ...toRequestBody(input) as Record<string, JsonValue>, stream: true };
}

export class ExecResource {
  private readonly transport: HttpTransport;
  private readonly sandboxId: string;

  /** @internal Create the exec/code runner wrapper for one sandbox. */
  public constructor(transport: HttpTransport, sandboxId: string) {
    this.transport = transport;
    this.sandboxId = sandboxId;
  }

  /** Run a shell command in the sandbox. */
  public exec(input: ExecInput & { stream: true }, options?: RequestOptions): Promise<ExecStream>;
  public exec(input: ExecInput, options?: RequestOptions): Promise<ExecResult>;
  public exec(input: ExecInput, options?: RequestOptions): Promise<ExecResult | ExecStream> {
    if (input.stream === true) {
      return this.openExecStream(input, options);
    }

    if (wantsLiveOutput(input)) {
      return this.execWithCallbacks(input, options);
    }

    return this.transport.requestJson<ExecResult>({
      endpoint: `/sandboxes/${this.sandboxId}/exec`,
      method: 'POST',
      body: toRequestBody(input),
      ...options,
    }) as Promise<ExecResult>;
  }

  /** Run a code snippet in the sandbox. */
  public runCode(input: CodeInput & { stream: true }, options?: RequestOptions): Promise<ExecStream>;
  public runCode(input: CodeInput, options?: RequestOptions): Promise<ExecResult>;
  public runCode(input: CodeInput, options?: RequestOptions): Promise<ExecResult | ExecStream> {
    if (input.stream === true) {
      return this.openCodeStream(input, options);
    }

    if (wantsLiveOutput(input)) {
      return this.runCodeWithCallbacks(input, options);
    }

    return this.transport.requestJson<ExecResult>({
      endpoint: `/sandboxes/${this.sandboxId}/code`,
      method: 'POST',
      body: toRequestBody(input),
      ...options,
    }) as Promise<ExecResult>;
  }

  private async openExecStream(input: ExecInput, options?: RequestOptions): Promise<ExecStream> {
    const body = await this.transport.requestJsonStream({
      endpoint: `/sandboxes/${this.sandboxId}/exec`,
      method: 'POST',
      body: toStreamBody(input),
      ...options,
    });

    return new ExecStream(body);
  }

  private async openCodeStream(input: CodeInput, options?: RequestOptions): Promise<ExecStream> {
    const body = await this.transport.requestJsonStream({
      endpoint: `/sandboxes/${this.sandboxId}/code`,
      method: 'POST',
      body: toStreamBody(input),
      ...options,
    });

    return new ExecStream(body);
  }

  private async execWithCallbacks(input: ExecInput, options?: RequestOptions): Promise<ExecResult> {
    const stream = await this.openExecStream(input, options);
    return consumeExecStream(stream, input, { signal: options?.signal });
  }

  private async runCodeWithCallbacks(input: CodeInput, options?: RequestOptions): Promise<ExecResult> {
    const stream = await this.openCodeStream(input, options);
    return consumeExecStream(stream, input, { signal: options?.signal });
  }
}
