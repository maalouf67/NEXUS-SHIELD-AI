import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { authTokenConfig } from '../auth/auth.middleware.js';
import { registerTestAuthSession } from '../auth/auth-session.repository.js';
import { createPrivacyProvidersRouter } from '../privacy/privacy-providers.routes.js';
import {
  AJAXX_INFORMATIONAL_PROVIDER,
  PrivacyProviderRegistry
} from '../privacy/privacy-provider.registry.js';

const USER_ID = '00000000-0000-4000-8000-000000000101';
const SESSION_ID = '00000000-0000-4000-8000-000000000102';
const SECRET = 'nexus-privacy-provider-registry-test-secret-at-least-32-bytes';
process.env.JWT_SECRET = SECRET;

function makeToken() {
  registerTestAuthSession({
    sessionId: SESSION_ID,
    userId: USER_ID,
    expiresAt: new Date(Date.now() + 600_000),
    testIdentity: {
      id: USER_ID,
      email: 'privacy-subject@example.test',
      role: 'analyst'
    }
  });

  return jwt.sign({ jti: SESSION_ID }, SECRET, {
    algorithm: 'HS256',
    subject: USER_ID,
    issuer: authTokenConfig.issuer,
    audience: authTokenConfig.audience,
    expiresIn: '5m'
  });
}

function createTestApp(registry = new PrivacyProviderRegistry()) {
  const app = express();
  app.use('/api', createPrivacyProvidersRouter(registry));
  return app;
}

describe('Digital Privacy Guard provider catalog', () => {
  it('requires an authenticated session', async () => {
    const response = await request(createTestApp()).get('/api/privacy/providers');

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('UNAUTHENTICATED');
  });

  it('reports AJAXX as unavailable without enabling any external capability', async () => {
    const response = await request(createTestApp())
      .get('/api/privacy/providers')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.service).toBe('nexus-digital-privacy-guard');
    expect(response.body.providers).toHaveLength(1);

    const [ajaxx] = response.body.providers;
    expect(ajaxx.code).toBe('ajaxx-data-scrubber');
    expect(ajaxx.connectionState).toBe('unavailable');
    expect(ajaxx.reasonCode).toBe('NO_VERIFIED_PARTNER_API');
    expect(ajaxx.profileTransferEnabled).toBe(false);
    expect(Object.values(ajaxx.capabilities).every((enabled) => enabled === false)).toBe(true);
    expect(ajaxx.supportedCountries).toEqual([]);
    expect(JSON.stringify(response.body)).not.toMatch(/client_secret|access_token|api_key/i);
  });

  it('rejects an unsafe provider configuration that enables profile transfer without verified consent and scan capability', () => {
    expect(() => new PrivacyProviderRegistry([{
      ...AJAXX_INFORMATIONAL_PROVIDER,
      connectionState: 'credentials_configured',
      profileTransferEnabled: true
    }])).toThrow('UNSAFE_PRIVACY_PROVIDER_CONFIGURATION');
  });

  it('rejects duplicate provider codes', () => {
    expect(() => new PrivacyProviderRegistry([
      AJAXX_INFORMATIONAL_PROVIDER,
      AJAXX_INFORMATIONAL_PROVIDER
    ])).toThrow('DUPLICATE_PRIVACY_PROVIDER_CODE');
  });
});
