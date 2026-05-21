export type FileUploadBody = ReadableStream<Uint8Array> | Buffer | Uint8Array;

export type BatchFileUploadBody = Buffer | Uint8Array | string;

export type BatchFileUploadInput = {
  path: string;
  body: BatchFileUploadBody;
};

export type BatchFileUploadResult = {
  path: string;
  bytes: number;
  success: boolean;
  error?: string;
};

export type BatchFileUploadResponse = {
  uploaded: number;
  failed: number;
  results: BatchFileUploadResult[];
};
