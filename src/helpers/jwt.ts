/**
 * Minimal JWT `exp` decoding for the token lifecycle (spec §2.3).
 *
 * The token response carries no explicit expiry, so the `exp` claim is the only
 * signal. This reads it without verifying the signature (the SDK is the token's
 * consumer, not its validator). Returns null when the claim cannot be decoded,
 * which the caller treats as "refresh on the next call".
 */

/** Decode the `exp` claim (seconds since epoch) from a JWT, or null. */
export function decodeJwtExp(jwt: string): number | null {
  const parts = jwt.split('.');
  if (parts.length < 2) return null;
  try {
    const payload = Buffer.from(parts[1], 'base64url').toString('utf8');
    const claims: unknown = JSON.parse(payload);
    if (claims && typeof claims === 'object') {
      const exp = (claims as Record<string, unknown>).exp;
      if (typeof exp === 'number' && Number.isFinite(exp)) return exp;
    }
    return null;
  } catch {
    return null;
  }
}
