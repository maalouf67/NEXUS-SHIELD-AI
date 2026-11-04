'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { useSession } from '../../hooks/use-session';

type Verdict = 'malicious' | 'suspicious' | 'safe' | 'unknown';
type ProviderAssessment = {
  provider: 'ipqualityscore' | 'seon';
  status: 'ok' | 'not_configured' | 'timeout' | 'rate_limited' | 'error';
  verdict: Verdict | null;
  request_id: string | null;
  signals: {
    fraud_score: number | null;
    network_score: number | null;
    number_valid: boolean | null;
    recent_abuse: boolean | null;
    risky: boolean | null;
    spammer: boolean | null;
    disposable: boolean | null;
    fraudulent_decline_hits: number | null;
    carrier: string | null;
    phone_type: string | null;
    country: string | null;
    flags_count: number | null;
  };
  message: string;
};
type Assessment = {
  scanned_phone: string;
  verdict: Verdict;
  coverage: 'complete' | 'partial' | 'none';
  conflict: boolean;
  providers: ProviderAssessment[];
  disclaimer: string;
};
type ApiError = { error?: string; message?: string };

const verdictText: Record<Verdict, string> = {
  malicious: 'Strong warning',
  suspicious: 'Suspicious indicators',
  safe: 'No risk indicators reported',
  unknown: 'Insufficient data'
};
const statusText: Record<ProviderAssessment['status'], string> = {
  ok: 'Response received',
  not_configured: 'Not configured',
  timeout: 'Timed out',
  rate_limited: 'Rate limited',
  error: 'Unavailable'
};

function display(value: string | number | boolean | null): string {
  if (value === null || value === '') return 'Not supplied';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

export default function PhoneReputationPage() {
  const { user, status, error: sessionError } = useSession();
  const userId = user?.id;
  const [phone, setPhone] = useState('+212');
  const [consent, setConsent] = useState(false);
  const [result, setResult] = useState<Assessment | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [apiStatus, setApiStatus] = useState<'checking' | 'ready' | 'unavailable'>('checking');
  const [providerConfiguration, setProviderConfiguration] = useState({ ipqualityscore: false, seon: false });

  useEffect(() => {
    if (status === 'anonymous') window.location.replace('/login');
  }, [status]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setApiStatus('checking');
    fetch('/api/nexus/health/ready', { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({})) as {
          ready?: boolean;
          dependencies?: { phone_provider_credentials?: { ipqualityscore?: boolean; seon?: boolean } };
        };
        if (cancelled) return;
        setProviderConfiguration({
          ipqualityscore: payload.dependencies?.phone_provider_credentials?.ipqualityscore === true,
          seon: payload.dependencies?.phone_provider_credentials?.seon === true
        });
        setApiStatus(response.ok && payload.ready === true ? 'ready' : 'unavailable');
      })
      .catch(() => {
        if (!cancelled) setApiStatus('unavailable');
      });
    return () => { cancelled = true; };
  }, [userId]);

  async function scan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setResult(null);
    setBusy(true);
    try {
      const response = await fetch('/api/nexus/phone-reputation/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim(), consent }),
        cache: 'no-store'
      });
      const payload = await response.json() as Partial<Assessment> & ApiError;
      if (!response.ok) throw new Error(payload.message || payload.error || 'The check could not be completed.');
      if (!Array.isArray(payload.providers) ||
          !['malicious', 'suspicious', 'safe', 'unknown'].includes(String(payload.verdict))) {
        throw new Error('The API returned an unsupported response. No verdict was accepted.');
      }
      setResult(payload as Assessment);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The check could not be completed.');
    } finally {
      setBusy(false);
    }
  }

  if (status === 'checking') return <main className="loading-screen"><p>Verifying secure session…</p></main>;
  if (!user) return <main className="loading-screen"><p role="alert">{sessionError || 'Sign in to continue.'}</p><Link href="/login">Sign in</Link></main>;
  if (user.role === 'viewer') return <main className="scan-shell"><Link href="/">← Back to dashboard</Link><section className="scan-panel"><h1>Analyst access required</h1><p className="scan-muted">Only Admin and Analyst roles can submit phone reputation checks.</p></section></main>;

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
        <div className="eyebrow">NEXUS · PHONE INTELLIGENCE</div>
        <h1>Phone reputation scanner</h1>
        <p>Check an international phone number with the configured IPQualityScore and SEON services. These services provide risk and digital-footprint signals; they do not identify the person calling you.</p>
      </section>

      <section className="phone-connectivity" aria-live="polite">
        <strong>Server connectivity</strong>
        <span>Web → API → PostgreSQL: {apiStatus === 'checking' ? 'Checking…' : apiStatus === 'ready' ? 'Ready' : 'Unavailable'}</span>
        <span>IPQualityScore credentials: {providerConfiguration.ipqualityscore ? 'Configured' : 'Not configured'}</span>
        <span>SEON credentials: {providerConfiguration.seon ? 'Configured' : 'Not configured'}</span>
        <small>Provider credential presence is not proof of live provider authentication. A real, consented lookup is required to verify each provider connection.</small>
      </section>

      <section className="scan-panel">
        <div className="scan-panel-heading">
          <div><span className="eyebrow">CONSENT-BASED PROVIDER LOOKUP</span><h2>Enter an international number</h2></div>
          <span className="scan-limit">E.164 FORMAT</span>
        </div>
        <form className="scan-upload-form" onSubmit={scan}>
          <label className="form-field">
            <span>Phone number</span>
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="+2126XXXXXXXX"
              autoComplete="tel"
              inputMode="tel"
              required
              pattern="\+[1-9][0-9]{7,14}"
              title="Use international E.164 format, e.g. +212612345678."
            />
          </label>
          <p className="scan-muted">Example for Morocco: +212612345678. The entered number is transmitted to each configured provider only after you confirm the consent checkbox and submit. NEXUS does not persist the submitted phone number or raw provider responses.</p>
          <label className="phone-consent">
            <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
            <span>I authorize NEXUS SHIELD AI to send this number to the configured IPQualityScore and SEON services for this check.</span>
          </label>
          <div className="scan-actions">
            <button className="primary-button" type="submit" disabled={busy || !phone.trim() || !consent}>
              {busy ? 'Checking providers…' : 'Check phone reputation'}
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
              <h2>{verdictText[result.verdict]}</h2>
            </div>
            <p>Provider coverage: {result.coverage}. {result.conflict ? 'The providers returned conflicting risk signals; review both results.' : ''}</p>
            <p className="scan-muted">{result.scanned_phone}</p>
            <p className="scan-disclaimer">{result.disclaimer}</p>
          </section>
          <section className="phone-provider-grid">
            {result.providers.map((provider) => (
              <article className="scan-panel phone-provider-card" key={provider.provider}>
                <div className="scan-panel-heading">
                  <div>
                    <span className="eyebrow">PROVIDER</span>
                    <h2>{provider.provider === 'ipqualityscore' ? 'IPQualityScore' : 'SEON'}</h2>
                  </div>
                  <span className={provider.status === 'ok' ? 'scan-status-clean' : 'scan-status-pending'}>{statusText[provider.status]}</span>
                </div>
                <p className="scan-muted">{provider.message}</p>
                {provider.status === 'ok' ? (
                  <>
                    <p><strong>Provider verdict:</strong> {provider.verdict ? provider.verdict.toUpperCase() : 'UNKNOWN'}</p>
                    <dl className="scan-result-meta">
                      {provider.provider === 'ipqualityscore' ? (
                        <>
                          <div><dt>Fraud score</dt><dd>{display(provider.signals.fraud_score)}</dd></div>
                          <div><dt>Number valid</dt><dd>{display(provider.signals.number_valid)}</dd></div>
                          <div><dt>Recent abuse</dt><dd>{display(provider.signals.recent_abuse)}</dd></div>
                          <div><dt>Risky</dt><dd>{display(provider.signals.risky)}</dd></div>
                          <div><dt>Spammer signal</dt><dd>{display(provider.signals.spammer)}</dd></div>
                        </>
                      ) : (
                        <>
                          <div><dt>Network risk score</dt><dd>{display(provider.signals.network_score)}</dd></div>
                          <div><dt>Number valid</dt><dd>{display(provider.signals.number_valid)}</dd></div>
                          <div><dt>Disposable number</dt><dd>{display(provider.signals.disposable)}</dd></div>
                          <div><dt>Fraud history hits</dt><dd>{display(provider.signals.fraudulent_decline_hits)}</dd></div>
                          <div><dt>Fraud flags count</dt><dd>{display(provider.signals.flags_count)}</dd></div>
                        </>
                      )}
                      <div><dt>Carrier</dt><dd>{display(provider.signals.carrier)}</dd></div>
                      <div><dt>Phone type</dt><dd>{display(provider.signals.phone_type)}</dd></div>
                      <div><dt>Country</dt><dd>{display(provider.signals.country)}</dd></div>
                    </dl>
                  </>
                ) : <p className="scan-muted">No reputation verdict was created for this provider.</p>}
              </article>
            ))}
          </section>
        </>
      ) : null}

      <section className="scan-safety-note">
        <strong>Important privacy and accuracy limits</strong>
        <p>Phone numbers are personal data. Obtain permission before checking a number. Results may be incomplete, may vary by country and provider coverage, and are not proof of caller identity or criminal activity. A number is marked safe only when both providers return complete low-risk signals. A missing key, timeout or provider error never means safe. Only Admin and Analyst roles can submit checks; the API applies a five-checks-per-account limit every 15 minutes.</p>
      </section>
    </main>
  );
}
