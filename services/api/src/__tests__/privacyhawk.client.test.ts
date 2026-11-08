import { describe, expect, it, vi } from 'vitest';
import { PrivacyHawkClient } from '../privacy/privacyhawk.client.js';

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('PrivacyHawk partner API client', () => {
  it('fails closed when disabled', async () => {
    const client = new PrivacyHawkClient({ enabled: 'false', clientId: 'x', clientSecret: 'y', fetchImpl: vi.fn() as unknown as typeof fetch });
    expect(client.isConfigured()).toBe(false);
    await expect(client.listBrokers()).rejects.toMatchObject({ code: 'PRIVACYHAWK_NOT_CONFIGURED' });
  });

  it('obtains and caches an OAuth token for sandbox scans', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'test-token', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({ id: 'scan-1', customerId: 'user-1', status: 'created', brokerCount: 3 }))
      .mockResolvedValueOnce(jsonResponse({ id: 'scan-1', customerId: 'user-1', status: 'completed' }));
    const client = new PrivacyHawkClient({
      enabled: 'true', clientId: 'client-id', clientSecret: 'client-secret',
      environment: 'sandbox', fetchImpl: fetchMock as unknown as typeof fetch
    });
    const profile = { name: { first: 'Test', last: 'User' }, emailAddresses: ['test@example.test'] };
    const created = await client.createScan('user-1', profile);
    const current = await client.getScan(created.id);
    expect(created.status).toBe('created');
    expect(current.status).toBe('completed');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[1][0])).toBe('https://privacyapi-sandbox.privacyhawk.com/v1/scans');
  });
});
