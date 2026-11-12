import {
  createHash,
  generateKeyPairSync,
  sign as signJwt
} from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  AppleIdentityTokenVerificationError,
  verifyAppleIdentityToken,
  type AppleIdentityVerifierDependencies,
  type AppleRsaSigningKey
} from './apple-identity.verifier.js';

const APPLE_ISSUER = 'https://appleid.apple.com';
const EXPECTED_AUDIENCE = 'com.nexus-shield.ios';
const FIXED_NOW = Date.parse('2026-11-12T19:00:00.000Z');
const NOW_SECONDS = Math.floor(FIXED_NOW / 1000);
const RAW_NONCE = 'nexus-test-raw-nonce-value-32-bytes';
const NONCE_HASH = createHash('sha256').update(RAW_NONCE).digest('hex');
const KEY_ID = 'apple-test-signing-key-1';

const keyPair = generateKeyPairSync('rsa', { modulusLength: 2048 });
const otherKeyPair = generateKeyPairSync('rsa', { modulusLength: 2048 });
const rotatedKeyPair = generateKeyPairSync('rsa', { modulusLength: 2048 });

function toAppleJwk(
  pair: typeof keyPair,
  kid: string
): AppleRsaSigningKey {
  const exported = pair.publicKey.export({ format: 'jwk' });
  return {
    kty: 'RSA',
    kid,
    n: exported.n!,
    e: exported.e!,
    use: 'sig',
    alg: 'RS256',
    key_ops: ['verify']
  };
}

const appleJwk = toAppleJwk(keyPair, KEY_ID);
const rotatedJwk = toAppleJwk(rotatedKeyPair, 'apple-test-signing-key-2');

const validClaims: Record<string, unknown> = {
  iss: APPLE_ISSUER,
  aud: EXPECTED_AUDIENCE,
  exp: NOW_SECONDS + 300,
  iat: NOW_SECONDS - 10,
  sub: '000123.abc456def789.0123',
  nonce: NONCE_HASH,
  email: 'person@privaterelay.appleid.com',
  email_verified: true,
  is_private_email: true
};

interface MakeTokenOptions {
  claims?: Record<string, unknown>;
  header?: Record<string, unknown>;
  signingKey?: typeof keyPair.privateKey;
}

function makeToken(options: MakeTokenOptions = {}): string {
  const header = {
    alg: 'RS256',
    kid: KEY_ID,
    typ: 'JWT',
    ...options.header
  };
  const claims = {
    ...validClaims,
    ...options.claims
  };
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedClaims = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signingInput = encodedHeader + '.' + encodedClaims;
  const signature = signJwt(
    'RSA-SHA256',
    Buffer.from(signingInput, 'utf8'),
    options.signingKey ?? keyPair.privateKey
  ).toString('base64url');

  return signingInput + '.' + signature;
}

const defaultDependencies: AppleIdentityVerifierDependencies = {
  now: () => FIXED_NOW,
  getJwks: async () => ({ keys: [appleJwk] })
};

function verify(token = makeToken(), dependencies = defaultDependencies, rawNonce = RAW_NONCE) {
  return verifyAppleIdentityToken({
    identityToken: token,
    rawNonce,
    expectedAudience: EXPECTED_AUDIENCE
  }, dependencies);
}

describe('verifyAppleIdentityToken', () => {
  it('accepts a valid Apple RS256 identity token and returns only the supported identity fields', async () => {
    await expect(verify()).resolves.toEqual({
      subject: '000123.abc456def789.0123',
      email: 'person@privaterelay.appleid.com',
      emailVerified: true,
      isPrivateEmail: true
    });
  });

  it('normalizes Apple boolean claims returned as strings', async () => {
    const token = makeToken({
      claims: {
        email_verified: 'false',
        is_private_email: 'true'
      }
    });

    await expect(verify(token)).resolves.toMatchObject({
      emailVerified: false,
      isPrivateEmail: true
    });
  });

  it('rejects a token signed by a key other than the published key for its kid', async () => {
    const token = makeToken({ signingKey: otherKeyPair.privateKey });

    await expect(verify(token)).rejects.toMatchObject({
      code: 'APPLE_IDENTITY_REJECTED'
    });
  });

  it('rejects an unexpected issuer', async () => {
    const token = makeToken({
      claims: { iss: 'https://attacker.example.com' }
    });

    await expect(verify(token)).rejects.toMatchObject({
      code: 'APPLE_IDENTITY_REJECTED'
    });
  });

  it('rejects an audience that does not exactly include the configured client ID', async () => {
    const token = makeToken({
      claims: { aud: 'com.example.unrelated-app' }
    });

    await expect(verify(token)).rejects.toMatchObject({
      code: 'APPLE_IDENTITY_REJECTED'
    });
  });

  it('requires the authorized party to match when multiple audiences are present', async () => {
    const token = makeToken({
      claims: {
        aud: [EXPECTED_AUDIENCE, 'com.example.other-client'],
        azp: 'com.example.other-client'
      }
    });

    await expect(verify(token)).rejects.toMatchObject({
      code: 'APPLE_IDENTITY_REJECTED'
    });
  });

  it('rejects a nonce that is not the SHA-256 digest of the supplied raw nonce', async () => {
    await expect(verify(makeToken(), defaultDependencies, 'different-raw-nonce-value-32-bytes'))
      .rejects.toMatchObject({
        code: 'APPLE_IDENTITY_REJECTED'
      });
  });

  it('rejects an expired token', async () => {
    const token = makeToken({
      claims: { exp: NOW_SECONDS - 120 }
    });

    await expect(verify(token)).rejects.toMatchObject({
      code: 'APPLE_IDENTITY_REJECTED'
    });
  });

  it('rejects a token issued too far in the future', async () => {
    const token = makeToken({
      claims: { iat: NOW_SECONDS + 120 }
    });

    await expect(verify(token)).rejects.toMatchObject({
      code: 'APPLE_IDENTITY_REJECTED'
    });
  });

  it('rejects a token whose not-before time is in the future', async () => {
    const token = makeToken({
      claims: { nbf: NOW_SECONDS + 120 }
    });

    await expect(verify(token)).rejects.toMatchObject({
      code: 'APPLE_IDENTITY_REJECTED'
    });
  });

  it('rejects a token without a subject', async () => {
    const token = makeToken({
      claims: { sub: undefined }
    });

    await expect(verify(token)).rejects.toMatchObject({
      code: 'APPLE_IDENTITY_REJECTED'
    });
  });

  it('rejects malformed claim types', async () => {
    const token = makeToken({
      claims: { exp: String(NOW_SECONDS + 300) }
    });

    await expect(verify(token)).rejects.toMatchObject({
      code: 'APPLE_IDENTITY_REJECTED'
    });
  });

  it('rejects malformed optional boolean claims instead of coercing arbitrary strings', async () => {
    const token = makeToken({
      claims: { email_verified: 'yes' }
    });

    await expect(verify(token)).rejects.toMatchObject({
      code: 'APPLE_IDENTITY_REJECTED'
    });
  });

  it('rejects unsupported signing algorithms', async () => {
    const token = makeToken({
      header: { alg: 'HS256' }
    });

    await expect(verify(token)).rejects.toMatchObject({
      code: 'APPLE_IDENTITY_REJECTED'
    });
  });

  it('rejects malformed compact JWT input', async () => {
    await expect(verify('not.a.valid.jwt')).rejects.toMatchObject({
      code: 'INVALID_APPLE_CREDENTIAL'
    });
  });

  it('refreshes the JWKS once when the token contains an unknown key ID', async () => {
    const calls: boolean[] = [];
    const dependencies: AppleIdentityVerifierDependencies = {
      now: () => FIXED_NOW,
      getJwks: async (forceRefresh) => {
        calls.push(forceRefresh);
        return { keys: [appleJwk] };
      }
    };
    const token = makeToken({
      header: { kid: 'unknown-apple-key-id' }
    });

    await expect(verify(token, dependencies)).rejects.toMatchObject({
      code: 'APPLE_IDENTITY_REJECTED'
    });
    expect(calls).toEqual([false, true]);
  });

  it('accepts a newly rotated Apple signing key after a forced JWKS refresh', async () => {
    const calls: boolean[] = [];
    const dependencies: AppleIdentityVerifierDependencies = {
      now: () => FIXED_NOW,
      getJwks: async (forceRefresh) => {
        calls.push(forceRefresh);
        return { keys: forceRefresh ? [rotatedJwk] : [appleJwk] };
      }
    };
    const token = makeToken({
      header: { kid: rotatedJwk.kid },
      signingKey: rotatedKeyPair.privateKey
    });

    await expect(verify(token, dependencies)).resolves.toMatchObject({
      subject: '000123.abc456def789.0123'
    });
    expect(calls).toEqual([false, true]);
  });

  it('fails closed when Apple JWKS retrieval is unavailable', async () => {
    const dependencies: AppleIdentityVerifierDependencies = {
      now: () => FIXED_NOW,
      getJwks: async () => {
        throw new Error('simulated network failure');
      }
    };

    await expect(verify(makeToken(), dependencies)).rejects.toMatchObject({
      code: 'AUTH_PROVIDER_UNAVAILABLE'
    });
  });

  it('rejects weak or missing nonce and audience inputs', async () => {
    await expect(verifyAppleIdentityToken({
      identityToken: makeToken(),
      rawNonce: 'short',
      expectedAudience: EXPECTED_AUDIENCE
    }, defaultDependencies)).rejects.toBeInstanceOf(AppleIdentityTokenVerificationError);

    await expect(verifyAppleIdentityToken({
      identityToken: makeToken(),
      rawNonce: RAW_NONCE,
      expectedAudience: ' '
    }, defaultDependencies)).rejects.toMatchObject({
      code: 'INVALID_APPLE_CREDENTIAL'
    });
  });
});
