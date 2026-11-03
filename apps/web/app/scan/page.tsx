'use client';

import { FormEvent, useEffect, useState } from 'react';

const MAX_FILE_BYTES = 100 * 1024 * 1024;

type User = { id: string; email: string; role: 'admin' | 'analyst' | 'viewer' };
type ScanResult = {
  sample_id: string;
  sha256: string;
  size_bytes: number;
  verdict: 'clean' | 'detected';
  scanner: string;
  scanned_at: string;
  execution_performed: false;
  disclaimer: string;
};
type ApiResponse = {
  error?: string;
  message?: string;
  sample_id?: string;
  scan?: ScanResult;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export default function MalwareScanPage() {
  const [user, setUser] = useState<User | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [pendingSampleId, setPendingSampleId] = useState('');
  const [error, setError] = useState('');
  const [isScanning, setIsScanning] = useState(false);

  useEffect(() => {
    let active = true;
    async function checkSession() {
      try {
        const response = await fetch('/api/auth/me', { cache: 'no-store' });
        if (!response.ok) {
          window.location.replace('/login');
          return;
        }
        const payload = await response.json();
        if (active) setUser(payload.user as User);
      } catch {
        if (active) setError('Your secure session could not be verified.');
      } finally {
        if (active) setCheckingSession(false);
      }
    }
    void checkSession();
    return () => { active = false; };
  }, []);

  async function applyScanResponse(response: Response) {
    const payload = await response.json().catch(() => ({})) as ApiResponse;
    if (!response.ok) {
      setPendingSampleId(typeof payload.sample_id === 'string' ? payload.sample_id : '');
      throw new Error(typeof payload.message === 'string' ? payload.message : 'The file scan could not be completed.');
    }
    if (!payload.scan || (payload.scan.verdict !== 'clean' && payload.scan.verdict !== 'detected')) {
      throw new Error('The scanner response was incomplete. No clean result was recorded.');
    }
    setScan(payload.scan);
    setPendingSampleId('');
    setError('');
  }

  async function submitUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError('Choose one file before starting a scan.');
      return;
    }
    if (file.size < 1 || file.size > MAX_FILE_BYTES) {
      setError('Choose a non-empty file no larger than 100 MiB.');
      return;
    }

    setIsScanning(true);
    setError('');
    setScan(null);
    setPendingSampleId('');
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/security/scan', {
        method: 'POST',
        body: formData,
        cache: 'no-store'
      });
      await applyScanResponse(response);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The scan could not be completed.');
    } finally {
      setIsScanning(false);
    }
  }

  async function retryStagedSample() {
    if (!pendingSampleId) return;
    setIsScanning(true);
    setError('');
    try {
      const response = await fetch('/api/security/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sample_id: pendingSampleId }),
        cache: 'no-store'
      });
      await applyScanResponse(response);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The staged sample could not be rescanned.');
    } finally {
      setIsScanning(false);
    }
  }

  const canScan = user?.role === 'admin' || user?.role === 'analyst';

  if (checkingSession) {
    return <main className="loading-screen"><div className="loading-mark">◈</div><p>Verifying secure session…</p></main>;
  }

  return (
    <main className="scan-shell">
      <header className="scan-header">
        <a className="trust-brand" href="/">◈ NEXUS SHIELD AI</a>
        <a href="/">← Back to dashboard</a>
      </header>

      <section className="scan-hero">
        <div className="eyebrow">NEXUS · MALWARE INSPECTION</div>
        <h1>File security scan</h1>
        <p>Submit one file for a bounded, signature-based ClamAV inspection. Files are stored under a generated SHA-256 identifier in private quarantine before scanning.</p>
      </section>

      {!canScan ? (
        <section className="scan-panel">
          <h2>Analyst access required</h2>
          <p>Your account can view the dashboard but does not have permission to submit files. Ask an administrator for the Analyst role.</p>
        </section>
      ) : (
        <>
          <section className="scan-panel">
            <div className="scan-panel-heading">
              <div><span className="eyebrow">SECURE SUBMISSION</span><h2>Choose a file</h2></div>
              <span className="scan-limit">MAX 100 MiB</span>
            </div>
            <form className="scan-upload-form" onSubmit={submitUpload}>
              <label className="scan-file-label" htmlFor="nexus-scan-file">
                <span className="scan-file-symbol">↑</span>
                <strong>{file ? file.name : 'Select a file to inspect'}</strong>
                <small>{file ? formatBytes(file.size) : 'One file at a time · File name and MIME type are not trusted'}</small>
              </label>
              <input
                id="nexus-scan-file"
                type="file"
                onChange={(event) => {
                  const selected = event.currentTarget.files?.[0] ?? null;
                  setFile(selected);
                  setScan(null);
                  setPendingSampleId('');
                  setError(selected && selected.size > MAX_FILE_BYTES ? 'The selected file exceeds the 100 MiB limit.' : '');
                }}
                disabled={isScanning}
                aria-describedby="scan-upload-help"
              />
              <p id="scan-upload-help" className="scan-muted">Empty files and files larger than 100 MiB are rejected. The upload is never executed by NEXUS SHIELD AI.</p>
              <div className="scan-actions">
                <button className="primary-button" type="submit" disabled={!file || isScanning || !canScan}>
                  {isScanning ? 'Scanning securely…' : 'Start file scan'}
                </button>
                <a className="secondary-button" href="/help">Read scan guidance</a>
              </div>
            </form>
          </section>

          {error ? <div className="notice notice-error" role="alert">{error}</div> : null}

          {pendingSampleId ? (
            <section className="scan-result scan-result-pending" aria-live="polite">
              <div className="scan-result-heading"><span className="scan-status-pending">PENDING</span><h2>Sample retained in quarantine</h2></div>
              <p>The sample was staged, but ClamAV did not return a final verdict. It has not been marked clean. Once the scanner service is available, retry it using the stored sample identifier.</p>
              <code>{pendingSampleId}</code>
              <button className="secondary-button" type="button" onClick={() => void retryStagedSample()} disabled={isScanning}>
                {isScanning ? 'Retrying…' : 'Retry quarantined sample'}
              </button>
            </section>
          ) : null}

          {scan ? (
            <section className="scan-result" aria-live="polite">
              <div className="scan-result-heading">
                <span className={scan.verdict === 'clean' ? 'scan-status-clean' : 'scan-status-detected'}>
                  {scan.verdict === 'clean' ? 'NO SIGNATURE DETECTED' : 'THREAT DETECTED'}
                </span>
                <h2>{scan.verdict === 'clean' ? 'No known signature detected' : 'ClamAV detected a threat'}</h2>
              </div>
              <p className="scan-muted">{scan.scanner} · {new Date(scan.scanned_at).toLocaleString()}</p>
              <dl className="scan-result-meta">
                <div><dt>Sample SHA-256</dt><dd>{scan.sha256}</dd></div>
                <div><dt>File size</dt><dd>{formatBytes(scan.size_bytes)}</dd></div>
                <div><dt>Execution</dt><dd>Not executed</dd></div>
              </dl>
              <p className="scan-disclaimer">{scan.disclaimer} A clean result is not proof that a file is harmless. Keep suspicious files quarantined and do not open them.</p>
            </section>
          ) : null}
        </>
      )}

      <section className="scan-safety-note">
        <strong>Important safety and privacy limits</strong>
        <p>Only Admin and Analyst roles can submit files. The scanner must be configured and reachable. Samples stay in private quarantine; automatic release, permanent scan history, retention cleanup and an asynchronous scan queue are not implemented. Do not upload files containing highly sensitive personal or business data unless the deployment owner has approved that processing.</p>
      </section>
    </main>
  );
}
