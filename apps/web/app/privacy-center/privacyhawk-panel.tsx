'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { apiRequest } from '../../api/client';

type Scan = {
  id: string;
  status: string;
  broker_count: number | null;
  created_at: string;
};

type ProviderStatus = {
  configured: boolean;
  environment: string;
  connection_state: string;
};

export default function PrivacyHawkPanel({ email }: { email: string }) {
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [scans, setScans] = useState<Scan[]>([]);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('MA');
  const [consent, setConsent] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [records, setRecords] = useState<Record<string, unknown[]>>({});

  const refresh = useCallback(async () => {
    const provider = await apiRequest<ProviderStatus>('/api/nexus/privacy/providers/privacyhawk/status');
    setStatus(provider);
    const result = await apiRequest<{ scans: Scan[] }>('/api/nexus/privacy/providers/privacyhawk/scans');
    setScans(result.scans);
  }, []);

  useEffect(() => {
    void refresh().catch(() => setMessage('PrivacyHawk status is currently unavailable.'));
  }, [refresh]);

  async function startScan(event: FormEvent) {
    event.preventDefault();
    if (!consent) {
      setMessage('Explicit consent is required before sending profile information.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const profile = {
        name: { first: firstName.trim(), last: lastName.trim() },
        emailAddresses: [email],
        addresses: [{
          city: city.trim() || undefined,
          country: country.trim().toUpperCase(),
          current: true
        }]
      };
      await apiRequest('/api/nexus/privacy/providers/privacyhawk/scans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          consent: { granted: true, explicit: true, version: '2026-11-08' },
          profile,
          realtime: true
        })
      });
      setConsent(false);
      setMessage('Scan submitted. Check its status below.');
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'PrivacyHawk scan could not be started.');
    } finally {
      setBusy(false);
    }
  }

  async function viewRecords(scanId: string) {
    setBusy(true);
    setMessage('');
    try {
      const result = await apiRequest<{ records: unknown[] }>(
        '/api/nexus/privacy/providers/privacyhawk/scans/' + encodeURIComponent(scanId) + '/records'
      );
      setRecords((current) => ({ ...current, [scanId]: result.records }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Scan records could not be loaded.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="trust-card">
      <h2>PrivacyHawk · Data Broker Scan</h2>
      <p>Check participating data-broker sites for listings associated with your profile. Your profile is sent to PrivacyHawk only after explicit consent. A scan does not create a recurring removal enrollment or submit opt-out requests.</p>
      {status?.configured ? (
        <>
          <p className="trust-muted">Partner credentials are configured for {status.environment}. A live connection is not verified until a provider request succeeds.</p>
          <form onSubmit={startScan}>
            <label>First name<input required maxLength={80} value={firstName} onChange={(event) => setFirstName(event.target.value)} /></label>
            <label>Last name<input required maxLength={80} value={lastName} onChange={(event) => setLastName(event.target.value)} /></label>
            <label>Account email<input readOnly value={email} /></label>
            <label>City (optional)<input maxLength={80} value={city} onChange={(event) => setCity(event.target.value)} /></label>
            <label>Country code<input required minLength={2} maxLength={2} value={country} onChange={(event) => setCountry(event.target.value.toUpperCase())} /></label>
            <label className="trust-toggle">
              <span>I explicitly consent to send the profile fields above to PrivacyHawk for this scan. I understand this scan does not itself request data removal.</span>
              <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
            </label>
            <button type="submit" disabled={busy || !consent}>{busy ? 'Submitting…' : 'Start PrivacyHawk scan'}</button>
          </form>
        </>
      ) : (
        <p className="trust-muted">PrivacyHawk partner credentials are not configured on the API server. No profile data has been sent.</p>
      )}
      {message && <p role="status">{message}</p>}
      <div className="trust-actions">
        <button type="button" disabled={busy || !status?.configured} onClick={() => void refresh()}>Refresh scan history</button>
      </div>
      <h3>My PrivacyHawk scans</h3>
      {scans.length === 0 ? <p>No PrivacyHawk scans recorded.</p> : (
        <ul>
          {scans.map((scan) => (
            <li key={scan.id}>
              {scan.status.replaceAll('_', ' ')} · {scan.broker_count ?? '—'} brokers · {new Date(scan.created_at).toLocaleString()}
              {' '}<button type="button" disabled={busy || scan.status === 'submitting'} onClick={() => void viewRecords(scan.id)}>View matched records</button>
              {records[scan.id] && <pre>{JSON.stringify(records[scan.id], null, 2)}</pre>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
