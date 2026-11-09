import { randomUUID } from 'node:crypto';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pool } from '../db/pool.js';
import { authTokenConfig } from '../auth/auth.middleware.js';
import { registerTestAuthSession } from '../auth/auth-session.repository.js';
import { createIncidentsRouter } from '../incidents/incidents.routes.js';
import { createAlertsRouter } from '../alerts/alerts.routes.js';
import { createSecurityEventsRouter } from '../security-events/security-events.routes.js';
import { createAssetInventoryRouter } from '../assets/asset-inventory.routes.js';
import {
  PostgresWorkspaceRepository,
  type CreatedWorkspaceIntegration
} from '../workspaces/workspace.repository.js';

const enabled =
  process.env.NEXUS_RUN_DB_INTEGRATION_TESTS === 'true' &&
  Boolean(process.env.DATABASE_URL);

describe.skipIf(!enabled)('PostgreSQL cross-tenant negative API tests', () => {
  const workspaces = new PostgresWorkspaceRepository();
  const userA = randomUUID();
  const userB = randomUUID();
  const workspaceA = randomUUID();
  const workspaceB = randomUUID();
  const sessionA = randomUUID();
  const sessionB = randomUUID();
  const secret = 'temporary-ci-only-jwt-secret-with-more-than-32-characters';
  const emailA = `tenant-a-${userA}@example.test`;
  const emailB = `tenant-b-${userB}@example.test`;

  let integrationA: CreatedWorkspaceIntegration;
  let integrationB: CreatedWorkspaceIntegration;
  let tokenA: string;
  let tokenB: string;
  let incidentAId: string;
  let alertAId: string;
  let eventAId: string;

  const app = express();
  app.use(express.json());
  app.use('/api', createIncidentsRouter());
  app.use('/api', createAlertsRouter());
  app.use('/api', createSecurityEventsRouter());
  app.use('/api', createAssetInventoryRouter());

  function accessToken(userId: string, sessionId: string): string {
    return jwt.sign(
      { sub: userId, jti: sessionId },
      secret,
      {
        algorithm: 'HS256',
        issuer: authTokenConfig.issuer,
        audience: authTokenConfig.audience,
        expiresIn: '5m'
      }
    );
  }

  function userHeaders(token: string, workspaceId: string) {
    return {
      Authorization: `Bearer ${token}`,
      'x-nexus-workspace-id': workspaceId
    };
  }

  function integrationHeaders(integration: CreatedWorkspaceIntegration) {
    return { 'x-nexus-integration-token': integration.token };
  }

  beforeAll(async () => {
    process.env.JWT_SECRET = secret;

    await pool.query(
      `INSERT INTO users (id, email, role, password_hash, is_active)
       VALUES ($1, $2, 'admin', NULL, TRUE), ($3, $4, 'admin', NULL, TRUE)`,
      [userA, emailA, userB, emailB]
    );

    await workspaces.createWorkspace({
      id: workspaceA,
      name: 'Negative Test Workspace A',
      slug: `negative-a-${workspaceA.slice(0, 8)}`,
      ownerUserId: userA
    });
    await workspaces.createWorkspace({
      id: workspaceB,
      name: 'Negative Test Workspace B',
      slug: `negative-b-${workspaceB.slice(0, 8)}`,
      ownerUserId: userB
    });

    registerTestAuthSession({
      sessionId: sessionA,
      userId: userA,
      expiresAt: new Date(Date.now() + 5 * 60_000),
      testIdentity: { id: userA, email: emailA, role: 'admin' }
    });
    registerTestAuthSession({
      sessionId: sessionB,
      userId: userB,
      expiresAt: new Date(Date.now() + 5 * 60_000),
      testIdentity: { id: userB, email: emailB, role: 'admin' }
    });

    tokenA = accessToken(userA, sessionA);
    tokenB = accessToken(userB, sessionB);

    integrationA = await workspaces.createIntegration({
      workspaceId: workspaceA,
      name: 'Tenant A CI integration',
      permissions: ['assets:read', 'assets:write', 'events:write'],
      actorUserId: userA
    });
    integrationB = await workspaces.createIntegration({
      workspaceId: workspaceB,
      name: 'Tenant B CI integration',
      permissions: ['assets:read', 'assets:write', 'events:write'],
      actorUserId: userB
    });
  });

  afterAll(async () => {
    const ids = [workspaceA, workspaceB];
    await pool.query(
      'DELETE FROM incident_activity WHERE workspace_id = ANY($1::uuid[])',
      [ids]
    );
    await pool.query(
      'DELETE FROM security_event_reviews WHERE workspace_id = ANY($1::uuid[])',
      [ids]
    );
    await pool.query(
      'DELETE FROM security_events WHERE workspace_id = ANY($1::uuid[])',
      [ids]
    );
    await pool.query('DELETE FROM alerts WHERE workspace_id = ANY($1::uuid[])', [ids]);
    await pool.query('DELETE FROM incidents WHERE workspace_id = ANY($1::uuid[])', [ids]);
    await pool.query('DELETE FROM relationship_evidence WHERE workspace_id = ANY($1::uuid[])', [ids]);
    await pool.query('DELETE FROM asset_relationships WHERE workspace_id = ANY($1::uuid[])', [ids]);
    await pool.query('DELETE FROM asset_evidence WHERE workspace_id = ANY($1::uuid[])', [ids]);
    await pool.query('DELETE FROM assets WHERE workspace_id = ANY($1::uuid[])', [ids]);
    await pool.query('DELETE FROM workspace_integrations WHERE workspace_id = ANY($1::uuid[])', [ids]);
    await pool.query('DELETE FROM workspaces WHERE id = ANY($1::uuid[])', [ids]);
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[userA, userB]]);
  });

  it('denies User B from selecting Workspace A and keeps incident reads tenant-scoped', async () => {
    const created = await request(app)
      .post('/api/incidents')
      .set(userHeaders(tokenA, workspaceA))
      .send({ title: 'Tenant A only incident', severity: 'high' });

    expect(created.status).toBe(201);
    incidentAId = created.body.incident.id;

    const denied = await request(app)
      .get('/api/incidents')
      .set(userHeaders(tokenB, workspaceA));

    expect(denied.status).toBe(403);
    expect(denied.body.error).toBe('WORKSPACE_ACCESS_DENIED');

    const ownWorkspace = await request(app)
      .get('/api/incidents')
      .set(userHeaders(tokenB, workspaceB));

    expect(ownWorkspace.status).toBe(200);
    expect(ownWorkspace.body.incidents.some((item: { id: string }) => item.id === incidentAId)).toBe(false);

    const directForeignRead = await request(app)
      .get(`/api/incidents/${incidentAId}`)
      .set(userHeaders(tokenB, workspaceB));
    expect(directForeignRead.status).toBe(404);
  });

  it('prevents cross-workspace alert reads and status changes', async () => {
    const created = await request(app)
      .post(`/api/incidents/${incidentAId}/alerts`)
      .set(userHeaders(tokenA, workspaceA))
      .send({ type: 'tenant-a-alert', riskScore: 85 });

    expect(created.status).toBe(201);
    alertAId = created.body.alert.id;

    const foreignUpdate = await request(app)
      .patch(`/api/alerts/${alertAId}/status`)
      .set(userHeaders(tokenB, workspaceB))
      .send({ status: 'acknowledged' });

    expect(foreignUpdate.status).toBe(404);
    expect(foreignUpdate.body.error).toBe('ALERT_NOT_FOUND');

    const ownerList = await request(app)
      .get('/api/alerts')
      .set(userHeaders(tokenA, workspaceA));
    expect(ownerList.status).toBe(200);
    expect(ownerList.body.alerts.find((item: { id: string }) => item.id === alertAId)?.status).toBe('active');

    const foreignList = await request(app)
      .get('/api/alerts')
      .set(userHeaders(tokenB, workspaceB));
    expect(foreignList.status).toBe(200);
    expect(foreignList.body.alerts.some((item: { id: string }) => item.id === alertAId)).toBe(false);
  });

  it('isolates security-event ingestion, listing and review across tenant identities', async () => {
    const ingested = await request(app)
      .post('/api/integrations/security-events')
      .set(integrationHeaders(integrationA))
      .send({
        events: [{
          source: 'tenant-a-ci',
          externalEventId: `event-${randomUUID()}`,
          eventType: 'cross-tenant-negative-test',
          severity: 'high',
          observedAt: new Date().toISOString(),
          summary: 'Synthetic tenant A event fixture.',
          attributes: { test: 'cross-tenant' }
        }]
      });

    expect(ingested.status).toBe(202);

    const ownerEvents = await request(app)
      .get('/api/security-events')
      .set(userHeaders(tokenA, workspaceA));
    expect(ownerEvents.status).toBe(200);
    const eventA = ownerEvents.body.events.find(
      (item: { source: string }) => item.source === 'tenant-a-ci'
    );
    expect(eventA).toBeDefined();
    eventAId = eventA.id;

    const foreignEvents = await request(app)
      .get('/api/security-events')
      .set(userHeaders(tokenB, workspaceB));
    expect(foreignEvents.status).toBe(200);
    expect(foreignEvents.body.events.some((item: { id: string }) => item.id === eventAId)).toBe(false);

    const foreignReview = await request(app)
      .post(`/api/security-events/${eventAId}/review`)
      .set(userHeaders(tokenB, workspaceB))
      .send({ note: 'Must not modify another tenant event.' });
    expect(foreignReview.status).toBe(404);
    expect(foreignReview.body.error).toBe('SECURITY_EVENT_NOT_FOUND');

    const stillNew = await request(app)
      .get('/api/security-events?reviewStatus=new')
      .set(userHeaders(tokenA, workspaceA));
    expect(stillNew.body.events.some((item: { id: string }) => item.id === eventAId)).toBe(true);
  });

  it('binds asset reads and writes to the integration credential workspace', async () => {
    const assetId = `tenant-a-asset-${randomUUID()}`;
    const imported = await request(app)
      .post('/api/assets/inventory/import')
      .set(integrationHeaders(integrationA))
      .send({
        assets: [{
          id: assetId,
          type: 'server',
          name: 'Tenant A private asset',
          evidence: []
        }],
        relationships: []
      });

    expect(imported.status).toBe(200);

    const tenantAInventory = await request(app)
      .get('/api/assets/inventory')
      .set(integrationHeaders(integrationA));
    expect(tenantAInventory.status).toBe(200);
    expect(tenantAInventory.body.assets.some((item: { id: string }) => item.id === assetId)).toBe(true);

    const tenantBInventory = await request(app)
      .get('/api/assets/inventory')
      .set(integrationHeaders(integrationB));
    expect(tenantBInventory.status).toBe(200);
    expect(tenantBInventory.body.assets.some((item: { id: string }) => item.id === assetId)).toBe(false);
  });

  it('rejects an integration token whose permission does not authorize the endpoint', async () => {
    const readOnly = await workspaces.createIntegration({
      workspaceId: workspaceB,
      name: 'Tenant B read-only CI integration',
      permissions: ['assets:read'],
      actorUserId: userB
    });

    const denied = await request(app)
      .post('/api/integrations/security-events')
      .set(integrationHeaders(readOnly))
      .send({
        events: [{
          source: 'tenant-b-ci',
          externalEventId: `forbidden-${randomUUID()}`,
          eventType: 'permission-negative-test',
          severity: 'low',
          observedAt: new Date().toISOString(),
          summary: 'This request must be denied.',
          attributes: {}
        }]
      });

    expect(denied.status).toBe(403);
    expect(denied.body.error).toBe('INTEGRATION_PERMISSION_DENIED');
  });
});
