export default function ContactPage() {
  return (
    <main className="trust-center">
      <header className="trust-header"><a className="trust-brand" href="/">◈ NEXUS SHIELD AI</a><a href="/settings">Settings & privacy</a></header>
      <section className="trust-hero"><div className="eyebrow">SUPPORT · CONTACT</div><h1>Contact Us</h1><p>Support and security-reporting contact details for NEXUS SHIELD AI.</p></section>
      <section className="trust-card trust-prose">
        <h2>Support channel</h2><p>A verified support email or ticketing endpoint has not been configured. We intentionally do not display an invented contact address.</p>
        <h2>Report a security vulnerability</h2><p>Do not include credentials, personal data, live malware or sensitive production logs in public issues. The project owner must configure a private vulnerability-reporting channel and response policy before inviting external reports.</p>
        <h2>Before production</h2><ul><li>Configure a monitored support mailbox or secure ticket portal.</li><li>Publish a security disclosure contact and response expectations.</li><li>Define the data a support request may contain and its retention.</li></ul>
        <p className="trust-warning">Contact configuration is pending owner action.</p>
      </section>
    </main>
  );
}
