'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

type UserRole = 'admin' | 'analyst' | 'viewer';
type User = { id: string; email: string; role: UserRole };
type ManagedUser = { id: string; email: string; role: UserRole; isActive: boolean; createdAt: string };

type ThreatSummary = {
  is_demo: boolean;
  data_source: string;
  summary: {
    total_incidents: number;
    critical: number;
    mitigated: number;
    ai_score: number;
    updated_at: string;
  };
};

type Incident = {
  id: string;
  title: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'investigating' | 'contained' | 'resolved' | 'closed';
  source: string | null;
  createdAt: string;
  updatedAt: string;
};

type Alert = {
  id: string;
  incidentId: string | null;
  incidentTitle: string | null;
  incidentSeverity: string | null;
  incidentStatus: string | null;
  type: string;
  riskScore: number;
  status: 'active' | 'acknowledged' | 'resolved';
  createdAt: string;
};

type SecurityEvent = {
  id: string;
  source: string;
  externalEventId: string;
  eventType: string;
  severity: 'informational' | 'low' | 'medium' | 'high' | 'critical';
  observedAt: string;
  receivedAt: string;
  assetId: string | null;
  summary: string;
  attributes: Record<string, string>;
  reviewStatus: 'new' | 'reviewed';
  reviewedAt: string | null;
  reviewedByUserId: string | null;
};

type ListResponse<T> = {
  status: string;
  incidents?: T[];
  alerts?: T[];
  events?: T[];
  pagination: { total: number; limit: number; offset: number; has_more: boolean };
};

function ShieldMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2.5 4.5 5.4v6.1c0 5.1 3.1 8.4 7.5 10 4.4-1.6 7.5-4.9 7.5-10V5.4L12 2.5Zm3.7 7.3-4.2 4.6-2.2-2.2 1.4-1.4.7.7 2.8-3.1 1.5 1.4Z" />
    </svg>
  );
}

function displayDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown date' : date.toLocaleString();
}

export default function HomePage() {
  const [user, setUser] = useState<User | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>([]);
  const [incidentTotal, setIncidentTotal] = useState(0);
  const [alertTotal, setAlertTotal] = useState(0);
  const [securityEventTotal, setSecurityEventTotal] = useState(0);
  const [summary, setSummary] = useState<ThreatSummary | null>(null);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [incidentTitle, setIncidentTitle] = useState('');
  const [incidentSeverity, setIncidentSeverity] = useState<Incident['severity']>('medium');
  const [incidentSource, setIncidentSource] = useState('analyst-entry');
  const [alertIncidentId, setAlertIncidentId] = useState('');
  const [alertType, setAlertType] = useState('');
  const [alertRisk, setAlertRisk] = useState('50');
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<'analyst' | 'viewer'>('analyst');

  const canManage = user?.role === 'admin' || user?.role === 'analyst';
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    let active = true;

    async function checkSession() {
      try {
        const response = await fetch('/api/auth/me', { cache: 'no-store' });
        if (!response.ok) {
          window.location.replace('/login');
          return;
        }
        const result = await response.json();
        if (active) {
          setUser(result.user as User);
          setCheckingSession(false);
        }
      } catch {
        if (active) {
          setLoadError('Could not verify your secure session.');
          setCheckingSession(false);
        }
      }
    }

    void checkSession();
    return () => {
      active = false;
    };
  }, []);

  const loadDashboard = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');

    try {
      const [incidentResponse, alertResponse, securityEventResponse, summaryResponse] = await Promise.all([
        fetch('/api/nexus/incidents?limit=100', { cache: 'no-store' }),
        fetch('/api/nexus/alerts?limit=100', { cache: 'no-store' }),
        fetch('/api/nexus/security-events?limit=100', { cache: 'no-store' }),
        fetch('/api/nexus/threats/summary', { cache: 'no-store' })
      ]);

      if (
        incidentResponse.status === 401 ||
        alertResponse.status === 401 ||
        securityEventResponse.status === 401
      ) {
        window.location.replace('/login');
        return;
      }

      if (!incidentResponse.ok || !alertResponse.ok || !securityEventResponse.ok) {
        throw new Error('The incident, alert, or event service is unavailable. Check the database migrations and API configuration.');
      }

      const incidentData = await incidentResponse.json() as ListResponse<Incident>;
      const alertData = await alertResponse.json() as ListResponse<Alert>;
      const securityEventData = await securityEventResponse.json() as ListResponse<SecurityEvent>;
      setIncidents(incidentData.incidents ?? []);
      setAlerts(alertData.alerts ?? []);
      setSecurityEvents(securityEventData.events ?? []);
      setIncidentTotal(incidentData.pagination?.total ?? 0);
      setAlertTotal(alertData.pagination?.total ?? 0);
      setSecurityEventTotal(securityEventData.pagination?.total ?? 0);

      if (summaryResponse.ok) {
        setSummary(await summaryResponse.json() as ThreatSummary);
      } else {
        setSummary(null);
      }

      if (user?.role === 'admin') {
        const usersResponse = await fetch('/api/nexus/users', { cache: 'no-store' });
        if (usersResponse.status === 401) {
          window.location.replace('/login');
          return;
        }
        if (!usersResponse.ok) throw new Error('The user directory could not be loaded.');
        const usersData = await usersResponse.json() as { users: ManagedUser[] };
        setManagedUsers(usersData.users ?? []);
      } else {
        setManagedUsers([]);
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Unable to load the dashboard.');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) void loadDashboard();
  }, [user, loadDashboard]);

  useEffect(() => {
    if (!alertIncidentId && incidents.length > 0) {
      setAlertIncidentId(incidents[0].id);
    }
  }, [incidents, alertIncidentId]);

  const metrics = useMemo(() => {
    const open = incidents.filter((item) => ['open', 'investigating', 'contained'].includes(item.status)).length;
    const critical = incidents.filter((item) => item.severity === 'critical').length;
    const activeAlerts = alerts.filter((item) => item.status === 'active').length;
    return { open, critical, activeAlerts };
  }, [incidents, alerts]);

  async function createIncident(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setActionError('');

    try {
      const response = await fetch('/api/nexus/incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: incidentTitle,
          severity: incidentSeverity,
          source: incidentSource || undefined
        })
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.message ?? result?.error ?? 'Incident creation failed.');

      setIncidentTitle('');
      await loadDashboard();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Incident creation failed.');
    } finally {
      setIsSaving(false);
    }
  }

  async function createAlert(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!alertIncidentId) {
      setActionError('Create or select an incident before recording an alert.');
      return;
    }
    setIsSaving(true);
    setActionError('');

    try {
      const response = await fetch(`/api/nexus/incidents/${alertIncidentId}/alerts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: alertType, riskScore: Number(alertRisk) })
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.message ?? result?.error ?? 'Alert recording failed.');

      setAlertType('');
      await loadDashboard();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Alert recording failed.');
    } finally {
      setIsSaving(false);
    }
  }

  async function reviewSecurityEvent(eventId: string) {
    setActionError('');
    try {
      const response = await fetch(`/api/nexus/security-events/${eventId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: 'Reviewed by an authenticated dashboard user.' })
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.message ?? result?.error ?? 'Event review failed.');
      await loadDashboard();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Event review failed.');
    }
  }

  async function createManagedUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setActionError('');

    try {
      const response = await fetch('/api/nexus/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newUserEmail,
          password: newUserPassword,
          role: newUserRole
        })
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.message ?? result?.error ?? 'User creation failed.');

      setNewUserEmail('');
      setNewUserPassword('');
      await loadDashboard();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'User creation failed.');
    } finally {
      setIsSaving(false);
    }
  }

  async function updateIncidentStatus(incidentId: string, status: Incident['status']) {
    setActionError('');
    try {
      const response = await fetch(`/api/nexus/incidents/${incidentId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, note: 'Updated by an authenticated dashboard user.' })
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.message ?? result?.error ?? 'Incident update failed.');
      await loadDashboard();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Incident update failed.');
    }
  }

  async function updateAlertStatus(alertId: string, status: Alert['status']) {
    setActionError('');
    try {
      const response = await fetch(`/api/nexus/alerts/${alertId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, note: 'Updated by an authenticated dashboard user.' })
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.message ?? result?.error ?? 'Alert update failed.');
      await loadDashboard();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Alert update failed.');
    }
  }

  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.replace('/login');
  }

  if (checkingSession) {
    return <main className="loading-screen"><div className="loading-mark"><ShieldMark /></div><p>Verifying secure session…</p></main>;
  }

  if (!user) {
    return (
      <main className="loading-screen">
        <div className="loading-mark"><ShieldMark /></div>
        <p>{loadError || 'Redirecting to secure sign-in…'}</p>
        <a className="primary-button" href="/login">Open sign in</a>
      </main>
    );
  }

  const transitionOptions = (incident: Incident): Incident['status'][] => {
    switch (incident.status) {
      case 'open': return ['investigating', 'contained', 'closed'];
      case 'investigating': return ['contained', 'resolved', 'closed'];
      case 'contained': return ['investigating', 'resolved', 'closed'];
      case 'resolved': return isAdmin ? ['open', 'closed'] : ['closed'];
      case 'closed': return isAdmin ? ['open'] : [];
      default: return [];
    }
  };

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="NEXUS SHIELD AI home">
          <span className="brand-mark"><ShieldMark /></span>
          <span><strong>NEXUS SHIELD AI</strong><small>SECURITY OPERATIONS</small></span>
        </a>

        <div className="sidebar-label">WORKSPACE</div>
        <nav className="side-nav">
          <a className="side-nav-link active" href="#overview"><span>◈</span> Overview</a>
          <a className="side-nav-link" href="#incidents"><span>⌁</span> Incidents</a>
          <a className="side-nav-link" href="#alerts"><span>◎</span> Alerts</a>
          <a className="side-nav-link" href="#events"><span>⌖</span> Event intake</a>
          {isAdmin ? <a className="side-nav-link" href="#team"><span>♙</span> Team access</a> : null}
          <a className="side-nav-link" href="#intelligence"><span>✧</span> AI intelligence</a>
        </nav>

        <div className="sidebar-spacer" />
        <div className="sidebar-status">
          <span className="status-indicator" />
          <div><strong>Development mode</strong><small>Live telemetry is not connected</small></div>
        </div>
        <div className="profile-row">
          <div className="avatar">{user.email.slice(0, 1).toUpperCase()}</div>
          <div className="profile-details"><strong>{user.email}</strong><small>{user.role}</small></div>
          <button className="icon-action" onClick={signOut} title="Sign out" aria-label="Sign out">↗</button>
        </div>
      </aside>

      <section className="main-content">
        <header className="topbar">
          <div>
            <div className="eyebrow">SECURITY COMMAND CENTER</div>
            <h1 id="overview">Operational overview</h1>
          </div>
          <div className="topbar-actions">
            <span className="role-pill">{user.role.toUpperCase()}</span>
            <button className="secondary-button" onClick={() => void loadDashboard()} disabled={isLoading}>
              {isLoading ? 'Refreshing…' : '↻ Refresh'}
            </button>
          </div>
        </header>

        {summary?.is_demo ? (
          <div className="notice notice-warning">
            <strong>DEMO THREAT DATA</strong>
            <span>AI score and threat-summary values are sample data. They are not live detections or measured protection.</span>
          </div>
        ) : null}
        {loadError ? <div className="notice notice-error">{loadError}</div> : null}
        {actionError ? <div className="notice notice-error">{actionError}</div> : null}

        <section className="metrics-grid">
          <article className="metric-card"><span className="metric-label">Open workflow</span><strong>{metrics.open}</strong><small>Open, investigating, or contained incidents</small></article>
          <article className="metric-card"><span className="metric-label">Critical incidents</span><strong>{metrics.critical}</strong><small>From the latest {incidents.length} loaded records</small></article>
          <article className="metric-card"><span className="metric-label">Active alerts</span><strong>{metrics.activeAlerts}</strong><small>From the latest {alerts.length} loaded records</small></article>
          <article className="metric-card"><span className="metric-label">New security events</span><strong>{securityEvents.filter((item) => item.reviewStatus === 'new').length}</strong><small>Latest {securityEvents.length} of {securityEventTotal} received</small></article>
          <article className="metric-card metric-demo"><span className="metric-label">Demo AI score</span><strong>{summary ? `${summary.summary.ai_score}/100` : '—'}</strong><small>Illustrative only · not a calibrated risk score</small></article>
        </section>

        <section className="section-block" id="incidents">
          <div className="section-heading">
            <div><div className="eyebrow">CASE MANAGEMENT</div><h2>Incidents <span className="count-pill">{incidentTotal}</span></h2></div>
            <span className="section-subtitle">Latest 100 records</span>
          </div>

          {canManage ? (
            <form className="inline-form" onSubmit={createIncident}>
              <div className="form-field grow"><label htmlFor="incident-title">New incident title</label><input id="incident-title" value={incidentTitle} onChange={(event) => setIncidentTitle(event.target.value)} maxLength={255} placeholder="Describe the reported security issue" required /></div>
              <div className="form-field"><label htmlFor="incident-severity">Severity</label><select id="incident-severity" value={incidentSeverity} onChange={(event) => setIncidentSeverity(event.target.value as Incident['severity'])}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></div>
              <div className="form-field"><label htmlFor="incident-source">Source</label><input id="incident-source" value={incidentSource} onChange={(event) => setIncidentSource(event.target.value)} maxLength={255} /></div>
              <button className="primary-button" type="submit" disabled={isSaving}>Create incident</button>
            </form>
          ) : (
            <div className="muted-note">Viewer access is read-only. An analyst or administrator can create and update incidents.</div>
          )}

          <div className="data-table-wrap">
            <table className="data-table">
              <thead><tr><th>Incident</th><th>Severity</th><th>Status</th><th>Source</th><th>Created</th><th>Workflow</th></tr></thead>
              <tbody>
                {incidents.map((incident) => (
                  <tr key={incident.id}>
                    <td><strong>{incident.title}</strong><small className="row-id">{incident.id.slice(0, 8)}</small></td>
                    <td><span className={`severity-pill severity-${incident.severity}`}>{incident.severity}</span></td>
                    <td><span className={`status-pill status-${incident.status}`}>{incident.status.replace('_', ' ')}</span></td>
                    <td>{incident.source || '—'}</td>
                    <td>{displayDate(incident.createdAt)}</td>
                    <td>
                      {canManage && transitionOptions(incident).length > 0 ? (
                        <select
                          className="table-select"
                          aria-label={`Change status for ${incident.title}`}
                          value=""
                          onChange={(event) => {
                            if (event.target.value) void updateIncidentStatus(incident.id, event.target.value as Incident['status']);
                          }}
                        >
                          <option value="">Update…</option>
                          {transitionOptions(incident).map((status) => <option key={status} value={status}>{status}</option>)}
                        </select>
                      ) : <span className="muted-note">No action</span>}
                    </td>
                  </tr>
                ))}
                {incidents.length === 0 ? <tr><td colSpan={6} className="empty-cell">{isLoading ? 'Loading incidents…' : 'No incidents have been recorded yet.'}</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="section-block" id="alerts">
          <div className="section-heading">
            <div><div className="eyebrow">SIGNAL REVIEW</div><h2>Alerts <span className="count-pill">{alertTotal}</span></h2></div>
            <span className="section-subtitle">Risk values are submitted by a user or upstream system</span>
          </div>

          {canManage ? (
            <form className="inline-form" onSubmit={createAlert}>
              <div className="form-field grow"><label htmlFor="alert-type">Alert type</label><input id="alert-type" value={alertType} onChange={(event) => setAlertType(event.target.value)} maxLength={128} placeholder="e.g. identity-anomaly" required /></div>
              <div className="form-field"><label htmlFor="alert-incident">Incident</label><select id="alert-incident" value={alertIncidentId} onChange={(event) => setAlertIncidentId(event.target.value)} required><option value="">Select incident</option>{incidents.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></div>
              <div className="form-field risk-field"><label htmlFor="alert-risk">Risk value (0–100)</label><input id="alert-risk" type="number" min={0} max={100} step={1} value={alertRisk} onChange={(event) => setAlertRisk(event.target.value)} required /></div>
              <button className="primary-button" type="submit" disabled={isSaving || incidents.length === 0}>Record alert</button>
            </form>
          ) : null}

          <div className="alert-grid">
            {alerts.map((alert) => (
              <article className="alert-card" key={alert.id}>
                <div className="alert-card-top"><span className={`status-pill status-${alert.status}`}>{alert.status}</span><strong className="risk-number">{alert.riskScore}<small>/100</small></strong></div>
                <h3>{alert.type}</h3>
                <p>{alert.incidentTitle || 'Unlinked incident'}</p>
                <div className="alert-card-footer">
                  <small>{displayDate(alert.createdAt)}</small>
                  {canManage && alert.status !== 'resolved' ? (
                    <button className="text-button" onClick={() => void updateAlertStatus(alert.id, alert.status === 'active' ? 'acknowledged' : 'resolved')}>
                      {alert.status === 'active' ? 'Acknowledge' : 'Resolve'}
                    </button>
                  ) : isAdmin && alert.status === 'resolved' ? (
                    <button className="text-button" onClick={() => void updateAlertStatus(alert.id, 'active')}>Reopen</button>
                  ) : null}
                </div>
              </article>
            ))}
            {alerts.length === 0 ? <div className="empty-state">{isLoading ? 'Loading alerts…' : 'No alerts have been recorded yet.'}</div> : null}
          </div>
        </section>

        <section className="section-block" id="events">
          <div className="section-heading">
            <div><div className="eyebrow">TELEMETRY INTAKE</div><h2>Security events <span className="count-pill">{securityEventTotal}</span></h2></div>
            <span className="section-subtitle">Normalized upstream events · No automatic detection or response</span>
          </div>

          <div className="data-table-wrap">
            <table className="data-table">
              <thead><tr><th>Event</th><th>Source</th><th>Severity</th><th>Asset</th><th>Observed</th><th>Review</th></tr></thead>
              <tbody>
                {securityEvents.map((event) => (
                  <tr key={event.id}>
                    <td><strong>{event.eventType}</strong><small className="row-id">{event.summary}</small></td>
                    <td>{event.source}</td>
                    <td><span className={`severity-pill severity-${event.severity === 'informational' ? 'low' : event.severity}`}>{event.severity}</span></td>
                    <td>{event.assetId || '—'}</td>
                    <td>{displayDate(event.observedAt)}</td>
                    <td>
                      {event.reviewStatus === 'reviewed' ? (
                        <span className="status-pill status-contained">reviewed</span>
                      ) : canManage ? (
                        <button className="text-button" onClick={() => void reviewSecurityEvent(event.id)}>Mark reviewed</button>
                      ) : (
                        <span className="status-pill status-open">new</span>
                      )}
                    </td>
                  </tr>
                ))}
                {securityEvents.length === 0 ? <tr><td colSpan={6} className="empty-cell">{isLoading ? 'Loading security events…' : 'No upstream security events have been received.'}</td></tr> : null}
              </tbody>
            </table>
          </div>
          <p className="muted-note">Events are accepted only from a trusted source configured with the separate ingestion token. They remain evidence for analyst review and are not independently verified by NEXUS SHIELD AI.</p>
        </section>

        {isAdmin ? (
          <section className="section-block" id="team">
            <div className="section-heading">
              <div><div className="eyebrow">ACCESS CONTROL</div><h2>Team access <span className="count-pill">{managedUsers.length}</span></h2></div>
              <span className="section-subtitle">Administrator only · Public registration disabled</span>
            </div>

            <form className="inline-form" onSubmit={createManagedUser}>
              <div className="form-field grow"><label htmlFor="new-user-email">New user email</label><input id="new-user-email" type="email" autoComplete="off" maxLength={254} value={newUserEmail} onChange={(event) => setNewUserEmail(event.target.value)} placeholder="analyst@company.com" required /></div>
              <div className="form-field grow"><label htmlFor="new-user-password">Temporary password</label><input id="new-user-password" type="password" autoComplete="new-password" minLength={12} maxLength={128} value={newUserPassword} onChange={(event) => setNewUserPassword(event.target.value)} placeholder="At least 12 characters" required /></div>
              <div className="form-field"><label htmlFor="new-user-role">Role</label><select id="new-user-role" value={newUserRole} onChange={(event) => setNewUserRole(event.target.value as 'analyst' | 'viewer')}><option value="analyst">Analyst</option><option value="viewer">Viewer</option></select></div>
              <button className="primary-button" type="submit" disabled={isSaving}>Create account</button>
            </form>

            <div className="data-table-wrap">
              <table className="data-table">
                <thead><tr><th>Account</th><th>Role</th><th>Status</th><th>Created</th></tr></thead>
                <tbody>
                  {managedUsers.map((member) => (
                    <tr key={member.id}>
                      <td><strong>{member.email}</strong><small className="row-id">{member.id.slice(0, 8)}</small></td>
                      <td><span className="role-pill">{member.role}</span></td>
                      <td><span className={`status-pill ${member.isActive ? 'status-contained' : 'status-closed'}`}>{member.isActive ? 'active' : 'disabled'}</span></td>
                      <td>{displayDate(member.createdAt)}</td>
                    </tr>
                  ))}
                  {managedUsers.length === 0 ? <tr><td colSpan={4} className="empty-cell">No provisioned accounts found.</td></tr> : null}
                </tbody>
              </table>
            </div>
            <p className="muted-note">New accounts are limited to Analyst and Viewer. Administrator accounts are provisioned only through the one-time server-side bootstrap command.</p>
          </section>
        ) : null}

        <section className="section-block intelligence-block" id="intelligence">
          <div><div className="eyebrow">AI INTELLIGENCE</div><h2>Analyst decision support</h2><p>The AI analysis endpoint is available for explicitly submitted information, but this dashboard does not trigger paid AI requests automatically. No scan or containment action runs from this panel.</p></div>
          <div className="intelligence-status"><span className="status-indicator" /><strong>Ready for controlled integration</strong><small>OpenAI credentials and a human-reviewed workflow must be configured.</small></div>
        </section>

        <footer className="dashboard-footer">
          <span>NEXUS SHIELD AI · Development build</span>
          <span>No live telemetry connected · No automated response enabled</span>
        </footer>
      </section>
    </main>
  );
}
