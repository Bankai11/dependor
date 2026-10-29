import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';

import './globals.css';

// `display: optional` means a slow first visit renders the metric-matched
// fallback instead of swapping fonts mid-paint, which keeps CLS at zero and
// Speed Index close to first paint. Subsequent visits use the cached font.
// shadcn's theme reads `--font-sans` (see app/globals.css), so the variable
// must be named exactly that or the whole site silently falls back to serif.
const geistSans = Geist({
  variable: '--font-sans',
  subsets: ['latin'],
  display: 'optional',
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
  display: 'optional',
});

export const metadata: Metadata = {
  // TODO: set NEXT_PUBLIC_SITE_URL in the deployment so canonical and OG URLs are absolute.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: {
    default: 'Wireup',
    template: '%s | Wireup',
  },
  description:
    'Wireup: a tiny, zero-dependency, type-safe dependency injection container with a verifiable supply chain.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:ring-3 focus:ring-ring/50"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
