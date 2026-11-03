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
        <h2>How does file scanning work?</h2><p>Admin and Analyst users can submit one file (up to 100 MiB) from the <a href="/scan">File security scan</a> page. The server stores it under a generated SHA-256 identifier in private quarantine and asks ClamAV for a signature-based verdict. The scanner service and signature database must be running and configured; otherwise the sample remains quarantined without a clean verdict. A clean result is not proof that a file is harmless.</p>
        <h2>Are uploads retained?</h2><p>Samples remain in the private quarantine volume until an operator removes them. Scan history is not persisted in the application database, and automated retention cleanup and scan queues are not implemented yet. Do not upload highly sensitive files without deployment-owner approval.</p>
        <h2>Manage privacy and language</h2><p>Open <a href="/settings">Settings & Privacy Center</a>. Language preference is stored locally; complete dashboard translation remains under development.</p>
        <h2>Legal documents</h2><p>Read the <a href="/license">Application License draft</a> and <a href="/privacy">Privacy Policy draft</a>. Both require owner/legal review.</p>
        <h2>More help</h2><p>Visit <a href="/contact">Contact Us</a>. A verified support channel still needs configuration.</p>
      </section>
    </main>
  );
}
