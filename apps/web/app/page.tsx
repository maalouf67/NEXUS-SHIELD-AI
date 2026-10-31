'use client';

import { useEffect, useMemo, useState } from 'react';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000';

type ThreatSummary = {
  status: string;
  summary: {
    total_incidents: number;
    critical: number;
    mitigated: number;
    ai_score: number;
    updated_at: string;
  };
};

type ThreatAnalysis = {
  target: string;
  source: string;
  classification: string;
  risk_score: number;
  recommendations: string[];
};

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2.75 5.5 5.25v6.4c0 4.64 2.8 8.66 6.5 10.6 3.7-1.94 6.5-5.96 6.5-10.6v-6.4L12 2.75Zm2.9 8.5-3.4 3.4-1.7-1.7 1.2-1.2 0.5 0.5 2.2-2.2 1.2 1.2Z" />
    </svg>
  );
}

function CpuIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 2h6v2h2.5A2.5 2.5 0 0 1 20 6.5V9h2v6h-2v2.5a2.5 2.5 0 0 1-2.5 2.5H15v2H9v-2H6.5A2.5 2.5 0 0 1 4 17.5V15H2V9h2V6.5A2.5 2.5 0 0 1 6.5 4H9V2Zm3 5.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Zm0 2a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5Z" />
    </svg>
  );
}

function RadarIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2.5a9.5 9.5 0 0 1 9.5 9.5c0 5.25-4.25 9.5-9.5 9.5S2.5 17.25 2.5 12 7.75 2.5 12 2.5Zm0 2a7.5 7.5 0 0 0 0 15 7.5 7.5 0 0 0 0-15Zm0 2a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11Zm0 2a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm0 2a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z" />
    </svg>
  );
}

function NetworkIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4.5 6.5A2.5 2.5 0 0 1 7 4h10a2.5 2.5 0 0 1 2.5 2.5v11A2.5 2.5 0 0 1 17 18H7a2.5 2.5 0 0 1-2.5-2.5v-11Zm2.5 2h7v2H7v-2Zm0 4h10v2H7v-2Zm5 4h5v2h-5v-2Z" />
    </svg>
  );
}

function IdentityIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2.5a5 5 0 0 1 5 5 5 5 0 0 1-10 0 5 5 0 0 1 5-5Zm-7 16.5a7 7 0 0 1 14 0v1H5v-1Zm5-9.5a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z" />
    </svg>
  );
}

function BotIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 5.5A2.5 2.5 0 0 1 9.5 3h5A2.5 2.5 0 0 1 17 5.5V7h1.5A2.5 2.5 0 0 1 21 9.5v5A2.5 2.5 0 0 1 18.5 17H17v1.5A2.5 2.5 0 0 1 14.5 21h-5A2.5 2.5 0 0 1 7 18.5V17H5.5A2.5 2.5 0 0 1 3 14.5v-5A2.5 2.5 0 0 1 5.5 7H7V5.5Zm2 1.5h6V5.5a.5.5 0 0 0-.5-.5h-5a.5.5 0 0 0-.5.5V7Zm-1.5 4a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm8 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3ZM9 14h6v2H9v-2Z" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 19.5h16v2H4v-2Zm2-2h2V9H6v8.5Zm5 0h2V5h-2v12.5Zm5 0h2v-7h-2v7Z" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2.5a5.5 5.5 0 0 1 5.5 5.5v3.7l1.7 4.3H4.8l1.7-4.3V8A5.5 5.5 0 0 1 12 2.5Zm0 19a2.75 2.75 0 0 1-2.75-2.75h5.5A2.75 2.75 0 0 1 12 21.5Z" />
    </svg>
  );
}

function CogIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M19.14 12.94c.04-.31.06-.62.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.65l-1.92-3.32a.5.5 0 0 0-.61-.18l-2.39.96a7.4 7.4 0 0 0-1.63-.94L14.4 2.5a.5.5 0 0 0-.5-.5h-3.8a.5.5 0 0 0-.5.5l-.41 2.52c-.56.23-1.08.54-1.63.94l-2.39-.96a.5.5 0 0 0-.61.18L2.71 8.83a.5.5 0 0 0 .12.65l2.03 1.58c-.04.31-.06.62-.06.94s.02.63.06.94L2.83 14.52a.5.5 0 0 0-.12.65l1.92 3.32a.5.5 0 0 0 .61.18l2.39-.96c.55.4 1.07.71 1.63.94l.41 2.52a.5.5 0 0 0 .5.5h3.8a.5.5 0 0 0 .5-.5l.41-2.52c.56-.23 1.08-.54 1.63-.94l2.39.96a.5.5 0 0 0 .61-.18l1.92-3.32a.5.5 0 0 0-.12-.65l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5Z" />
    </svg>
  );
}

function MetricCard({
  title,
  value,
  detail,
  accent,
  icon
}: {
  title: string;
  value: string;
  detail: string;
  accent: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="metric-card">
      <div className="metric-header">
        <span className="metric-icon" style={{ background: accent }}>{icon}</span>
        <span className="metric-title">{title}</span>
      </div>
      <div className="metric-value">{value}</div>
      <div className="metric-detail">{detail}</div>
    </div>
  );
}

const staticAgents = [
  { name: 'AI Triage Engine', state: 'Operational', health: '99.7%' },
  { name: 'Threat Graph Correlator', state: 'Monitoring', health: '97.8%' },
  { name: 'Identity Guardian', state: 'Stable', health: '98.9%' },
  { name: 'Network Sentinel', state: 'Defense Ready', health: '99.1%' }
];

const activityFeed = [
  'Credential anomalies reviewed',
  'Lateral-movement markers evaluated',
  'Outbound traffic policy synced',
  'AI response workflow updated'
];

export default function HomePage() {
  const [summary, setSummary] = useState<ThreatSummary | null>(null);
  const [analysis, setAnalysis] = useState<ThreatAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        setIsLoading(true);

        const summaryResponse = await fetch(`${API_BASE_URL}/api/threats/summary`);
        if (!summaryResponse.ok) {
          throw new Error(`Summary fetch failed: ${summaryResponse.status}`);
        }
        const summaryData: ThreatSummary = await summaryResponse.json();
        setSummary(summaryData);

        const analysisResponse = await fetch(`${API_BASE_URL}/api/threats/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            target: 'edge-gateway-01',
            source: 'signal-correlator'
          })
        });

        if (analysisResponse.ok) {
          const analysisData: ThreatAnalysis = await analysisResponse.json();
          setAnalysis(analysisData);
        }
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to reach the live security API.');
      } finally {
        setIsLoading(false);
      }
    }

    void loadData();
  }, []);

  const metrics = useMemo(() => {
    if (!summary) {
      return [];
    }

    return [
      {
        title: 'Threat Exposure',
        value: `${(summary.summary.ai_score / 10).toFixed(1)}%`,
        detail: 'AI confidence score',
        accent: 'linear-gradient(135deg, rgba(0,229,255,.2), rgba(36,107,253,.45))',
        icon: <ShieldIcon />
      },
      {
        title: 'Active Incidents',
        value: summary.summary.total_incidents.toString(),
        detail: `${summary.summary.critical} critical`,
        accent: 'linear-gradient(135deg, rgba(139,92,246,.18), rgba(0,230,160,.3))',
        icon: <RadarIcon />
      },
      {
        title: 'Mitigated',
        value: `${summary.summary.mitigated}`,
        detail: 'resolved automatically',
        accent: 'linear-gradient(135deg, rgba(0,230,160,.2), rgba(0,229,255,.28))',
        icon: <NetworkIcon />
      },
      {
        title: 'Coverage',
        value: '94%',
        detail: 'network + endpoint coverage',
        accent: 'linear-gradient(135deg, rgba(36,107,253,.2), rgba(139,92,246,.25))',
        icon: <ChartIcon />
      }
    ];
  }, [summary]);

  const updated = summary ? new Date(summary.summary.updated_at).toLocaleString() : 'Awaiting API';

  return (
    <main className="page-shell">
      <div className="background-glow glow-one" />
      <div className="background-glow glow-two" />

      <div className="dashboard-frame">
        <aside className="sidebar">
          <div className="brand-block">
            <div className="brand-mark">
              <ShieldIcon />
            </div>
            <div>
              <div className="brand-mini">AI SECURITY</div>
              <h1>NEXUS SHIELD AI</h1>
            </div>
          </div>

          <nav className="nav">
            <button type="button" className="nav-item active">
              <CpuIcon />
              Overview
            </button>
            <button type="button" className="nav-item">
              <RadarIcon />
              Threat Intel
            </button>
            <button type="button" className="nav-item">
              <NetworkIcon />
              Network Defense
            </button>
            <button type="button" className="nav-item">
              <IdentityIcon />
              Identity
            </button>
            <button type="button" className="nav-item">
              <BotIcon />
              AI Assistant
            </button>
            <button type="button" className="nav-item">
              <CogIcon />
              Settings
            </button>
          </nav>

          <div className="status-panel">
            <div className="panel-label">System Health</div>
            <div className="status-row">
              <span className="status-dot success" />
              All defensive layers online
            </div>
          </div>
        </aside>

        <div className="content">
          <header className="topbar">
            <div>
              <div className="eyebrow">Security Command Center</div>
              <h2>AI Security Overview</h2>
            </div>

            <div className="topbar-actions">
              <button type="button" className="icon-button" aria-label="Notifications">
                <BellIcon />
              </button>
              <button type="button" className="cta-button">Run AI Scan</button>
            </div>
          </header>

          {error ? <div className="error-banner">{error}</div> : null}

          <section className="metrics-grid">
            {metrics.length > 0 ? (
              metrics.map((metric) => (
                <MetricCard
                  key={metric.title}
                  title={metric.title}
                  value={metric.value}
                  detail={metric.detail}
                  accent={metric.accent}
                  icon={metric.icon}
                />
              ))
            ) : (
              <div className="placeholder-card">Loading live security summary…</div>
            )}
          </section>

          <section className="panel-grid main-grid">
            <div className="panel large-panel">
              <div className="panel-header">
                <div>
                  <div className="panel-label">Operational Overview</div>
                  <h3>Threat flow signal</h3>
                </div>
                <span className="chip">Updated {updated}</span>
              </div>

              <div className="chart-area" aria-label="Threat trend chart">
                {[38, 52, 48, 74, 82, 94, 88, 70].map((value, index) => (
                  <div className="bar-col" key={`${value}-${index}`}>
                    <span className="bar" style={{ height: `${value}%` }} />
                  </div>
                ))}
              </div>
            </div>

            <div className="panel side-panel">
              <div className="panel-header compact-header">
                <div>
                  <div className="panel-label">AI Intelligence</div>
                  <h3>Response Logic</h3>
                </div>
              </div>

              <ul className="checklist">
                <li>Correlate suspicious identity events</li>
                <li>Contain suspicious endpoint behavior</li>
                <li>Prioritize critical asset exposure</li>
                <li>Recommend policy adjustments</li>
              </ul>
            </div>
          </section>

          <section className="panel-grid lower-grid">
            <div className="panel">
              <div className="panel-header compact-header">
                <div>
                  <div className="panel-label">Active Security Agents</div>
                  <h3>Agent matrix</h3>
                </div>
              </div>

              <div className="agent-list">
                {staticAgents.map((agent) => (
                  <div className="agent-row" key={agent.name}>
                    <div className="agent-meta">
                      <span className="agent-dot">•</span>
                      <div>
                        <div className="agent-name">{agent.name}</div>
                        <div className="agent-state">{agent.state}</div>
                      </div>
                    </div>
                    <span className="agent-health">{agent.health}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel">
              <div className="panel-header compact-header">
                <div>
                  <div className="panel-label">Recent Security Activity</div>
                  <h3>Event stream</h3>
                </div>
              </div>

              <div className="activity-list">
                {activityFeed.map((item) => (
                  <div className="activity-row" key={item}>
                    <span className="activity-dot" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel assistant-panel">
              <div className="panel-header compact-header">
                <div>
                  <div className="panel-label">AI Assistant</div>
                  <h3>Analyst decision support</h3>
                </div>
              </div>

              {analysis ? (
                <div className="assistant-body">
                  <div className="assistant-meta">
                    <span className="signal-tag">{analysis.classification}</span>
                    <span className="risk-score">Risk {analysis.risk_score}</span>
                  </div>
                  <div className="assistant-target">Target: {analysis.target}</div>
                  <div className="assistant-target secondary">Source: {analysis.source}</div>
                  <ul className="recommendations">
                    {analysis.recommendations.map((recommendation) => (
                      <li key={recommendation}>{recommendation}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="placeholder-card small">Awaiting live AI analysis…</div>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
