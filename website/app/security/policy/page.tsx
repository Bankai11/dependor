// website/app/security/policy/page.tsx
//
// Renders dependor-di/SECURITY.md in full, including its TODO placeholder
// for the disclosure email. The placeholder is deliberately not hidden.
import type { Metadata } from 'next';
import Link from 'next/link';

import { renderMarkdown } from '@/lib/markdown';
import { getPackageMeta, readPackageDoc } from '@/lib/package-docs';

export const metadata: Metadata = {
  title: 'Security policy',
  description:
    'How to report a vulnerability privately and the 90-day coordinated disclosure policy. Rendered from SECURITY.md in the package repository.',
  alternates: { canonical: '/security/policy' },
};

export default function PolicyPage() {
  const meta = getPackageMeta();
  const markdown = readPackageDoc('SECURITY.md');

  return (
    <main id="main" className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6">
      <p className="font-mono text-sm text-muted-foreground">
        <Link href="/security" className="underline underline-offset-4">
          /security
        </Link>{' '}
        · rendered from{' '}
        <a
          href={`${meta.repositoryUrl}/blob/main/SECURITY.md`}
          className="underline underline-offset-4"
          target="_blank"
          rel="noopener noreferrer"
        >
          SECURITY.md
        </a>{' '}
        for {meta.name}
      </p>
      <article className="mt-6">{renderMarkdown(markdown)}</article>
    </main>
  );
}
