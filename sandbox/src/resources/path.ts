/** Encode a single path segment safely for URL usage. */
export function encodePathSegment(value: string): string {
  return encodeURIComponent(value);
}

/**
 * Encode a sandbox file path without encoding forward slashes.
 * Example: `tmp/my file.txt` -> `tmp/my%20file.txt`
 */
export function encodeFilePath(path: string): string {
  return path
    .split('/')
    .filter((segment) => segment.length > 0)
    .map(encodePathSegment)
    .join('/');
}
