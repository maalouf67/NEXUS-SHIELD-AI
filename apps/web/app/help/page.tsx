export default function HelpCenterPage() {
  return (
    <main className="trust-center">
      <header className="trust-header"><a className="trust-brand" href="/">◈ NEXUS SHIELD AI</a><a href="/settings">Settings & privacy</a></header>
      <section className="trust-hero"><div className="eyebrow">SUPPORT · KNOWLEDGE BASE</div><h1>Help Center</h1><p>Guidance for the current development build.</p></section>
      <section className="trust-card trust-prose">
        <h2>How do I sign in?</h2><p>Your administrator must provision an account and role. Never share a password or session token.</p>
        <h2>What do dashboard metrics mean?</h2><p>Metrics marked demo/sample are illustrative, not live telemetry or proof of active protection.</p>
        <h2>How does AI analysis work?</h2><p>An admin or analyst manually submits a target, source and sanitized observations. The model returns advisory findings. It does not scan your device/network, confirm an incident or perform containment.</p>
        <h2>Why might AI be unavailable?</h2><p>The server-side OpenAI credential and internal service token must be configured by the operator. Do not expose credentials in browser-visible environment variables.</p>
        <h2>Does the app scan files for viruses?</h2><p>No production antivirus scanner or file-upload quarantine pipeline is enabled. Do not upload malware samples to this development build. The scanning architecture is documented as a staged plan.</p>
        <h2>Manage privacy and language</h2><p>Open <a href="/settings">Settings & Privacy Center</a>. Language preference is stored locally; complete dashboard translation remains under development.</p>
        <h2>Legal documents</h2><p>Read the <a href="/license">Application License draft</a> and <a href="/privacy">Privacy Policy draft</a>. Both require owner/legal review.</p>
        <h2>More help</h2><p>Visit <a href="/contact">Contact Us</a>. A verified support channel still needs configuration.</p>
      </section>
    </main>
  );
}
