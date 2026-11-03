'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useSession } from '../../hooks/use-session';

type Verdict = 'malicious' | 'suspicious' | 'safe' | 'unknown';
type ScanResult = {
  verdict: Verdict;
  scanned_phone: string;
  region?: string | null;
  carrier?: string | null;
  phone_type?: string | null;
  location?: string | null;
};
type ApiError = { error?: string; message?: string };

const verdictCopy: Record<Verdict, { title: string; detail: string }> = {
  malicious: { title: 'Confirmed malicious', detail: 'Threat intelligence identifies this number as harmful. Avoid interaction and report it through appropriate channels.' },
  suspicious: { title: 'Potentially suspicious', detail: 'Available intelligence indicates elevated risk. Verify the caller independently before responding.' },
  safe: { title: 'No known threat found', detail: 'The provider classifies this number as legitimate. This is not a guarantee of caller identity or future safety.' },
  unknown: { title: 'Insufficient intelligence', detail: 'No reliable reputation verdict is available. Treat the number as unverified.' }
};

export default function PhoneReputationPage() {
  const { user, status, error: sessionError } = useSession();
  const [phone, setPhone] = useState('+212');
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status === 'anonymous') window.location.replace('/login');
  }, [status]);

  async function scan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setResult(null);
    setBusy(true);
    try {
      const response = await fetch('/api/nexus/phone-reputation/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim() }),
        cache: 'no-store'
      });
      const payload = await response.json() as ScanResult & ApiError;
      if (!response.ok) throw new Error(payload.message || payload.error || 'The check could not be completed.');
      if (!['malicious', 'suspicious', 'safe', 'unknown'].includes(payload.verdict)) {
        throw new Error('The provider returned an unsupported verdict. No result was accepted.');
      }
      setResult(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The check could not be completed.');
    } finally {
      setBusy(false);
    }
  }

  if (status === 'checking') return <main className="loading-screen"><p>Verifying secure session…</p></main>;
  if (!user) return <main className="loading-screen"><p role="alert">{sessionError || 'Sign in to continue.'}</p><a href="/login">Sign in</a></main>;
  if (user.role === 'viewer') return <main className="scan-shell"><a href="/">← Back to dashboard</a><section className="scan-panel"><h1>Analyst access required</h1><p className="scan-muted">Only Admin and Analyst roles can submit phone reputation checks.</p></section></main>;

  const verdictClass = result?.verdict === 'malicious' ? 'scan-status-detected' : result?.verdict === 'suspicious' || result?.verdict === 'unknown' ? 'scan-status-pending' : 'scan-status-clean';

  return (
    <main className="scan-shell">
      <header className="scan-header">
        <a className="trust-brand" href="/">◈ NEXUS SHIELD AI</a>
        <a href="/">← Back to dashboard</a>
      </header>
      <section className="scan-hero">
        <div className="eyebrow">NEXUS · PHONE INTELLIGENCE</div>
        <h1>Phone reputation scanner</h1>
        <p>Check a phone number against an authorized threat-intelligence provider. Checks are not caller-ID lookups and do not establish who is actually calling.</p>
      </section>
      <section className="scan-panel">
        <div className="scan-panel-heading">
          <div><span className="eyebrow">REPUTATION CHECK</span><h2>Enter an international number</h2></div>
          <span className="scan-limit">E.164 FORMAT</span>
        </div>
        <form className="scan-upload-form" onSubmit={scan}>
          <label className="form-field">
            <span>Phone number</span>
            <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+2126XXXXXXXX" autoComplete="tel" inputMode="tel" required pattern="\+[1-9][0-9]{7,14}" title="Use international E.164 format, e.g. +212612345678." />
          </label>
          <p className="scan-muted">Example for Morocco: +212612345678. The number is sent to the configured provider only after you submit. It is not stored by this page.</p>
          <div className="scan-actions"><button className="primary-button" type="submit" disabled={busy || !phone.trim()}>{busy ? 'Checking…' : 'Check phone reputation'}</button></div>
        </form>
      </section>
      {error ? <div className="notice notice-error" role="alert">{error}</div> : null}
      {result ? (
        <section className="scan-result" aria-live="polite">
          <div className="scan-result-heading"><span className={verdictClass}>{result.verdict.toUpperCase()}</span><h2>{verdictCopy[result.verdict].title}</h2></div>
          <p>{verdictCopy[result.verdict].detail}</p>
          <dl className="scan-result-meta">
            <div><dt>Scanned number</dt><dd>{result.scanned_phone}</dd></div>
            {result.region ? <div><dt>Region</dt><dd>{result.region}</dd></div> : null}
            {result.carrier ? <div><dt>Carrier</dt><dd>{result.carrier}</dd></div> : null}
            {result.phone_type ? <div><dt>Phone type</dt><dd>{result.phone_type}</dd></div> : null}
            {result.location ? <div><dt>Location</dt><dd>{result.location}</dd></div> : null}
          </dl>
          <p className="scan-disclaimer">A reputation verdict is a signal, not proof of identity. Even a “safe” result cannot guarantee that a caller is legitimate.</p>
        </section>
      ) : null}
      <section className="scan-safety-note">
        <strong>Integration status: provider adapter required</strong>
        <p>The authenticated page and API boundary are in place. Live verdicts remain disabled until the project is connected to an authorized provider API using its documented contract and server-side credentials. The application will not invent a result or mark an unchecked number safe.</p>
      </section>
    </main>
  );
}
