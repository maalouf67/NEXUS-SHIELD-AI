export default function PrivacyPolicyPage() {
  return (
    <main className="trust-center">
      <header className="trust-header">
        <a className="trust-brand" href="/">◈ NEXUS SHIELD AI</a>
        <a href="/settings">Settings &amp; privacy</a>
      </header>

      <section className="trust-hero">
        <div className="eyebrow">LEGAL · DRAFT FOR OWNER AND LEGAL REVIEW</div>
        <h1>Privacy Policy</h1>
        <p>
          This draft describes privacy practices and processing that may occur in NEXUS SHIELD AI,
          based on the current development source. Actual practices depend on the deployment,
          enabled features, and configured service providers. The owner must verify and complete
          this policy before public release.
        </p>
      </section>

      <article className="trust-card trust-prose">
        <h2>1. Scope and responsibility</h2>
        <p>
          NEXUS SHIELD AI is a cybersecurity application intended to support organizational
          security operations. The organization or person operating a deployment is responsible
          for determining its role under applicable data-protection law, providing required
          notices, and ensuring that its configuration and use are lawful.
        </p>

        <h2>2. Information that may be processed</h2>
        <p>
          Depending on the features used and information submitted, the application may process
          account identifiers; authentication and security-audit records; asset and incident
          information; security-event data; and files submitted for security scanning, together
          with associated scan metadata. Connected sources may provide additional information
          configured by the deployment owner. Do not submit passwords, API keys, or unrelated
          sensitive personal information.
        </p>

        <h2>3. Purposes of processing</h2>
        <p>
          Information may be used to administer accounts, support security monitoring and
          analyst review, handle incidents, inspect submitted files, maintain service security,
          and operate the application. The deployment owner must identify and document the
          applicable legal basis and purposes for its specific deployment.
        </p>

        <h2>4. AI-assisted analysis</h2>
        <p>
          When an authorized user explicitly submits information for AI-assisted analysis,
          selected submitted fields may be transmitted to the AI provider configured for that
          deployment. Users and operators should minimize information and redact personal data
          where feasible. AI output is advisory and does not, by itself, establish that an
          incident or threat is real. The owner must verify the provider, its terms, processing
          location, and retention practices before enabling or promoting this functionality.
        </p>

        <h2>5. Service providers and sharing</h2>
        <p>
          Information may be processed by hosting, infrastructure, and AI providers configured
          by the deployment owner, as necessary to operate enabled features. The actual providers,
          purposes, and any applicable international transfers must be disclosed by the owner
          before release. Files or samples must not be sent to external scanning providers
          without the required authorization and disclosure. NEXUS SHIELD AI does not claim that
          a specific provider list is configured in every deployment.
        </p>

        <h2>6. Security safeguards</h2>
        <p>
          The project includes or is designed to use safeguards such as access controls,
          server-side handling of credentials, input validation, rate limiting, audit records,
          and encrypted connections. Safeguards depend on correct configuration and operation.
          No system or transmission method can be guaranteed to be completely secure.
        </p>

        <h2>7. Retention and deletion</h2>
        <p>
          In the current development source, quarantined uploaded sample files are scheduled for
          deletion after 7 days, and scan metadata is scheduled for deletion after 30 days.
          A cleanup task is configured to attempt deletion at startup and every six hours; if
          storage deletion cannot be confirmed, the sample record remains pending cleanup.
          These are source-code settings and have not been represented as independently verified
          production behavior. Retention for other information, backups, and account records
          must be defined and verified by the deployment owner.
        </p>

        <h2>8. Privacy rights and requests</h2>
        <p>
          Depending on applicable law, individuals may have rights to access, correct, object to,
          restrict, or request deletion of personal information. The owner must establish a
          verified privacy contact and a process to receive, authenticate, and respond to such
          requests, including any applicable legal exceptions and deadlines. Those procedures
          are not specified by this draft.
        </p>

        <h2>9. Cookies and browser storage</h2>
        <p>
          Authentication may use a session cookie. The Settings page stores language and optional
          privacy preferences in browser storage. According to the current source, the optional
          product-update and analytics preferences are off by default and are stored in the
          browser; they do not currently activate server-side collection.
        </p>

        <h2>10. Children and sensitive information</h2>
        <p>
          The application is intended for organizational security operations, not specifically
          for children. The deployment owner must define applicable age-related requirements and
          avoid processing sensitive personal information unless it is necessary, lawful, and
          adequately protected.
        </p>

        <h2>11. Changes to this policy</h2>
        <p>
          This policy should be updated when the application, enabled features, data practices,
          or service providers change. The owner must provide an effective date and any notices
          required by applicable law.
        </p>

        <h2>12. Applicable law</h2>
        <p>
          The owner must assess applicable data-protection requirements, including Moroccan
          Law 09-08 and relevant CNDP obligations where applicable, as well as requirements
          arising in other jurisdictions where users or deployments are located. This document
          is informational and is not legal advice.
        </p>

        <h2>13. Privacy contact</h2>
        <p>
          A verified privacy contact has not yet been configured in the project. The owner must
          add a monitored contact channel before publication and explain how privacy requests
          and concerns can be submitted.
        </p>

        <p className="trust-warning">
          Status: draft — not legally approved for publication. The deployment owner must verify
          actual data flows, providers, retention behavior, applicable legal requirements,
          configure a privacy contact, set an effective date, and obtain qualified legal review
          before presenting this policy as final.
        </p>
      </article>
    </main>
  );
}
