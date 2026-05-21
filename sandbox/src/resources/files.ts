import type { BatchFileUploadInput, BatchFileUploadResponse, FileUploadBody } from '../types';
import type { RequestOptions } from '../transport/http';
import { HttpTransport } from '../transport/http';
import { encodeFilePath } from './path';

export class FilesResource {
  private readonly transport: HttpTransport;
  private readonly sandboxId: string;

  /** @internal Create the files wrapper for one sandbox. */
  public constructor(transport: HttpTransport, sandboxId: string) {
    this.transport = transport;
    this.sandboxId = sandboxId;
  }

  /**
   * Upload file bytes to a path inside the sandbox.
   * Tip: pass a Buffer/Uint8Array when you can so Content-Length is set automatically.
   */
  public async put(path: string, body: FileUploadBody, options?: RequestOptions): Promise<void> {
    const headers: Record<string, string> = {
      'content-type': 'application/octet-stream',
    };

    if (Buffer.isBuffer(body) || body instanceof Uint8Array) {
      headers['content-length'] = String(body.byteLength);
    }

    await this.transport.requestBinary({
      endpoint: `/sandboxes/${this.sandboxId}/files/${encodeFilePath(path)}`,
      method: 'PUT',
      body,
      headers,
      ...options,
    });
  }

  /** Download a file from the sandbox as a stream. */
  public get(path: string, options?: RequestOptions): Promise<ReadableStream<Uint8Array>> {
    return this.transport.requestStream({
      endpoint: `/sandboxes/${this.sandboxId}/files/${encodeFilePath(path)}`,
      method: 'GET',
      ...options,
    });
  }

  /**
   * Upload multiple files in one request using base64 payloads.
   * Best for small/medium known files (max 100 per call).
   */
  public async putFiles(files: BatchFileUploadInput[], options?: RequestOptions): Promise<BatchFileUploadResponse> {
    if (files.length === 0) {
      throw new Error('putFiles requires at least one file.');
    }

    if (files.length > 100) {
      throw new Error('putFiles supports at most 100 files per request.');
    }

    const response = await this.transport.requestJson<BatchFileUploadResponse>({
      endpoint: `/sandboxes/${this.sandboxId}/files/batch`,
      method: 'POST',
      body: {
        files: files.map((file) => ({
          path: normalizeBatchPath(file.path),
          content_base64: encodeBatchBody(file.body),
        })),
      },
      ...options,
    });

    if (!response) {
      throw new Error('Batch upload returned an empty response.');
    }

    return response;
  }
}

function normalizeBatchPath(path: string): string {
  return path.startsWith('/') ? path : `/${path}`;
}

function encodeBatchBody(body: BatchFileUploadInput['body']): string {
  if (typeof body === 'string') {
    return Buffer.from(body, 'utf-8').toString('base64');
  }

  return Buffer.from(body).toString('base64');
}
