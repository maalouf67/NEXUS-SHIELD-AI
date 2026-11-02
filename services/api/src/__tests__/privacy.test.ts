import { describe, expect, it } from 'vitest';
import request from 'supertest';

import { app } from '../index.js';

const validConsent = {
  granted: true,
  explicit: true,
  purpose: 'security_review',
  data_categories: ['network', 'application'],
  timestamp: new Date().toISOString(),
  source: 'dashboard'
} as const;

describe('NEXUS Privacy Guard API', () => {
  it('returns a safe unavailable state when consent is present', async () => {
    const response = await request(app)
      .post('/api/privacy/scan')
      .send({
        request_id: 'privacy-001',
        consent: validConsent,
        payload: {
          summary: 'Privacy review for monitoring dashboard',
          data_classes: ['network', 'application'],
          notes: 'No personal data included.',
          metadata: {
            environment: 'test',
            region: 'eu-west-1'
          }
        }
      });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(response.body.no_external_data_transfer).toBe(true);
    expect(response.body.external_scan.status).toBe('not_available');
    expect(response.body.external_scan.message).toContain('AJAXX Data Scrubber');
  });

  it('rejects requests without explicit consent', async () => {
    const response = await request(app)
      .post('/api/privacy/scan')
      .send({
        request_id: 'privacy-002',
        consent: {
          granted: true,
          explicit: false,
          purpose: 'security_review',
          data_categories: ['network'],
          source: 'dashboard'
        },
        payload: {
          summary: 'Attempted review without explicit consent',
          data_classes: ['network']
        }
      });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('CONSENT_REQUIRED');
  });

  it('rejects invalid privacy payloads', async () => {
    const response = await request(app)
      .post('/api/privacy/scan')
      .send({
        request_id: 'privacy-003',
        consent: validConsent,
        payload: {
          summary: 'x'.repeat(300),
          data_classes: ['network']
        }
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('INVALID_REQUEST');
  });
});
