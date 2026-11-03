import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import { app } from '../index.js';

const serviceToken = 'nexus-test-service-token-'.padEnd(48, 'x');
const originalToken = process.env.NEXUS_SERVICE_API_TOKEN;

const sampleGraph = {
  assets: [
    {
      id: 'identity-1',
      type: 'identity',
      name: 'Test identity',
      evidence: [{
        id: 'asset-evidence-1',
        source: 'test-fixture',
        status: 'verified',
        recordedAt: '2026-01-01T00:00:00.000Z'
      }]
    },
    {
      id: 'server-1',
      type: 'server',
      name: 'Test server',
      evidence: [{
        id: 'asset-evidence-2',
        source: 'test-fixture',
        status: 'verified',
        recordedAt: '2026-01-01T00:00:00.000Z'
      }]
    }
  ],
  relationships: [{
    id: 'relationship-1',
    fromAssetId: 'identity-1',
    toAssetId: 'server-1',
    relationshipType: 'has_access_to',
    evidence: [{
      id: 'relationship-evidence-1',
      source: 'test-fixture',
      status: 'verified',
      recordedAt: '2026-01-01T00:00:00.000Z'
    }]
  }],
  startAssetId: 'identity-1',
  maxDepth: 3,
  maxPaths: 10
};

describe('Attack path analysis API', () => {
  beforeEach(() => {
    process.env.NEXUS_SERVICE_API_TOKEN = serviceToken;
  });

  afterEach(() => {
    if (originalToken === undefined) {
      delete process.env.NEXUS_SERVICE_API_TOKEN;
    } else {
      process.env.NEXUS_SERVICE_API_TOKEN = originalToken;
    }
  });

  it('requires a bearer service token', async () => {
    const response = await request(app)
      .post('/api/attack-paths/analyze')
      .send(sampleGraph);

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('UNAUTHORIZED');
  });

  it('keeps the endpoint disabled when no service token is configured', async () => {
    delete process.env.NEXUS_SERVICE_API_TOKEN;

    const response = await request(app)
      .post('/api/attack-paths/analyze')
      .set('Authorization', `Bearer ${serviceToken}`)
      .send(sampleGraph);

    expect(response.status).toBe(503);
    expect(response.body.error).toBe('SERVICE_AUTH_NOT_CONFIGURED');
  });

  it('returns an evidence-aware read-only path analysis', async () => {
    const response = await request(app)
      .post('/api/attack-paths/analyze')
      .set('Authorization', `Bearer ${serviceToken}`)
      .send(sampleGraph);

    expect(response.status).toBe(200);
    expect(response.body.read_only).toBe(true);
    expect(response.body.data_persisted).toBe(false);
    expect(response.body.external_scan_performed).toBe(false);
    expect(response.body.analysis.paths).toHaveLength(1);
    expect(response.body.analysis.paths[0].path).toEqual(['identity-1', 'server-1']);
  });

  it('rejects duplicate asset identifiers', async () => {
    const duplicateGraph = {
      ...sampleGraph,
      assets: [...sampleGraph.assets, sampleGraph.assets[0]]
    };

    const response = await request(app)
      .post('/api/attack-paths/analyze')
      .set('Authorization', `Bearer ${serviceToken}`)
      .send(duplicateGraph);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('INVALID_REQUEST');
  });

  it('rejects traversal limits above the safety bounds', async () => {
    const response = await request(app)
      .post('/api/attack-paths/analyze')
      .set('Authorization', `Bearer ${serviceToken}`)
      .send({ ...sampleGraph, maxDepth: 1000 });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('INVALID_REQUEST');
  });

  it('rejects unknown request fields', async () => {
    const response = await request(app)
      .post('/api/attack-paths/analyze')
      .set('Authorization', `Bearer ${serviceToken}`)
      .send({ ...sampleGraph, executeScan: true });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('INVALID_REQUEST');
  });
});
