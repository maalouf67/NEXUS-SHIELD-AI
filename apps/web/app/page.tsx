const insightCards = [
  { title: 'Threat Exposure', value: '11.2%', detail: 'Down 3.4% this week' },
  { title: 'AI Actions', value: '248', detail: 'Resolved automatically' },
  { title: 'Incidents', value: '17', detail: '4 critical' },
  { title: 'Coverage', value: '94%', detail: 'Across endpoints' }
];

export default function HomePage() {
  return (
    <main style={{ padding: '2rem', fontFamily: 'sans-serif', background: '#07111f', color: '#f4f7fb', minHeight: '100vh' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <div>
            <p style={{ margin: 0, color: '#7dd3fc', letterSpacing: '0.12em', textTransform: 'uppercase', fontSize: 12 }}>Security Command Center</p>
            <h1 style={{ margin: '0.5rem 0 0', fontSize: '2.5rem' }}>NEXUS SHIELD AI</h1>
          </div>
          <button style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: 10, padding: '0.8rem 1.2rem', fontWeight: 700 }}>
            Run AI Scan
          </button>
        </header>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
          {insightCards.map((card) => (
            <div key={card.title} style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 16, padding: '1.2rem' }}>
              <p style={{ margin: 0, color: '#94a3b8' }}>{card.title}</p>
              <h2 style={{ margin: '0.7rem 0', fontSize: '2rem' }}>{card.value}</h2>
              <small style={{ color: '#7dd3fc' }}>{card.detail}</small>
            </div>
          ))}
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.8fr', gap: '1.5rem', marginTop: '2rem' }}>
          <div style={{ background: '#0f172a', borderRadius: 16, padding: '1.5rem', border: '1px solid #1e293b' }}>
            <h3 style={{ marginTop: 0 }}>Operational Overview</h3>
            <div style={{ height: 220, background: 'linear-gradient(135deg, #0b2545 0%, #111827 100%)', borderRadius: 12, display: 'flex', alignItems: 'end', padding: '1rem', gap: '0.75rem' }}>
              {[38, 52, 48, 72, 90, 96, 82, 70].map((value, index) => (
                <div key={value + index} style={{ flex: 1, height: `${value}%`, background: 'linear-gradient(180deg, #38bdf8, #2563eb)', borderRadius: '10px 10px 0 0' }} />
              ))}
            </div>
          </div>

          <div style={{ background: '#0f172a', borderRadius: 16, padding: '1.5rem', border: '1px solid #1e293b' }}>
            <h3 style={{ marginTop: 0 }}>Intelligent Response</h3>
            <ul style={{ paddingLeft: '1.1rem', color: '#dbeafe', lineHeight: '1.9' }}>
              <li>Block malicious traffic signatures</li>
              <li>Correlate endpoint anomalies</li>
              <li>Prioritize high-risk assets</li>
              <li>Generate policy recommendations</li>
            </ul>
          </div>
        </section>
      </div>
    </main>
  );
}
