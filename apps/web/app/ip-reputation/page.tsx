'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { useSession } from '../../hooks/use-session';

type IpAssessment = {
  provider: 'abuseipdb';
  status: 'ok';
  verdict: 'malicious' | 'suspicious' | 'safe' | 'unknown';
  scanned_ip: string;
  abuse_confidence_score: number | null;
  total_reports: number | null;
  last_reported_at: string | null;
  country_code: string | null;
  usage_type: string | null;
  isp: string | null;
  domain: string | null;
  is_whitelisted: boolean | null;
  message: string;
  disclaimer: string;
};

const labels = {
  malicious: 'High-confidence abuse reports',
  suspicious: 'Suspicious reputation signals',
  safe: 'No recent abuse reports found',
  unknown: 'Insufficient reputation data'
} as const;

export default function IpReputationPage() {
  const { user, status, error: sessionError } = useSession();
  const [ip, setIp] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<IpAssessment | null>(null);
  const [error, setError] = useState('');

  async function check(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const response = await fetch('/api/nexus/ip-reputation/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: ip.trim(), consent }),
        cache: 'no-store'
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.message || payload.error || 'IP reputation check failed.');
      }
      if (payload.provider !== 'abuseipdb' ||
          !['malicious', 'suspicious', 'safe', 'unknown'].includes(payload.verdict)) {
        throw new Error('The provider returned an unsupported response; no verdict was accepted.');
      }
      setResult(payload as IpAssessment);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'IP reputation check failed.');
    } finally {
      setBusy(false);
    }
  }

  if (status === 'checking') return <main className="loading-screen"><p>Verifying secure session…</p></main>;
  if (!user) return <main className="loading-screen"><p role="alert">{sessionError || 'Sign in to continue.'}</p><Link href="/login">Sign in</Link></main>;
  if (user.role === 'viewer') return <main className="scan-shell"><Link href="/">← Back to dashboard</Link><section className="scan-panel"><h1>Analyst access required</h1><p className="scan-muted">Only Admin and Analyst roles can submit IP reputation checks.</p></section></main>;

  const verdictClass = result?.verdict === 'malicious'
    ? 'scan-status-detected'
    : result?.verdict === 'suspicious' || result?.verdict === 'unknown'
      ? 'scan-status-pending'
      : 'scan-status-clean';

  return (
    <main className="scan-shell">
      <header className="scan-header">
        <Link className="trust-brand" href="/">◈ NEXUS SHIELD AI</Link>
        <Link href="/">← Back to dashboard</Link>
      </header>
      <section className="scan-hero">
        <div className="eyebrow">NEXUS · THREAT INTELLIGENCE</div>
        <h1>Public IP reputation</h1>
        <p>Check a public IPv4 or IPv6 address against AbuseIPDB community reports. Private, loopback, link-local, multicast and reserved addresses are rejected before any provider request.</p>
      </section>
      <section className="scan-panel">
        <div className="scan-panel-heading">
          <div><span className="eyebrow">CONSENT-BASED INTELLIGENCE LOOKUP</span><h2>Enter a public IP address</h2></div>
          <span className="scan-limit">IPv4 / IPv6</span>
        </div>
        <form className="scan-upload-form" onSubmit={check}>
          <label className="form-field">
            <span>IP address</span>
            <input value={ip} onChange={(event) => setIp(event.target.value)} placeholder="8.8.8.8 or 2606:4700:4700::1111" autoComplete="off" inputMode="text" required maxLength={45} />
          </label>
          <label className="phone-consent">
            <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
            <span>I authorize NEXUS SHIELD AI to send this public IP address to AbuseIPDB for a reputation lookup. The address and raw provider response are not persisted by NEXUS.</span>
          </label>
          <div className="scan-actions">
            <button className="primary-button" type="submit" disabled={busy || !ip.trim() || !consent}>
              {busy ? 'Checking AbuseIPDB…' : 'Check IP reputation'}
            </button>
          </div>
        </form>
      </section>
      {error ? <div className="notice notice-error" role="alert">{error}</div> : null}
      {result ? (
        <>
          <section className="scan-result" aria-live="polite">
            <div className="scan-result-heading">
              <span className={verdictClass}>{result.verdict.toUpperCase()}</span>
              <h2>{labels[result.verdict]}</h2>
            </div>
            <p>{result.scanned_ip} · Abuse confidence: {result.abuse_confidence_score ?? 'Not supplied'}/100 · Reports in selected period: {result.total_reports ?? 'Not supplied'}</p>
            <p className="scan-disclaimer">{result.disclaimer}</p>
          </section>
          <section className="scan-panel">
            <h2>Provider details</h2>
            <dl className="scan-result-meta">
              <div><dt>Country</dt><dd>{result.country_code || 'Not supplied'}</dd></div>
              <div><dt>Usage type</dt><dd>{result.usage_type || 'Not supplied'}</dd></div>
              <div><dt>ISP</dt><dd>{result.isp || 'Not supplied'}</dd></div>
              <div><dt>Domain</dt><dd>{result.domain || 'Not supplied'}</dd></div>
              <div><dt>Last reported</dt><dd>{result.last_reported_at || 'Not supplied'}</dd></div>
              <div><dt>Whitelisted</dt><dd>{result.is_whitelisted === null ? 'Not supplied' : result.is_whitelisted ? 'Yes' : 'No'}</dd></div>
            </dl>
            <p className="scan-muted">{result.message}</p>
          </section>
        </>
      ) : null}
      <section className="scan-safety-note">
        <strong>Interpretation and quota limits</strong>
        <p>AbuseIPDB aggregates community reports. Shared hosting, VPNs, cloud services and reassigned IP addresses can affect accuracy. NEXUS treats high scores with enough reports as high risk, not proof that a person or device is malicious. The service has per-account, per-source-IP and shared provider daily limits.</p>
      </section>
    </main>
  );
}
