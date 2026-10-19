type LogoScheme = 'dark' | 'light' | 'monochrome';
type LogoVariant = 'full' | 'symbol';

export function NexusSymbol({ className = '', title = 'NEXUS SHIELD AI', size }: { className?: string; title?: string; size?: number }) {
  return (
    <svg className={className} style={size ? { width: size, height: size } : undefined} viewBox="0 0 100 100" role="img" aria-label={title} xmlns="http://www.w3.org/2000/svg">
      <path className="nx-logo-shield" d="M50 6 86 20v27c0 22-14 38-36 48C28 85 14 69 14 47V20L50 6Z" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinejoin="round" />
      <path className="nx-logo-network" d="M32 65V35l36 30V35" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path className="nx-logo-link" d="M32 50h36M50 50V50" fill="none" stroke="currentColor" strokeWidth="1.7" opacity=".58" />
      <circle cx="32" cy="35" r="4.2" fill="currentColor" />
      <circle cx="32" cy="65" r="4.2" fill="currentColor" />
      <circle cx="50" cy="50" r="4.2" fill="currentColor" />
      <circle cx="68" cy="35" r="4.2" fill="currentColor" />
      <circle cx="68" cy="65" r="4.2" fill="currentColor" />
    </svg>
  );
}

export function NexusLogo({
  variant = 'full',
  scheme = 'dark',
  className = '',
  symbolSize = 42,
}: {
  variant?: LogoVariant;
  scheme?: LogoScheme;
  className?: string;
  symbolSize?: number;
}) {
  return (
    <span className={`nx-logo nx-logo--${scheme} ${className}`} aria-label="NEXUS SHIELD AI">
      <NexusSymbol className="nx-logo-symbol" title="NEXUS SHIELD AI mark" size={symbolSize} />
      {variant === 'full' && (
        <span className="nx-logo-wordmark">
          <strong>NEXUS</strong>
          <span>SHIELD AI</span>
        </span>
      )}
    </span>
  );
}
