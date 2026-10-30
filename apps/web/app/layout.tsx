import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'NEXUS SHIELD AI',
  description: 'AI-driven cyber defense operations platform'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
