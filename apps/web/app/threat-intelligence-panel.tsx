'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SecurityEvent } from '../services/dashboard-api';
import { ApiClientError, apiRequest } from '../api/client';

interface ThreatIntelligenceOverview {
  metrics: {
    active_indicators: number;
    assessments_24h: number;
    anomalies_24h: number;
    open_warnings: number;
    events_24h: number;
  };
  trained_model_active: boolean;
  external_intelligence_feeds_active: boolean;
}

interface ThreatRiskAssessment {
  id: string;
  security_event_id: string;
  risk_score: number;
  confidence: number;
  assessment_method: string;
  model_version: string;
  evidence: Array<{ type: string; value: string | number }>;
  assessed_at: string;
}

interface AssessmentHistoryResponse {
  assessments: ThreatRiskAssessment[];
}

interface AssessmentResponse {
  assessment: ThreatRiskAssessment & { risk_band: string };
  event_velocity_24h: number;
  anomaly_recorded: boolean;
  anomaly_threshold: number;
  trained_model_used: boolean;
  disclaimer: string;
}

function displayDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown date' : date.toLocaleString();
}

export default function ThreatIntelligencePanel({
  workspaceId,
  events,
  canManage
}: {
  workspaceId: string;
  events: SecurityEvent[];
  canManage: boolean;
}) {
  const [overview, setOverview] = useState<ThreatIntelligenceOverview | null>(null);
  const [assessments, setAssessments] = useState<ThreatRiskAssessment[]>([]);
  const [latestResult, setLatestResult] = useState<AssessmentResponse | null>(null);
  const [busyEventId, setBusyEventId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    if (!workspaceId) {
      setOverview(null);
      setAssessments([]);
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      const [metrics, history] = await Promise.all([
        apiRequest<ThreatIntelligenceOverview>('/api/nexus/threat-intelligence/overview'),
        apiRequest<AssessmentHistoryResponse>('/api/nexus/threat-intelligence/assessments?limit=10')
      ]);
      setOverview(metrics);
      setAssessments(history.assessments ?? []);
    } catch (requestError) {
      if (requestError instanceof ApiClientError && requestError.status === 401) {
        window.location.replace('/login');
        return;
      }
      setError(requestError instanceof Error ? requestError.message : 'Threat intelligence data could not be loaded.');
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    setLatestResult(null);
    setNotice('');
    void load();
  }, [load]);

  async function assessEvent(eventId: string) {
    if (!canManage || busyEventId) return;
    setBusyEventId(eventId);
    setError('');
    setNotice('');
    try {
      const result = await apiRequest<AssessmentResponse>(
        `/api/nexus/threat-intelligence/events/${encodeURIComponent(eventId)}/assess`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}'
        }
      );
      setLatestResult(result);
      setNotice(result.anomaly_recorded
        ? 'Assessment saved. The event crossed the configured velocity threshold and an anomaly finding was recorded.'
        : 'Assessment saved. No anomaly threshold was crossed.');
      await load();
    } catch (requestError) {
      if (requestError instanceof ApiClientError && requestError.status === 401) {
        window.location.replace('/login');
        return;
      }
      setError(requestError instanceof Error ? requestError.message : 'The event assessment could not be saved.');
    } finally {
      setBusyEventId('');
    }
  }

  if (!workspaceId) return null;

  return (
    <section className="section-block" id="threat-intelligence">
      <div className="section-heading">
        <div>
          <div className="eyebrow">THREAT INTELLIGENCE</div>
          <h2>Threat intelligence &amp; predictive analytics</h2>
        </div>
        <button className="secondary-button" onClick={() => void load()} disabled={isLoading}>
          {isLoading ? 'Refreshing…' : '↻ Refresh intelligence'}
        </button>
      </div>

      <div className="metrics-grid">
        <article className="metric-card">
          <span className="metric-label">Active indicators</span>
          <strong>{overview?.metrics.active_indicators ?? '—'}</strong>
          <small>Unexpired indicator fingerprints in this workspace</small>
        </article>
        <article className="metric-card">
          <span className="metric-label">Assessments · 24h</span>
          <strong>{overview?.metrics.assessments_24h ?? '—'}</strong>
          <small>Persisted risk assessments</small>
        </article>
        <article className="metric-card">
          <span className="metric-label">Anomalies · 24h</span>
          <strong>{overview?.metrics.anomalies_24h ?? '—'}</strong>
          <small>Recorded velocity-threshold findings</small>
        </article>
        <article className="metric-card">
          <span className="metric-label">Open warnings</span>
          <strong>{overview?.metrics.open_warnings ?? '—'}</strong>
          <small>Warnings awaiting analyst handling</small>
        </article>
        <article className="metric-card">
          <span className="metric-label">Events · 24h</span>
          <strong>{overview?.metrics.events_24h ?? '—'}</strong>
          <small>Security events recorded in PostgreSQL</small>
        </article>
      </div>

      <div className="notice notice-warning">
        <strong>BASELINE ANALYTICS</strong>
        <span>
          {overview?.trained_model_active
            ? 'A trained model is reported as active.'
            : 'Risk scores use transparent deterministic heuristics, not a trained predictive model.'}
          {' '}
          {overview?.external_intelligence_feeds_active
            ? 'External intelligence feeds are reported as connected.'
            : 'No external threat-intelligence feed is connected yet.'}
        </span>
      </div>

      {error ? <div className="notice notice-error" role="alert">{error}</div> : null}
      {notice ? <div className="notice notice-warning" role="status">{notice}</div> : null}

      {latestResult ? (
        <div className="ai-analysis-result" aria-live="polite">
          <div className="ai-result-header">
            <div>
              <div className="eyebrow">LATEST SAVED ASSESSMENT</div>
              <h3>{latestResult.assessment.risk_band.toUpperCase()} · {latestResult.assessment.risk_score}/100</h3>
              <p>Model version: {latestResult.assessment.model_version} · Confidence: {(latestResult.assessment.confidence * 100).toFixed(0)}%</p>
            </div>
            <div className="ai-score">
              <strong>{latestResult.event_velocity_24h}</strong>
              <small>events</small>
              <span>same type · 24h</span>
            </div>
          </div>
          <div className="ai-disclaimer">{latestResult.disclaimer}</div>
        </div>
      ) : null}

      <div className="section-heading">
        <div>
          <div className="eyebrow">ANALYST WORKBENCH</div>
          <h3>Recent security events</h3>
        </div>
        <span className="section-subtitle">Assessment is manual and workspace-scoped</span>
      </div>
      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr><th>Event</th><th>Severity</th><th>Observed</th><th>Assessment</th></tr>
          </thead>
          <tbody>
            {events.slice(0, 8).map((event) => (
              <tr key={event.id}>
                <td>
                  <strong>{event.eventType}</strong>
                  <small className="row-id">{event.summary}</small>
                </td>
                <td><span className={`severity-pill severity-${event.severity === 'informational' ? 'low' : event.severity}`}>{event.severity}</span></td>
                <td>{displayDate(event.observedAt)}</td>
                <td>
                  {canManage ? (
                    <button className="text-button" onClick={() => void assessEvent(event.id)} disabled={Boolean(busyEventId)}>
                      {busyEventId === event.id ? 'Assessing…' : 'Assess event'}
                    </button>
                  ) : <span className="muted-note">Analyst access required</span>}
                </td>
              </tr>
            ))}
            {events.length === 0 ? (
              <tr><td colSpan={4} className="empty-cell">No security events are available for assessment in this workspace.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="section-heading" style={{ marginTop: 22 }}>
        <div>
          <div className="eyebrow">PERSISTED RESULTS</div>
          <h3>Recent risk assessments</h3>
        </div>
        <span className="section-subtitle">Latest {assessments.length} records</span>
      </div>
      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr><th>Risk score</th><th>Confidence</th><th>Method</th><th>Assessed</th><th>Event ID</th></tr>
          </thead>
          <tbody>
            {assessments.map((item) => (
              <tr key={item.id}>
                <td><strong>{Number(item.risk_score).toFixed(1)}/100</strong></td>
                <td>{(Number(item.confidence) * 100).toFixed(0)}%</td>
                <td>{item.assessment_method}</td>
                <td>{displayDate(item.assessed_at)}</td>
                <td><code>{item.security_event_id.slice(0, 8)}…</code></td>
              </tr>
            ))}
            {assessments.length === 0 ? (
              <tr><td colSpan={5} className="empty-cell">{isLoading ? 'Loading assessments…' : 'No risk assessments have been saved yet.'}</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
