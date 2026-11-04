import Link from 'next/link';
export default function ApplicationLicensePage() {
  return (
    <main className="trust-center">
      <header className="trust-header"><Link className="trust-brand" href="/">◈ NEXUS SHIELD AI</Link><Link href="/settings">Settings & privacy</Link></header>
      <section className="trust-hero"><div className="eyebrow">LEGAL · DRAFT FOR OWNER REVIEW</div><h1>Application License</h1><p>NEXUS SHIELD AI — proposed application-level license notice.</p></section>
      <article className="trust-card trust-prose">
        <h2>Proprietary application notice — proposed</h2><p>Unless a separate written agreement or an open-source license file states otherwise, the application name, branding, compiled application and owner-authored product materials are intended to be proprietary to their respective rights holders.</p>
        <h2>Permitted use</h2><p>Production use should be governed by a signed license or subscription agreement defining the authorized organization, users, deployment scope, duration, support and permitted security-testing purposes. This draft does not issue a production license.</p>
        <h2>Restrictions</h2><p>Users must not access systems without authorization, deploy malware, violate privacy or applicable law, or interfere with another party’s systems. Reverse-engineering restrictions, warranties, liability and commercial terms require owner/legal review and may be limited by law.</p>
        <h2>Third-party components</h2><p>Dependencies retain their own licenses. This application-level notice does not replace dependency license notices or grant rights to third-party software, data, signatures or AI services.</p>
        <h2>Security and availability</h2><p>The application is under development. No guarantee of uninterrupted service, detection of all threats or absolute security is made. AI outputs are advisory unless independently validated.</p>
        <h2>Finalization checklist</h2><ul><li>Confirm legal owner and jurisdiction.</li><li>Choose proprietary/commercial licensing or a specified open-source license for the repository.</li><li>Define pricing, trial, subscription, user/device limits, support, termination, warranties and liability.</li><li>Review with qualified counsel and publish effective date/contact.</li></ul>
        <p className="trust-warning">Status: draft. This is not a signed license or final legal agreement.</p>
      </article>
    </main>
  );
}
