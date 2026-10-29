import { ArrowRightIcon } from 'lucide-react';
import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';

// Placeholder home. The /security page is the deliverable; this exists so the
// site has a root route and a path to it.
export default function Home() {
  return (
    <main
      id="main"
      className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center px-4 py-24 sm:px-6"
    >
      <p className="font-mono text-sm text-muted-foreground">Wireup</p>
      <h1 className="mt-4 text-4xl font-semibold tracking-tight">
        Dependency injection you can verify.
      </h1>
      <p className="mt-4 max-w-xl leading-7 text-muted-foreground">
        A tiny, zero-dependency, type-safe container for Node.js and TypeScript, published only from CI with signed
        provenance.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/security" className={buttonVariants({ size: 'lg' })}>
          Verify the supply chain
          <ArrowRightIcon aria-hidden="true" data-icon="inline-end" />
        </Link>
        <Link href="/blog" className={buttonVariants({ size: 'lg', variant: 'outline' })}>
          Read the blog
        </Link>
      </div>
    </main>
  );
}
