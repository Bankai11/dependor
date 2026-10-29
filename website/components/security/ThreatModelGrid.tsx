// website/components/security/ThreatModelGrid.tsx
//
// Server component. Receives already-parsed THREAT_MODEL.md data from the
// page and renders the five in-scope attack classes as cards plus the
// out-of-scope disclosure. No client JavaScript is involved: the reveal is
// CSS and the disclosure is a native <details> element.
//
// Two deliberate departures from the stock shadcn pieces, both measured:
// - Card headers are plain divs rather than <CardHeader>, whose
//   `@container` query forced an extra layout pass per card.
// - The out-of-scope list uses <details>/<summary> instead of the Base UI
//   Accordion, which cost about 15 KB of hydrated JavaScript for one toggle.
import { ArrowRightIcon, ChevronDownIcon } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { Reveal } from '@/components/security/Reveal';
import { badgeVariants } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

export interface ThreatCard {
  id: string;
  /** Display name used on the card. */
  name: string;
  /** `2.1`, `2.2`, ... from THREAT_MODEL.md. */
  sectionNumber: string;
  /** Section title from THREAT_MODEL.md. */
  sectionTitle: string;
  /** The attacker summary sentence, rendered from markdown. */
  description: ReactNode;
  /** The mitigation text, rendered from markdown. */
  mitigation: ReactNode;
  /** Where the mitigation lives (file or setting), rendered from markdown. */
  where: ReactNode;
  /** Link into the full threat model. */
  href: string;
}

export interface ThreatModelGridProps {
  cards: ThreatCard[];
  outOfScope: ReactNode[];
  outOfScopeHref: string;
}

export function ThreatModelGrid({ cards, outOfScope, outOfScopeHref }: ThreatModelGridProps) {
  return (
    <div>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="In-scope attack classes">
        {cards.map((card, index) => (
          <li key={card.id} className="flex">
            <Reveal index={index} className="flex w-full">
              <Card className="flex w-full flex-col">
                <div className="flex flex-col gap-1 px-(--card-spacing)">
                  <span className={badgeVariants({ variant: 'outline', className: 'w-fit font-mono tabular-nums' })}>
                    Section {card.sectionNumber}
                  </span>
                  <h3 className="mt-2 font-heading text-lg leading-snug font-medium">{card.name}</h3>
                  <p className="text-sm leading-6 text-muted-foreground">{card.description}</p>
                </div>
                <CardContent className="mt-auto space-y-3">
                  <div>
                    <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                      Mitigation
                    </p>
                    <p className="mt-1 leading-6">{card.mitigation}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Where: {card.where}</p>
                  </div>
                  <Link
                    href={card.href}
                    className="inline-flex items-center gap-1 text-sm underline underline-offset-4 decoration-foreground/40 hover:decoration-foreground"
                  >
                    Read section {card.sectionNumber}
                    <ArrowRightIcon aria-hidden="true" className="size-3.5" />
                  </Link>
                </CardContent>
              </Card>
            </Reveal>
          </li>
        ))}
      </ul>

      <details className="group/details mt-8 rounded-xl border px-4">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg py-3 text-base font-medium outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
          Explicitly out of scope
          <ChevronDownIcon
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open/details:rotate-180"
          />
        </summary>
        <div className="pb-4">
          <ul className="list-disc space-y-2 pl-5 text-sm leading-6">
            {outOfScope.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
          <Link
            href={outOfScopeHref}
            className="mt-4 inline-flex items-center gap-1 text-sm underline underline-offset-4 decoration-foreground/40 hover:decoration-foreground"
          >
            Read this list in context
            <ArrowRightIcon aria-hidden="true" className="size-3.5" />
          </Link>
        </div>
      </details>
    </div>
  );
}
