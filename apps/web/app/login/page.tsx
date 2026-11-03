'use client';

import { FormEvent, useState } from 'react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        cache: 'no-store'
      });
      const result = await response.json().catch(() => null);

      if (!response.ok) {
        setError(
          result?.message ??
          (result?.error === 'AUTH_SERVICE_UNAVAILABLE'
            ? 'The authentication service is not configured or cannot be reached.'
            : 'Sign-in failed. Check your credentials and try again.')
        );
        return;
      }

      window.location.replace('/');
    } catch {
      setError('The sign-in service could not be reached.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-shell">
      <div className="auth-glow auth-glow-one" />
      <div className="auth-glow auth-glow-two" />

      <section className="auth-card">
        <div className="auth-brand">
          <div className="auth-brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M12 2.5 4.5 5.4v6.1c0 5.1 3.1 8.4 7.5 10 4.4-1.6 7.5-4.9 7.5-10V5.4L12 2.5Zm3.7 7.3-4.2 4.6-2.2-2.2 1.4-1.4 0.7 0.7 2.8-3.1 1.5 1.4Z" />
            </svg>
          </div>
          <div>
            <div className="auth-kicker">SECURITY OPERATIONS</div>
            <h1>NEXUS SHIELD AI</h1>
          </div>
        </div>

        <div className="auth-heading">
          <span className="eyebrow">AUTHORIZED ACCESS</span>
          <h2>Welcome back</h2>
          <p>Sign in to review incidents, alerts, and analyst activity.</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label htmlFor="email">Work email</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            maxLength={254}
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@company.com"
          />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            maxLength={128}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter your password"
          />

          {error ? <div className="auth-error" role="alert">{error}</div> : null}

          <button className="primary-button auth-submit" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in…' : 'Sign in securely'}
          </button>
        </form>

        <div className="auth-footnote">
          <span className="status-dot success" />
          Protected by server-side authentication
        </div>
      </section>

      <p className="auth-legal">
        Access is limited to provisioned NEXUS SHIELD AI accounts. Public registration is disabled.
      </p>
    </main>
  );
}
