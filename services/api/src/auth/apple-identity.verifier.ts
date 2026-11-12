import {
  createHash,
  createPublicKey,
  timingSafeEqual,
  verify as verifySignature
} from 'node:crypto';
import { z } from 'zod';

const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_JWKS_URL = 'https://appleid.apple.com/auth/keys';
const MAX_IDENTITY_TOKEN_LENGTH = 16_384;
const JWKS_CACHE_TTL_MS = 10 * 60 * 1000;
const FORCED_REFRESH_COOLDOWN_MS = 30 * 1000;
const JWKS_FETCH_TIMEOUT_MS = 5_000;
const DEFAULT_CLOCK_TOLERANCE_SECONDS = 60;

export type AppleIdentityVerificationErrorCode =
  | 'INVALID_APPLE_CREDENTIAL'
  | 'APPLE_IDENTITY_REJECTED'
  | 'AUTH_PROVIDER_UNAVAILABLE';

export class AppleIdentityTokenVerificationError extends Error {
  constructor(readonly code: AppleIdentityVerificationErrorCode) {
    super(code);
    this.name = 'AppleIdentityTokenVerificationError';
  }
}

export interface VerifiedAppleIdentity {
  subject: string;
  email?: string;
  emailVerified?: boolean;
  isPrivateEmail?: boolean;
}

export interface AppleRsaSigningKey {
  kty: 'RSA';
  kid: string;
  n: string;
  e: string;
  use?: 'sig' | 'enc';
  alg?: string;
  key_ops?: string[];
}

export interface AppleJwks {
  keys: AppleRsaSigningKey[];
}

export interface AppleIdentityVerifierDependencies {
  /** Epoch milliseconds. Injected so expiry and clock-skew tests are deterministic. */
  now?: () => number;
  /** Test seam for Apple's key endpoint. forceRefresh bypasses the ordinary cache. */
  getJwks?: (forceRefresh: boolean) => Promise<AppleJwks>;
  clockToleranceSeconds?: number;
}

interface AppleIdentityTokenInput {
  identityToken: string;
  rawNonce: string;
  expectedAudience: string;
}

const AppleBooleanClaimSchema = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .transform((value) => value === true || value === 'true');

const AppleIdentityClaimsSchema = z.object({
  iss: z.string().min(1),
  aud: z.union([
    z.string().min(1),
    z.array(z.string().min(1)).min(1)
  ]),
  exp: z.number().int().positive(),
  iat: z.number().int().positive(),
  nbf: z.number().int().positive().optional(),
  azp: z.string().min(1).optional(),
  sub: z.string().min(1).max(255).refine((value) => value.trim().length > 0),
  nonce: z.string().min(1),
  email: z.string().max(320).email().optional(),
  email_verified: AppleBooleanClaimSchema.optional(),
  is_private_email: AppleBooleanClaimSchema.optional()
});

type AppleIdentityClaims = z.infer<typeof AppleIdentityClaimsSchema>;

interface CachedAppleJwks {
  value: AppleJwks;
  fetchedAt: number;
  expiresAt: number;
}

let appleJwksCache: CachedAppleJwks | null = null;
let appleJwksFetchInFlight: Promise<AppleJwks> | null = null;

function verificationError(
  code: AppleIdentityVerificationErrorCode
): AppleIdentityTokenVerificationError {
  return new AppleIdentityTokenVerificationError(code);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function decodeBase64UrlSegment(segment: string): Buffer {
  if (!segment || !/^[A-Za-z0-9_-]+$/.test(segment)) {
    throw verificationError('INVALID_APPLE_CREDENTIAL');
  }

  const decoded = Buffer.from(segment, 'base64url');
  if (decoded.length === 0 || decoded.toString('base64url') !== segment) {
    throw verificationError('INVALID_APPLE_CREDENTIAL');
  }

  return decoded;
}

function decodeJsonSegment(segment: string): Record<string, unknown> {
  try {
    const decoded = JSON.parse(decodeBase64UrlSegment(segment).toString('utf8')) as unknown;
    if (!isRecord(decoded)) {
      throw verificationError('INVALID_APPLE_CREDENTIAL');
    }
    return decoded;
  } catch (error) {
    if (error instanceof AppleIdentityTokenVerificationError) {
      throw error;
    }
    throw verificationError('INVALID_APPLE_CREDENTIAL');
  }
}

function parseCompactIdentityToken(identityToken: string): {
  header: Record<string, unknown>;
  claims: Record<string, unknown>;
  signingInput: string;
  signature: Buffer;
} {
  if (
    typeof identityToken !== 'string' ||
    identityToken.length > MAX_IDENTITY_TOKEN_LENGTH
  ) {
    throw verificationError('INVALID_APPLE_CREDENTIAL');
  }

  const segments = identityToken.split('.');
  if (segments.length !== 3 || segments.some((segment) => segment.length === 0)) {
    throw verificationError('INVALID_APPLE_CREDENTIAL');
  }

  const [encodedHeader, encodedClaims, encodedSignature] = segments;
  return {
    header: decodeJsonSegment(encodedHeader),
    claims: decodeJsonSegment(encodedClaims),
    signingInput: encodedHeader + '.' + encodedClaims,
    signature: decodeBase64UrlSegment(encodedSignature)
  };
}

function isAppleRsaSigningKey(value: unknown): value is AppleRsaSigningKey {
  if (!isRecord(value)) return false;

  return value.kty === 'RSA' &&
    typeof value.kid === 'string' &&
    value.kid.length > 0 &&
    value.kid.length <= 256 &&
    typeof value.n === 'string' &&
    /^[A-Za-z0-9_-]+$/.test(value.n) &&
    Buffer.from(value.n, 'base64url').length >= 256 &&
    typeof value.e === 'string' &&
    /^[A-Za-z0-9_-]+$/.test(value.e) &&
    (value.use === undefined || value.use === 'sig' || value.use === 'enc') &&
    (value.alg === undefined || value.alg === 'RS256') &&
    (value.key_ops === undefined ||
      (Array.isArray(value.key_ops) && value.key_ops.includes('verify')));
}

function parseAppleJwks(value: unknown): AppleJwks {
  if (!isRecord(value) || !Array.isArray(value.keys) || value.keys.length > 32) {
    throw verificationError('AUTH_PROVIDER_UNAVAILABLE');
  }

  const keys = value.keys.filter(isAppleRsaSigningKey).filter((key) => {
    return key.use !== 'enc' && (key.alg === undefined || key.alg === 'RS256');
  });

  if (keys.length === 0) {
    throw verificationError('AUTH_PROVIDER_UNAVAILABLE');
  }

  return { keys };
}

async function loadAppleJwks(forceRefresh: boolean): Promise<AppleJwks> {
  const now = Date.now();

  if (!forceRefresh && appleJwksCache && appleJwksCache.expiresAt > now) {
    return appleJwksCache.value;
  }

  // Unknown key IDs trigger one bounded refresh. The cooldown prevents a stream
  // of attacker-controlled kid values from causing an outbound request per token.
  if (
    forceRefresh &&
    appleJwksCache &&
    now - appleJwksCache.fetchedAt < FORCED_REFRESH_COOLDOWN_MS
  ) {
    return appleJwksCache.value;
  }

  if (appleJwksFetchInFlight) {
    return appleJwksFetchInFlight;
  }

  appleJwksFetchInFlight = (async () => {
    try {
      const response = await fetch(APPLE_JWKS_URL, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(JWKS_FETCH_TIMEOUT_MS)
      });

      if (!response.ok) {
        throw verificationError('AUTH_PROVIDER_UNAVAILABLE');
      }

      const jwks = parseAppleJwks(await response.json() as unknown);
      const fetchedAt = Date.now();
      appleJwksCache = {
        value: jwks,
        fetchedAt,
        expiresAt: fetchedAt + JWKS_CACHE_TTL_MS
      };
      return jwks;
    } catch {
      throw verificationError('AUTH_PROVIDER_UNAVAILABLE');
    } finally {
      appleJwksFetchInFlight = null;
    }
  })();

  return appleJwksFetchInFlight;
}

async function resolveAppleSigningKey(
  kid: string,
  getJwks: (forceRefresh: boolean) => Promise<AppleJwks>
): Promise<AppleRsaSigningKey> {
  let jwks: AppleJwks;

  try {
    jwks = await getJwks(false);
  } catch (error) {
    if (error instanceof AppleIdentityTokenVerificationError) throw error;
    throw verificationError('AUTH_PROVIDER_UNAVAILABLE');
  }

  let key = jwks.keys.find((candidate) => candidate.kid === kid);
  if (!key) {
    try {
      jwks = await getJwks(true);
    } catch (error) {
      if (error instanceof AppleIdentityTokenVerificationError) throw error;
      throw verificationError('AUTH_PROVIDER_UNAVAILABLE');
    }
    key = jwks.keys.find((candidate) => candidate.kid === kid);
  }

  if (!key || key.kty !== 'RSA' || key.use === 'enc' ||
      (key.alg !== undefined && key.alg !== 'RS256')) {
    throw verificationError('APPLE_IDENTITY_REJECTED');
  }

  return key;
}

function parseAppleClaims(value: Record<string, unknown>): AppleIdentityClaims {
  const parsed = AppleIdentityClaimsSchema.safeParse(value);
  if (!parsed.success) {
    throw verificationError('APPLE_IDENTITY_REJECTED');
  }
  return parsed.data;
}

function hasExpectedAudience(
  audience: string | string[],
  expectedAudience: string,
  authorizedParty?: string
): boolean {
  const audiences = Array.isArray(audience) ? audience : [audience];
  if (!audiences.includes(expectedAudience)) return false;
  if (authorizedParty !== undefined && authorizedParty !== expectedAudience) return false;
  return audiences.length <= 1 || authorizedParty === expectedAudience;
}

function nonceMatches(rawNonce: string, tokenNonce: string): boolean {
  const expectedHash = createHash('sha256').update(rawNonce, 'utf8').digest('hex');
  if (!/^[a-f0-9]{64}$/i.test(tokenNonce)) return false;

  const expected = Buffer.from(expectedHash, 'ascii');
  const actual = Buffer.from(tokenNonce.toLowerCase(), 'ascii');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/**
 * Validates an Apple Sign in with Apple identity token without trusting decoded
 * claims until the RS256 signature, issuer, audience, time claims and nonce pass.
 *
 * The raw nonce must be the same value used by the client to create the
 * authorization request. Apple receives its SHA-256 hex digest in the request.
 */
export async function verifyAppleIdentityToken(
  input: AppleIdentityTokenInput,
  dependencies: AppleIdentityVerifierDependencies = {}
): Promise<VerifiedAppleIdentity> {
  if (
    !input ||
    typeof input.identityToken !== 'string' ||
    typeof input.rawNonce !== 'string' ||
    input.rawNonce.length < 16 ||
    input.rawNonce.length > 512 ||
    typeof input.expectedAudience !== 'string' ||
    input.expectedAudience.trim().length === 0 ||
    input.expectedAudience.length > 255
  ) {
    throw verificationError('INVALID_APPLE_CREDENTIAL');
  }

  const { header, claims: untrustedClaims, signingInput, signature } =
    parseCompactIdentityToken(input.identityToken);

  if (
    header.alg !== 'RS256' ||
    typeof header.kid !== 'string' ||
    header.kid.length === 0 ||
    header.kid.length > 256 ||
    (header.typ !== undefined && header.typ !== 'JWT') ||
    header.crit !== undefined ||
    header.b64 === false
  ) {
    throw verificationError('APPLE_IDENTITY_REJECTED');
  }

  const claims = parseAppleClaims(untrustedClaims);
  const getJwks = dependencies.getJwks ?? loadAppleJwks;
  const signingKey = await resolveAppleSigningKey(header.kid, getJwks);

  let signatureIsValid = false;
  try {
    const publicKey = createPublicKey({
      key: signingKey as never,
      format: 'jwk'
    });
    signatureIsValid = verifySignature(
      'RSA-SHA256',
      Buffer.from(signingInput, 'utf8'),
      publicKey,
      signature
    );
  } catch {
    signatureIsValid = false;
  }

  if (!signatureIsValid) {
    throw verificationError('APPLE_IDENTITY_REJECTED');
  }

  if (
    claims.iss !== APPLE_ISSUER ||
    !hasExpectedAudience(claims.aud, input.expectedAudience, claims.azp) ||
    !nonceMatches(input.rawNonce, claims.nonce)
  ) {
    throw verificationError('APPLE_IDENTITY_REJECTED');
  }

  const nowMs = dependencies.now?.() ?? Date.now();
  if (!Number.isFinite(nowMs)) {
    throw verificationError('APPLE_IDENTITY_REJECTED');
  }

  const nowSeconds = Math.floor(nowMs / 1000);
  const tolerance = dependencies.clockToleranceSeconds ??
    DEFAULT_CLOCK_TOLERANCE_SECONDS;

  if (
    !Number.isInteger(tolerance) ||
    tolerance < 0 ||
    tolerance > 300 ||
    claims.exp <= nowSeconds - tolerance ||
    claims.iat > nowSeconds + tolerance ||
    claims.exp <= claims.iat ||
    (claims.nbf !== undefined && claims.nbf > nowSeconds + tolerance)
  ) {
    throw verificationError('APPLE_IDENTITY_REJECTED');
  }

  return {
    subject: claims.sub,
    ...(claims.email === undefined ? {} : { email: claims.email }),
    ...(claims.email_verified === undefined
      ? {}
      : { emailVerified: claims.email_verified }),
    ...(claims.is_private_email === undefined
      ? {}
      : { isPrivateEmail: claims.is_private_email })
  };
}
