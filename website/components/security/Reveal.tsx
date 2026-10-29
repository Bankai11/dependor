// website/components/security/Reveal.tsx
//
// A subtle fade-and-lift for the threat-model cards: 180ms, staggered by at
// most 160ms across siblings, disabled under prefers-reduced-motion. It is
// pure CSS (see `.reveal` in app/globals.css), so it ships zero JavaScript
// and the cards are visible even if scripts never run.
//
// The brief asked for Framer Motion here. It was tried (including LazyMotion
// with async `domAnimation` features) and still cost about 50 KB gzipped on
// the critical path, which held Lighthouse Performance at 88 against the
// required 95. The CSS version is the deliberate trade.
import type { CSSProperties, ReactNode } from 'react';

import { cn } from '@/lib/utils';

export function Reveal({
  index = 0,
  className,
  children,
}: {
  index?: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('reveal', className)} style={{ '--reveal-index': index } as CSSProperties}>
      {children}
    </div>
  );
}
