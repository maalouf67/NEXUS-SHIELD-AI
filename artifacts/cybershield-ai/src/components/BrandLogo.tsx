type BrandLogoProps = {
  variant?: 'lockup' | 'symbol';
  tone?: 'dark' | 'light' | 'mono';
  className?: string;
};

export function BrandLogo({ variant = 'lockup', tone = 'dark', className = '' }: BrandLogoProps) {
  const stroke = tone === 'light' ? '#e9f0e5' : tone === 'mono' ? 'currentColor' : '#172b2a';
  const accent = tone === 'mono' ? 'currentColor' : '#c5f34b';
  return <span className={`brand-lockup ${className}`} aria-label="NEXUS SHIELD AI">
    <svg className="brand-symbol" viewBox="0 0 48 48" role="img" aria-label="NEXUS SHIELD AI geometric neural shield">
      <path d="M8 39V9l16 20V9m16 30V9L24 29" fill="none" stroke={accent} strokeWidth="3" strokeLinecap="square" strokeLinejoin="miter" />
      <path d="M24 4 42 11v12c0 11-7.4 17.4-18 22C13.4 40.4 6 34 6 23V11l18-7Z" fill="none" stroke={stroke} strokeWidth="1.35" opacity=".82" />
      <circle cx="8" cy="9" r="2" fill={accent} /><circle cx="24" cy="29" r="2" fill={accent} /><circle cx="40" cy="9" r="2" fill={accent} />
    </svg>
    {variant === 'lockup' && <span className="brand-name" style={{ color: stroke }}>NEXUS SHIELD AI<small>AI-POWERED AUTONOMOUS CYBER DEFENSE</small></span>}
  </span>;
}
