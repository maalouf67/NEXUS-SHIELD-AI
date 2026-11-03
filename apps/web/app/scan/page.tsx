'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useSession } from '../../hooks/use-session';
import { fetchScanHistory } from '../../services/nexus-api';
import { MAX_FILE_BYTES, canSubmitFileScan } from '../../data/security';
import { formatBytes, formatDate } from '../../utils/format';
import { StatusBadge } from '../../components/ui/status-badge';

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
type ScanHistoryItem = {
  id: string;
  sampleId: string;
  sha256: string;
  sizeBytes: number;
  verdict: 'pending' | 'clean' | 'detected' | 'error' | 'timeout';
  scanner: string;
  errorCode: string | null;
  scannedAt: string | null;
  createdAt: string;
  sampleExpiresAt: string;
  storageDeletedAt: string | null;
};
type ApiResponse = {
  error?: string;
  message?: string;
  sample_id?: string;
  history_persisted?: boolean;
  scan?: ScanResult;
};


export default function MalwareScanPage() {
  const { user, status: sessionStatus, error: sessionError } = useSession();
  const checkingSession = sessionStatus === 'checking';
  const [file, setFile] = useState<File | null>(null);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [pendingSampleId, setPendingSampleId] = useState('');
  const [error, setError] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [history, setHistory] = useState<ScanHistoryItem[]>([]);
  const [historyError, setHistoryError] = useState('');

  useEffect(() => {
    if (sessionStatus === 'anonymous') {
      window.location.replace('/login');
    } else if (sessionStatus === 'unavailable') {
      setError(sessionError || 'Your secure session could not be verified.');
    }
  }, [sessionStatus, sessionError]);



  async function loadHistory() {
    try {
      setHistory(await fetchScanHistory(10));
      setHistoryError('');
    } catch (cause) {
      setHistoryError(cause instanceof Error ? cause.message : 'Scan history is currently unavailable.');
    }
  }

  useEffect(() => {
    if (user) void loadHistory();
  }, [user]);

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
    setError(payload.history_persisted === false
      ? 'The scan completed, but its audit record could not be saved. Ask an administrator to check the database.'
      : '');
    await loadHistory();
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
      await loadHistory();
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
      await loadHistory();
    } finally {
      setIsScanning(false);
    }
  }

  const canScan = canSubmitFileScan(user?.role);

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
                <StatusBadge status={scan.verdict}>{scan.verdict === 'clean' ? 'NO SIGNATURE DETECTED' : 'THREAT DETECTED'}</StatusBadge>
                <h2>{scan.verdict === 'clean' ? 'No known signature detected' : 'ClamAV detected a threat'}</h2>
              </div>
              <p className="scan-muted">{scan.scanner} · {formatDate(scan.scanned_at)}</p>
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

      {canScan ? (
        <section className="scan-panel">
          <div className="scan-panel-heading">
            <div><span className="eyebrow">AUDIT TRAIL</span><h2>Recent scan history</h2></div>
            <button className="secondary-button" type="button" onClick={() => void loadHistory()}>Refresh history</button>
          </div>
          {historyError ? <p className="scan-muted" role="alert">{historyError}</p> : null}
          {history.length === 0 ? <p className="scan-muted">No stored scans yet. Results will appear here after the audit database records them.</p> : (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead><tr><th>Verdict</th><th>SHA-256 sample</th><th>File size</th><th>Recorded</th><th>File retention</th></tr></thead>
                <tbody>{history.map((item) => (
                  <tr key={item.id}>
                    <td><StatusBadge status={item.verdict === 'clean' ? 'clean' : item.verdict === 'detected' ? 'detected' : 'pending'}>{item.verdict.toUpperCase()}</StatusBadge></td>
                    <td><code>{item.sampleId.slice(0, 12)}…</code></td>
                    <td>{formatBytes(item.sizeBytes)}</td>
                    <td>{formatDate(item.createdAt)}</td>
                    <td>{item.storageDeletedAt ? 'Sample file deleted' : formatDate(item.sampleExpiresAt)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
          <p className="scan-muted">Quarantined files are scheduled for deletion after 7 days. Scan metadata is retained for up to 30 days.</p>
        </section>
      ) : null}

      <section className="scan-safety-note">
        <strong>Important safety and privacy limits</strong>
        <p>Only Admin and Analyst roles can submit files. The scanner must be configured and reachable. Samples stay in private owner-scoped quarantine. Scan results are saved to PostgreSQL; the API cleanup scheduler deletes expired files after 7 days and scan metadata after 30 days. Do not upload files containing highly sensitive personal or business data unless the deployment owner has approved that processing.</p>
      </section>
    </main>
  );
}
