/**
 * snake_case ↔ camelCase conversion at the (de)serialization boundary (spec §8).
 *
 * The public API is camelCase; the wire is always snake_case. Requests map
 * explicitly per field in the operation functions; responses are converted
 * generically here.
 */

/** Convert a single snake_case key to camelCase. */
export function snakeToCamel(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

/** Recursively convert every object key in a parsed response to camelCase. */
export function camelizeKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(camelizeKeys);
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[snakeToCamel(k)] = camelizeKeys(v);
    }
    return out;
  }
  return value;
}
