'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from '../hooks/use-session';

import type {
  Incident, Alert, SecurityEvent, ThreatSummary, ThreatAnalysisResult, ManagedUser, Workspace
} from '../services/dashboard-api';
import {
  fetchDashboardData,
  createIncidentRecord as apiCreateIncident,
  createAlertRecord as apiCreateAlert,
  analyzeThreat as apiAnalyzeThreat,
  reviewSecurityEvent as apiReviewSecurityEvent,
  addWorkspaceMember as apiAddWorkspaceMember,
  createWorkspace as apiCreateWorkspace,
  fetchWorkspaces as apiFetchWorkspaces,
  changeIncidentStatus as apiChangeIncidentStatus,
  changeAlertStatus as apiChangeAlertStatus
} from '../services/dashboard-api';
import { ApiClientError } from '../api/client';
import ThreatIntelligencePanel from './threat-intelligence-panel';

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
  const { user, status: sessionStatus, error: sessionError, signOut: endSession } = useSession();
  const checkingSession = sessionStatus === 'checking';
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>([]);
  const [ipsEvents, setIpsEvents] = useState<SecurityEvent[]>([]);
  const [incidentTotal, setIncidentTotal] = useState(0);
  const [alertTotal, setAlertTotal] = useState(0);
  const [securityEventTotal, setSecurityEventTotal] = useState(0);
  const [ipsEventTotal, setIpsEventTotal] = useState(0);
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
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState('');
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState<'analyst' | 'viewer'>('analyst');
  const [analysisTarget, setAnalysisTarget] = useState('');
  const [analysisSource, setAnalysisSource] = useState('');
  const [analysisSignalType, setAnalysisSignalType] = useState('');
  const [analysisDetails, setAnalysisDetails] = useState('');
  const [aiAnalysis, setAiAnalysis] = useState<ThreatAnalysisResult | null>(null);
  const [aiError, setAiError] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? null;
  const canManage = activeWorkspace?.role === 'admin' || activeWorkspace?.role === 'analyst';
  const isAdmin = activeWorkspace?.role === 'admin';

  useEffect(() => {
    if (sessionStatus === 'anonymous') {
      window.location.replace('/login');
    } else if (sessionStatus === 'unavailable') {
      setLoadError(sessionError || 'Could not verify your secure session.');
    }
  }, [sessionStatus, sessionError]);



  const loadDashboard = useCallback(async () => {
    if (!user || !activeWorkspaceId) return;
    setIsLoading(true);
    setLoadError('');

    try {
      const data = await fetchDashboardData(isAdmin);
      setIncidents(data.incidents);
      setAlerts(data.alerts);
      setSecurityEvents(data.securityEvents);
      setIpsEvents(data.ipsEvents);
      setIncidentTotal(data.incidentTotal);
      setAlertTotal(data.alertTotal);
      setSecurityEventTotal(data.securityEventTotal);
      setIpsEventTotal(data.ipsEventTotal);
      setSummary(data.summary);
      setManagedUsers(data.managedUsers);
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401) {
        window.location.replace('/login');
        return;
      }
      setLoadError(error instanceof Error ? error.message : 'Unable to load the dashboard.');
    } finally {
      setIsLoading(false);
    }
  }, [user, activeWorkspaceId, isAdmin]);

  const loadWorkspaces = useCallback(async () => {
    try {
      const available = await apiFetchWorkspaces();
      setWorkspaces(available);
      const stored = window.localStorage.getItem('nexus.activeWorkspaceId');
      const selected = available.find((workspace) => workspace.id === stored) ?? available[0];
      if (selected) {
        window.localStorage.setItem('nexus.activeWorkspaceId', selected.id);
        setActiveWorkspaceId(selected.id);
      } else {
        window.localStorage.removeItem('nexus.activeWorkspaceId');
        setActiveWorkspaceId('');
        setManagedUsers([]);
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Unable to load your workspaces.');
    }
  }, []);

  useEffect(() => {
    if (user) void loadWorkspaces();
  }, [user, loadWorkspaces]);

  useEffect(() => {
    if (activeWorkspaceId) void loadDashboard();
  }, [activeWorkspaceId, loadDashboard]);

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

  function switchWorkspace(workspaceId: string) {
    if (!workspaces.some((workspace) => workspace.id === workspaceId)) return;
    window.localStorage.setItem('nexus.activeWorkspaceId', workspaceId);
    setIncidents([]);
    setAlerts([]);
    setSecurityEvents([]);
    setIpsEvents([]);
    setManagedUsers([]);
    setSummary(null);
    setIncidentTotal(0);
    setAlertTotal(0);
    setSecurityEventTotal(0);
    setIpsEventTotal(0);
    setAlertIncidentId('');
    setActiveWorkspaceId(workspaceId);
  }

  async function createWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setActionError('');
    try {
      const result = await apiCreateWorkspace(newWorkspaceName);
      const created = result.workspace;
      setWorkspaces((current) => [...current, created]);
      setNewWorkspaceName('');
      window.localStorage.setItem('nexus.activeWorkspaceId', created.id);
      setActiveWorkspaceId(created.id);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Workspace creation failed.');
    } finally {
      setIsSaving(false);
    }
  }

  async function createIncident(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setActionError('');

    try {
      await apiCreateIncident({
        title: incidentTitle,
        severity: incidentSeverity,
        source: incidentSource || undefined
      });

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
      await apiCreateAlert(alertIncidentId, { type: alertType, riskScore: Number(alertRisk) });

      setAlertType('');
      await loadDashboard();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Alert recording failed.');
    } finally {
      setIsSaving(false);
    }
  }

  async function submitThreatAnalysis(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAiError('');
    setAiAnalysis(null);
    setIsAnalyzing(true);

    try {
      const result = await apiAnalyzeThreat({
        target: analysisTarget,
        source: analysisSource,
        signal_type: analysisSignalType || undefined,
        details: analysisDetails || undefined
      });
      setAiAnalysis(result.analysis);
    } catch (error) {
      setAiError(error instanceof Error ? error.message : 'AI analysis could not be completed.');
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function reviewSecurityEvent(eventId: string) {
    setActionError('');
    try {
      await apiReviewSecurityEvent(eventId);
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
      await apiAddWorkspaceMember({ email: newUserEmail, role: newUserRole });

      setNewUserEmail('');
      await loadDashboard();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not add this existing account to the workspace.');
    } finally {
      setIsSaving(false);
    }
  }

  async function updateIncidentStatus(incidentId: string, status: Incident['status']) {
    setActionError('');
    try {
      await apiChangeIncidentStatus(incidentId, status);
      await loadDashboard();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Incident update failed.');
    }
  }

  async function updateAlertStatus(alertId: string, status: Alert['status']) {
    setActionError('');
    try {
      await apiChangeAlertStatus(alertId, status);
      await loadDashboard();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Alert update failed.');
    }
  }

  async function signOut() {
    await endSession();
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
          <a className="side-nav-link" href="#events"><span>⌖</span> Defense activity</a>
          <a className="side-nav-link" href="#threat-intelligence"><span>✦</span> Threat intelligence</a>
          {isAdmin ? <a className="side-nav-link" href="#team"><span>♙</span> Team access</a> : null}
          <a className="side-nav-link" href="#intelligence"><span>✧</span> AI intelligence</a>
          {canManage ? <a className="side-nav-link" href="/scan"><span>⌕</span> Malware file scan</a> : null}
          {canManage ? <a className="side-nav-link" href="/ip-reputation"><span>◉</span> IP reputation</a> : null}
          <a className="side-nav-link" href="/settings"><span>⚙</span> Settings & privacy</a>
          <a className="side-nav-link" href="/help"><span>?</span> Help center</a>
        </nav>

        <div className="sidebar-spacer" />
        <div className="sidebar-status">
          <span className="status-indicator" />
          <div><strong>Development mode</strong><small>Live telemetry is not connected</small></div>
        </div>
        <div className="profile-row">
          <div className="avatar">{user.email.slice(0, 1).toUpperCase()}</div>
          <div className="profile-details"><strong>{user.email}</strong><small>{activeWorkspace?.role ?? user.role}</small></div>
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
            {workspaces.length > 0 ? (
              <label className="form-field workspace-switcher">
                <span>ACTIVE WORKSPACE</span>
                <select aria-label="Active workspace" value={activeWorkspaceId} onChange={(event) => switchWorkspace(event.target.value)}>
                  {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name} · {workspace.role}</option>)}
                </select>
              </label>
            ) : null}
            <span className="role-pill">{(activeWorkspace?.role ?? user.role).toUpperCase()}</span>
            <button className="secondary-button" onClick={() => void loadDashboard()} disabled={isLoading}>
              {isLoading ? 'Refreshing…' : '↻ Refresh'}
            </button>
          </div>
        </header>

        {!activeWorkspaceId ? (
          <section className="section-block">
            <div className="eyebrow">WORKSPACE SETUP</div>
            <h2>Select or create your workspace</h2>
            <p className="muted-note">Security records are isolated by workspace. Create a workspace to begin, or ask an administrator to add your existing account. This does not create a new login account.</p>
            <form className="inline-form" onSubmit={createWorkspace}>
              <div className="form-field grow">
                <label htmlFor="new-workspace-name">Workspace name</label>
                <input id="new-workspace-name" value={newWorkspaceName} onChange={(event) => setNewWorkspaceName(event.target.value)} maxLength={120} required placeholder="e.g. My security workspace" />
              </div>
              <button className="primary-button" type="submit" disabled={isSaving}>{isSaving ? 'Creating…' : 'Create workspace'}</button>
            </form>
          </section>
        ) : null}

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
          <article className="metric-card"><span className="metric-label">NEXUS IPS events</span><strong>{ipsEventTotal}</strong><small>Persisted internal protection events in PostgreSQL</small></article>
          <article className="metric-card"><span className="metric-label">AI score</span><strong>{summary?.summary.ai_score == null ? 'Not scored' : `${summary.summary.ai_score}/100`}</strong><small>No calibrated operational score is configured.</small></article>
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
            <span className="section-subtitle">NEXUS IPS containment events and trusted upstream telemetry</span>
          </div>

          <div className="section-heading">
            <div><div className="eyebrow">INTRUSION PREVENTION</div><h3>NEXUS IPS event ledger <span className="count-pill">{ipsEventTotal}</span></h3></div>
            <span className="section-subtitle">Latest {ipsEvents.length} of {ipsEventTotal} · source-filtered from PostgreSQL</span>
          </div>

          <div className="data-table-wrap">
            <table className="data-table">
              <thead><tr><th>Detection</th><th>Observed</th><th>HTTP signal</th><th>Response</th><th>Source fingerprint</th><th>Review</th></tr></thead>
              <tbody>
                {ipsEvents.map((event) => {
                  const attributes = event.attributes ?? {};
                  const httpSignal = [attributes.http_method, attributes.response_status].filter(Boolean).join(' · ') || '—';
                  const threshold = attributes.configured_limit
                    ? `${attributes.configured_limit} events / ${attributes.window_seconds ?? '?'}s`
                    : '—';
                  const fingerprint = attributes.source_ip_fingerprint;
                  return (
                    <tr key={event.id}>
                      <td><strong>{event.eventType}</strong><small className="row-id">{event.summary}</small></td>
                      <td>{displayDate(event.observedAt)}</td>
                      <td>{httpSignal}<small className="row-id">{threshold}</small></td>
                      <td>{attributes.response_action ?? '—'}</td>
                      <td><code>{fingerprint ? `${fingerprint.slice(0, 12)}…` : 'Unavailable'}</code><small className="row-id">Keyed HMAC · not a raw IP address</small></td>
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
                  );
                })}
                {ipsEvents.length === 0 ? <tr><td colSpan={6} className="empty-cell">{isLoading ? 'Loading NEXUS IPS events…' : 'No persisted NEXUS IPS containment events have been recorded yet.'}</td></tr> : null}
              </tbody>
            </table>
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
          <p className="muted-note">Events from <strong>nexus-ips</strong> are generated by NEXUS's own API protection layer and record temporary request-source containment. Other integration events are accepted only from trusted sources and remain evidence for analyst review; NEXUS does not independently verify those external detections. This is application-layer protection, not a host firewall or volumetric DDoS mitigation service.</p>
        </section>

        {isAdmin ? (
          <section className="section-block" id="team">
            <div className="section-heading">
              <div><div className="eyebrow">ACCESS CONTROL</div><h2>Team access <span className="count-pill">{managedUsers.length}</span></h2></div>
              <span className="section-subtitle">Selected workspace administrator only · Existing accounts only</span>
            </div>

            <form className="inline-form" onSubmit={createManagedUser}>
              <div className="form-field grow"><label htmlFor="new-user-email">Existing account email</label><input id="new-user-email" type="email" autoComplete="off" maxLength={254} value={newUserEmail} onChange={(event) => setNewUserEmail(event.target.value)} placeholder="existing-user@company.com" required /></div>
              <div className="form-field"><label htmlFor="new-user-role">Role</label><select id="new-user-role" value={newUserRole} onChange={(event) => setNewUserRole(event.target.value as 'analyst' | 'viewer')}><option value="analyst">Analyst</option><option value="viewer">Viewer</option></select></div>
              <button className="primary-button" type="submit" disabled={isSaving}>Add to workspace</button>
            </form>

            <div className="data-table-wrap">
              <table className="data-table">
                <thead><tr><th>Account</th><th>Role</th><th>Status</th><th>Created</th></tr></thead>
                <tbody>
                  {managedUsers.map((member) => (
                    <tr key={member.id}>
                      <td><strong>{member.email}</strong><small className="row-id">{member.id.slice(0, 8)}</small></td>
                      <td><span className="role-pill">{member.role}</span></td>
                      <td><span className={`status-pill ${member.status === 'active' ? 'status-contained' : 'status-closed'}`}>{member.status}</span></td>
                      <td>{displayDate(member.createdAt)}</td>
                    </tr>
                  ))}
                  {managedUsers.length === 0 ? <tr><td colSpan={4} className="empty-cell">No members have been added to this workspace yet.</td></tr> : null}
                </tbody>
              </table>
            </div>
            <p className="muted-note">Only existing accounts can be added. This grants access to the selected workspace; it does not create a login account or change the user's global role.</p>
          </section>
        ) : null}

        <ThreatIntelligencePanel key={activeWorkspaceId} workspaceId={activeWorkspaceId} events={securityEvents} canManage={canManage} />

        <section className="section-block" id="intelligence">
          <div className="section-heading">
            <div><div className="eyebrow">AI INTELLIGENCE</div><h2>Analyst decision support</h2></div>
            <span className="section-subtitle">Manual request only · No background AI calls</span>
          </div>

          {canManage ? (
            <form className="ai-analysis-form" onSubmit={submitThreatAnalysis}>
              <div className="ai-form-grid">
                <div className="form-field"><label htmlFor="analysis-target">Target or asset label</label><input id="analysis-target" value={analysisTarget} onChange={(event) => setAnalysisTarget(event.target.value)} maxLength={200} placeholder="e.g. endpoint-01" required /></div>
                <div className="form-field"><label htmlFor="analysis-source">Information source</label><input id="analysis-source" value={analysisSource} onChange={(event) => setAnalysisSource(event.target.value)} maxLength={200} placeholder="e.g. analyst-report" required /></div>
                <div className="form-field"><label htmlFor="analysis-signal">Signal type (optional)</label><input id="analysis-signal" value={analysisSignalType} onChange={(event) => setAnalysisSignalType(event.target.value)} maxLength={100} placeholder="e.g. authentication anomaly" /></div>
              </div>
              <div className="form-field ai-details-field"><label htmlFor="analysis-details">Observed details supplied by the analyst</label><textarea id="analysis-details" value={analysisDetails} onChange={(event) => setAnalysisDetails(event.target.value)} maxLength={5000} rows={4} placeholder="Paste a short, sanitized description of the observed signal. Do not include passwords, API keys, or unnecessary personal data." /></div>
              <div className="ai-submit-row">
                <span className="muted-note">This sends only the text above to the configured AI provider. It does not scan a device or network.</span>
                <button className="primary-button" type="submit" disabled={isAnalyzing}>{isAnalyzing ? 'Analyzing…' : 'Analyze submitted information'}</button>
              </div>
              {aiError ? <div className="notice notice-error" role="alert">{aiError}</div> : null}
            </form>
          ) : (
            <div className="muted-note">Viewer access is read-only. An administrator or analyst can submit information for AI analysis.</div>
          )}

          {aiAnalysis ? (
            <div className="ai-analysis-result">
              <div className="ai-result-header">
                <div><div className="eyebrow">AI-GENERATED ASSESSMENT</div><h3>{aiAnalysis.classification.toUpperCase()} · {aiAnalysis.target}</h3><p>Source: {aiAnalysis.source} · {aiAnalysis.provider} / {aiAnalysis.model}</p></div>
                <div className="ai-score"><strong>{aiAnalysis.risk_score}</strong><small>/100</small><span>model-assigned score</span></div>
              </div>
              <p className="ai-explanation">{aiAnalysis.explanation}</p>
              <div className="ai-result-grid">
                <div><h4>Findings</h4>{aiAnalysis.findings.length ? <ul>{aiAnalysis.findings.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p className="muted-note">No findings were returned.</p>}</div>
                <div><h4>Recommendations</h4>{aiAnalysis.recommendations.length ? <ul>{aiAnalysis.recommendations.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p className="muted-note">No recommendations were returned.</p>}</div>
              </div>
              <div className="ai-disclaimer">{aiAnalysis.disclaimer} This assessment is based only on submitted information and is not evidence of a confirmed incident.</div>
            </div>
          ) : null}
        </section>

        <footer className="dashboard-footer">
          <span>NEXUS SHIELD AI · Development build</span>
          <span>No live telemetry connected · No automated response enabled</span>
          <nav aria-label="Application information">
            <a href="/license">License</a> · <a href="/settings">Language & privacy</a> · <a href="/help">Help</a> · <a href="/contact">Contact</a> · <a href="/privacy">Privacy policy (draft)</a>
          </nav>
        </footer>
      </section>
    </main>
  );
}
