// website/app/security/threat-model/page.tsx
//
// Renders dependor-di/THREAT_MODEL.md in full. Heading ids come from the
// same slugify() the /security cards link to.
import type { Metadata } from 'next';
import Link from 'next/link';

import { renderMarkdown } from '@/lib/markdown';
import { getPackageMeta, readPackageDoc } from '@/lib/package-docs';

export const metadata: Metadata = {
  title: 'Threat model',
  description:
    'What the package defends against, how, and what it deliberately does not. Rendered from THREAT_MODEL.md in the package repository.',
  alternates: { canonical: '/security/threat-model' },
};

export default function ThreatModelPage() {
  const meta = getPackageMeta();
  const markdown = readPackageDoc('THREAT_MODEL.md');

  return (
    <main id="main" className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6">
      <p className="font-mono text-sm text-muted-foreground">
        <Link href="/security" className="underline underline-offset-4">
          /security
        </Link>{' '}
        · rendered from{' '}
        <a
          href={`${meta.repositoryUrl}/blob/main/THREAT_MODEL.md`}
          className="underline underline-offset-4"
          target="_blank"
          rel="noopener noreferrer"
        >
          THREAT_MODEL.md
        </a>{' '}
        for {meta.name}
      </p>
      <article className="mt-6">{renderMarkdown(markdown)}</article>
    </main>
  );
}
