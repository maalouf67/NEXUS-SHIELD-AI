'use client';

import { useCallback, useContext, useEffect, useState } from 'react';
import { SessionContext } from '../../context/session-context';
import { apiRequest } from '../../api/client';

type PrivacyRequest = {
  id: string;
  request_type: string;
  status: string;
  scope_categories: string[];
  received_at: string;
  verified_at?: string | null;
  due_at?: string | null;
  closed_at?: string | null;
  subject_email?: string | null;
};

const requestTypes = [
  ['access','Access / copy of my data'],
  ['rectification','Correct my data'],
  ['erasure','Request erasure'],
  ['restriction','Restrict processing'],
  ['objection','Object to processing'],
  ['portability','Data portability']
] as const;
const categories = ['account','authentication','assets','incidents','alerts','security_events','malware_scans','preferences'] as const;

function readable(value: string) {
  return value.replaceAll('_',' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function PrivacyCenterPage() {
  const session = useContext(SessionContext);
  const user = session?.user ?? null;
  const status = session?.status ?? 'checking';
  const [requests, setRequests] = useState<PrivacyRequest[]>([]);
  const [adminRequests, setAdminRequests] = useState<PrivacyRequest[]>([]);
  const [requestDetail, setRequestDetail] = useState<{
    request: PrivacyRequest;
    events: { event_code: string; from_status?: string | null; to_status?: string | null; reason_code?: string | null; created_at: string }[];
  } | null>(null);
  const [requestType, setRequestType] = useState<(typeof requestTypes)[number][0]>('access');
  const [selected, setSelected] = useState<string[]>(['account','authentication']);
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const own = await apiRequest<{requests: PrivacyRequest[]}>('/api/nexus/privacy/requests');
    setRequests(own.requests);
    if (user.role === 'admin') {
      const admin = await apiRequest<{requests: PrivacyRequest[]}>('/api/nexus/admin/privacy/requests');
      setAdminRequests(admin.requests);
    }
  }, [user]);

  useEffect(() => { void load().catch(() => setMessage('Privacy service is currently unavailable.')); }, [load]);

  async function showDetails(id: string) {
    if (requestDetail?.request.id === id) {
      setRequestDetail(null);
      return;
    }
    setBusy(true);
    try {
      const detail = await apiRequest<{
        request: PrivacyRequest;
        events: { event_code: string; from_status?: string | null; to_status?: string | null; reason_code?: string | null; created_at: string }[];
      }>(`/api/nexus/privacy/requests/${id}`);
      setRequestDetail(detail);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Request details could not be loaded.');
    } finally { setBusy(false); }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setMessage('');
    try {
      await apiRequest('/api/nexus/privacy/requests', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({request_type:requestType,scope_categories:selected,subject_note:note.trim() || undefined})
      });
      setNote('');
      setMessage('Your request was submitted. Identity verification and review may be required.');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Request could not be submitted.');
    } finally { setBusy(false); }
  }

  async function withdraw(id: string) {
    setBusy(true); setMessage('');
    try {
      await apiRequest(`/api/nexus/privacy/requests/${id}/withdraw`, { method: 'POST' });
      setRequestDetail(null);
      await load();
      setMessage('Your request was withdrawn. No data was deleted or exported.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Request could not be withdrawn.');
    } finally { setBusy(false); }
  }

  async function downloadExport(id: string) {
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`/api/nexus/privacy/requests/${id}/export`, {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' }
      });
      if (!response.ok) {
        const failure = await response.json().catch(() => ({}));
        throw new Error(typeof failure.error === 'string' ? failure.error : 'Export could not be generated.');
      }
      const blob = new Blob([JSON.stringify(await response.json(), null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `nexus-privacy-export-${id}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setMessage('A scoped export was generated. Check the excluded categories in the file; this may be a partial export.');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Export could not be generated.');
    } finally { setBusy(false); }
  }

  async function review(id: string, action: string, reason_code?: string) {
    setBusy(true); setMessage('');
    try {
      await apiRequest(`/api/nexus/admin/privacy/requests/${id}`, {
        method:'PATCH',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action,reason_code})
      });
      await load();
      setMessage('Request status updated. No data has been erased or exported by this action.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Review action failed.');
    } finally { setBusy(false); }
  }

  if (status === 'checking') return <main className="trust-center"><section className="trust-hero"><h1>Privacy &amp; Data Protection Center</h1><p>Checking your secure session…</p></section></main>;
  if (!user) return <main className="trust-center"><section className="trust-hero"><h1>Privacy &amp; Data Protection Center</h1><p>Please sign in to manage privacy requests.</p><a href="/login">Sign in</a></section></main>;

  return (
    <main className="trust-center">
      <header className="trust-header"><a className="trust-brand" href="/">◈ NEXUS SHIELD AI</a><a href="/settings">Settings</a></header>
      <section className="trust-hero">
        <div className="eyebrow">NEXUS · TRUST &amp; GOVERNANCE</div>
        <h1>Privacy &amp; Data Protection Center</h1>
        <p>Submit and track privacy requests. Verified access and portability exports cover only records with confirmed ownership; erasure, rectification, restriction and processor-side fulfilment are not automated yet.</p>
      </section>
      <section className="trust-card">
        <h2>Data protection overview</h2>
        <div className="trust-grid">
          <article><strong>{requests.length}</strong><span>Your requests</span></article>
          <article><strong>{requests.filter((item) => !['completed','rejected','withdrawn'].includes(item.status)).length}</strong><span>Open requests</span></article>
          <article><strong>{requests.filter((item) => item.status === 'blocked').length}</strong><span>Needs attention</span></article>
        </div>
        <p className="trust-muted">The inventory and retention details are documented separately. Production data flows and ownership for some SOC records still require verification.</p>
      </section>
      <section className="trust-card">
        <h2>Submit a privacy request</h2>
        <form onSubmit={submit}>
          <label>Request type<select value={requestType} onChange={(e) => setRequestType(e.target.value as typeof requestType)}>{requestTypes.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <fieldset><legend>Data categories in scope</legend>{categories.map((category) => <label className="trust-toggle" key={category}><span>{readable(category)}</span><input type="checkbox" checked={selected.includes(category)} onChange={(e) => setSelected((old) => e.target.checked ? [...old,category] : old.filter((item) => item !== category))}/></label>)}</fieldset>
          <label>Additional context (optional)<textarea maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></label>
          <button type="submit" disabled={busy || selected.length === 0}>{busy ? 'Submitting…' : 'Submit request'}</button>
        </form>
        {message && <p role="status">{message}</p>}
      </section>
      <section className="trust-card">
        <h2>My requests</h2>
        {requests.length === 0 ? <p>No privacy requests yet.</p> : <div className="trust-table"><table><thead><tr><th>Request</th><th>Type</th><th>Status</th><th>Received</th><th>Action</th></tr></thead><tbody>{requests.map((item) => <tr key={item.id}><td><button type="button" onClick={() => void showDetails(item.id)}>{item.id.slice(0,8)}</button></td><td>{readable(item.request_type)}</td><td>{readable(item.status)}</td><td>{new Date(item.received_at).toLocaleDateString()}</td><td>
              {['received','identity_verification_required','verified','in_review','blocked'].includes(item.status) && <button type="button" disabled={busy} onClick={() => void withdraw(item.id)}>Withdraw</button>}
              {['access','portability'].includes(item.request_type) && item.status === 'processing' && item.verified_at && <button type="button" disabled={busy} onClick={() => void downloadExport(item.id)}>Download scoped export</button>}
            </td></tr>)}</tbody></table></div>}
        {requestDetail && <div className="trust-request">
          <strong>Request timeline · {requestDetail.request.id.slice(0,8)}</strong>
          {requestDetail.events.length === 0 ? <p>No recorded events.</p> : <ol>{requestDetail.events.map((event, index) => <li key={`${event.event_code}-${index}`}>
            {readable(event.event_code)} · {new Date(event.created_at).toLocaleString()}
            {event.to_status && <span> · {readable(event.to_status)}</span>}
          </li>)}</ol>}
        </div>}
      </section>
      {user.role === 'admin' && <section className="trust-card">
        <h2>Privacy operations queue</h2>
        <p className="trust-muted">Administrative review only. Approval moves a request to processing; it does not trigger data deletion or export.</p>
        {adminRequests.length === 0 ? <p>No requests in queue.</p> : adminRequests.map((item) => <article className="trust-request" key={item.id}>
          <strong>{item.subject_email ?? 'Account no longer available'}</strong><span>{readable(item.request_type)} · {readable(item.status)}</span><small>{item.id}</small>
          <div className="trust-actions">
            {item.status === 'received' && <button disabled={busy} onClick={() => void review(item.id,'verify_identity','identity_verified')}>Record identity verification</button>}
            {item.status === 'verified' && <button disabled={busy} onClick={() => void review(item.id,'start_review')}>Start review</button>}
            {!['completed','rejected','withdrawn'].includes(item.status) && <button disabled={busy} onClick={() => void review(item.id,'block','ownership_ambiguous')}>Block / escalate</button>}
            {['verified','in_review'].includes(item.status) && <button disabled={busy} onClick={() => void review(item.id,'approve','approved_for_processing')}>Approve processing</button>}
            {!['completed','rejected','withdrawn'].includes(item.status) && <button disabled={busy} onClick={() => void review(item.id,'reject','request_out_of_scope')}>Reject</button>}
          </div>
        </article>)}
      </section>}
      <section className="trust-card"><h2>Important safeguards</h2><ul><li>Only your authenticated account can create and view its own requests.</li><li>Administrative actions require the existing admin role.</li><li>Global or ambiguous SOC records are not automatically exported or erased.</li><li>Approval does not perform destructive actions. Each target needs verified ownership and confirmed completion.</li></ul><p><a href="/privacy">Read the current privacy policy</a></p></section>
    </main>
  );
}
