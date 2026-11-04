import Link from 'next/link';
export default function PrivacyPolicyPage() {
  return (
    <main className="trust-center">
      <header className="trust-header"><Link className="trust-brand" href="/">◈ NEXUS SHIELD AI</Link><Link href="/settings">Settings & privacy</Link></header>
      <section className="trust-hero"><div className="eyebrow">LEGAL · DRAFT FOR OWNER REVIEW</div><h1>Privacy Policy</h1><p>Draft policy for NEXUS SHIELD AI. It must be reviewed and finalized by the owner and qualified legal counsel before production.</p></section>
      <article className="trust-card trust-prose">
        <h2>1. Information processed</h2><p>The application may process account identifiers, authentication/security audit records, assets, incident information and security-event data submitted by authorized users or connected sources. Do not submit passwords, API keys or unrelated sensitive personal information.</p>
        <h2>2. Purpose and legal basis</h2><p>Information is intended to support account administration, security monitoring, analyst review, incident handling and service protection. The owner must determine and document the applicable legal basis and notices for each deployment.</p>
        <h2>3. AI-assisted analysis</h2><p>When an authorized analyst explicitly submits information for AI analysis, submitted fields may be sent to the configured AI provider. Minimize and redact personal data. Output is advisory, not proof of an incident. Provider terms and retention must be reviewed before enabling this feature.</p>
        <h2>4. Sharing and third parties</h2><p>Data may be processed by infrastructure and AI providers configured by the deployment owner. Do not submit samples to external scanning providers without separate explicit consent and disclosure. The owner must publish the actual provider list before release.</p>
        <h2>5. Security</h2><p>The project is designed to use access controls, server-side credentials, validation, rate limiting, audit trails and encrypted connections. No measure guarantees absolute protection.</p>
        <h2>6. Retention, access, correction and deletion</h2><p>The current development source schedules quarantined sample-file deletion after 7 days and scan-history metadata deletion after 30 days. An API cleanup task is configured to attempt deletion at startup and every six hours; if storage deletion cannot be confirmed, the sample record remains pending cleanup. These periods and automation require operational verification and owner/legal review before production use. Export, correction, account deletion and backup expiry still require separate definition and implementation.</p>
        <h2>7. Cookies and local preferences</h2><p>Authentication may use a session cookie. Settings stores language and optional privacy preferences in browser storage. These preferences do not currently activate analytics or product-update collection.</p>
        <h2>8. Children and sensitive data</h2><p>The service is intended for organizational security operations. The owner must define age-related requirements and avoid processing sensitive personal data unless necessary, lawful and adequately protected.</p>
        <h2>9. Contact and updates</h2><p>The owner must configure a verified privacy contact and effective date before publication.</p>
        <h2>10. Morocco and applicable law</h2><p>The owner should assess applicable Moroccan data-protection requirements, including Law 09-08 and CNDP obligations where applicable, plus laws relevant to users and deployment. This is not legal advice.</p>
        <p className="trust-warning">Status: draft. Effective date and verified privacy contact are not configured. Do not present this as a finalized legal policy.</p>
      </article>
    </main>
  );
}
