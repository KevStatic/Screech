const SAFE_SCHEME = /^https?:\/\//i;

/** True only for strings starting with http:// or https:// (any letter case). The raw string is tested, no trimming. */
export function isSafeToOpen(url: string): boolean {
  return SAFE_SCHEME.test(url);
}
