import type { ExecResult, ExecStreamFrame } from '../types';
import { parseSseFrames } from './sse';

export type ExecLog = {
  stream: 'stdout' | 'stderr';
  data: string;
};

export type ExecStreamOptions = {
  signal?: AbortSignal;
};

function aggregateFrames(frames: ExecStreamFrame[]): ExecResult {
  let stdout = '';
  let stderr = '';
  let exit_code = 1;
  let duration_ms = 0;
  let sawDone = false;

  for (const frame of frames) {
    if (frame.type === 'stdout') {
      stdout += frame.data;
    }

    if (frame.type === 'stderr') {
      stderr += frame.data;
    }

    if (frame.type === 'done') {
      exit_code = frame.exit_code;
      duration_ms = frame.duration_ms;
      sawDone = true;
    }

    if (frame.type === 'error') {
      throw new Error(frame.message);
    }
  }

  if (!sawDone) {
    throw new Error('Command stream ended before completion');
  }

  return { stdout, stderr, exit_code, duration_ms };
}

/**
 * Live command output from a streaming exec or runCode call.
 *
 * ```
 * const output = await sandbox.exec({ cmd: 'npm install', stream: true });
 * for await (const log of output) {
 *   if (log.stream === 'stdout') process.stdout.write(log.data);
 * }
 * const result = await output.result();
 * ```
 */
export class ExecStream implements AsyncIterable<ExecLog> {
  private readonly body: ReadableStream<Uint8Array>;
  private cachedFrames: ExecStreamFrame[] | null = null;
  private consumePromise: Promise<ExecStreamFrame[]> | null = null;

  public constructor(body: ReadableStream<Uint8Array>) {
    this.body = body;
  }

  /**
   * Iterate stdout/stderr chunks as they arrive.
   * Stops before the terminal `done` frame.
   */
  public async *logs(options: ExecStreamOptions = {}): AsyncGenerator<ExecLog> {
    for await (const frame of this.frames(options)) {
      if (frame.type === 'stdout') {
        yield { stream: 'stdout', data: frame.data };
      }

      if (frame.type === 'stderr') {
        yield { stream: 'stderr', data: frame.data };
      }
    }
  }

  /** Iterate all SSE frames, including the terminal `done` frame. */
  public async *frames(options: ExecStreamOptions = {}): AsyncGenerator<ExecStreamFrame> {
    if (this.cachedFrames) {
      for (const frame of this.cachedFrames) {
        yield frame;
      }
      return;
    }

    const frames: ExecStreamFrame[] = [];

    for await (const frame of parseSseFrames(this.body, options.signal)) {
      frames.push(frame);
      yield frame;
    }

    this.cachedFrames = frames;
  }

  /** Wait for completion and return the aggregated command result. */
  public async result(options: ExecStreamOptions = {}): Promise<ExecResult> {
    if (this.cachedFrames) {
      return aggregateFrames(this.cachedFrames);
    }

    if (!this.consumePromise) {
      this.consumePromise = this.collectFrames(options);
    }

    const frames = await this.consumePromise;
    return aggregateFrames(frames);
  }

  public [Symbol.asyncIterator](): AsyncIterator<ExecLog> {
    return this.logs()[Symbol.asyncIterator]();
  }

  private async collectFrames(options: ExecStreamOptions = {}): Promise<ExecStreamFrame[]> {
    const frames: ExecStreamFrame[] = [];

    for await (const frame of this.frames(options)) {
      frames.push(frame);
    }

    return frames;
  }
}

export async function consumeExecStream(
  stream: ExecStream,
  callbacks: {
    onStdout?: (chunk: string) => void;
    onStderr?: (chunk: string) => void;
  } = {},
  options: ExecStreamOptions = {},
): Promise<ExecResult> {
  for await (const frame of stream.frames(options)) {
    if (frame.type === 'stdout') {
      callbacks.onStdout?.(frame.data);
    }

    if (frame.type === 'stderr') {
      callbacks.onStderr?.(frame.data);
    }

    if (frame.type === 'error') {
      throw new Error(frame.message);
    }
  }

  return stream.result(options);
}
