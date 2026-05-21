export type SandboxApiErrorArgs = {
  status: number;
  message: string;
  endpoint: string;
  responseBody: unknown;
  requestId?: string | null;
};

export class SandboxApiError extends Error {
  public readonly status: number;
  public readonly endpoint: string;
  public readonly responseBody: unknown;
  public readonly requestId: string | null;

  public constructor(args: SandboxApiErrorArgs) {
    super(args.message);
    this.name = 'SandboxApiError';
    this.status = args.status;
    this.endpoint = args.endpoint;
    this.responseBody = args.responseBody;
    this.requestId = args.requestId ?? null;
  }
}

export class AuthError extends SandboxApiError {
  public constructor(args: SandboxApiErrorArgs) {
    super(args);
    this.name = 'AuthError';
  }
}

export class ValidationError extends SandboxApiError {
  public constructor(args: SandboxApiErrorArgs) {
    super(args);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends SandboxApiError {
  public constructor(args: SandboxApiErrorArgs) {
    super(args);
    this.name = 'NotFoundError';
  }
}

export class RateLimitError extends SandboxApiError {
  public readonly retryAfterSeconds: number | null;

  public constructor(args: SandboxApiErrorArgs & { retryAfterSeconds?: number | null }) {
    super(args);
    this.name = 'RateLimitError';
    this.retryAfterSeconds = args.retryAfterSeconds ?? null;
  }
}
