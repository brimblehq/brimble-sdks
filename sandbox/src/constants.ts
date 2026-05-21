import packageJson from '../package.json';

export const DEFAULT_BASE_URL = 'https://sandbox.brimble.io';
export const DEFAULT_TIMEOUT_MS = 30_000;
export const SANDBOX_API_KEY_ENV_NAME = 'BRIMBLE_SANDBOX_KEY';
export const SDK_PACKAGE_VERSION = packageJson.version;

export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_LIMIT = 15;
export const MAX_PAGE_LIMIT = 100;
export const MIN_VOLUME_SIZE_GB = 10;
export const DEFAULT_SANDBOX_READY_TIMEOUT_MS = 60_000;
export const DEFAULT_SANDBOX_READY_POLL_INTERVAL_MS = 2_000;
export const DEFAULT_RETRY_MAX_ATTEMPTS = 1;
export const DEFAULT_RETRY_BASE_DELAY_MS = 300;
export const DEFAULT_RETRY_MAX_DELAY_MS = 3_000;
export const DEFAULT_RETRY_STATUSES = [408, 429, 500, 502, 503, 504] as const;
