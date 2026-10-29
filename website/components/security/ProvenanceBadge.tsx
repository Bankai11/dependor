// website/components/security/ProvenanceBadge.tsx
//
// Async server component. Calls the registry helpers (never from the client)
// and renders three status pills. The skeleton below reserves identical
// dimensions so the hero does not shift when the data streams in.
import { CheckCircle2Icon, MinusIcon, TriangleAlertIcon, XCircleIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { getLatestVersion, getProvenance, getSignatures } from '@/lib/npm';
import { cn } from '@/lib/utils';

type Tone = 'ok' | 'warn' | 'bad' | 'neutral';

const toneClass: Record<Tone, string> = {
  ok: 'border-emerald-600/30 bg-emerald-50 text-emerald-900 dark:border-emerald-400/30 dark:bg-emerald-950/50 dark:text-emerald-100',
  warn: 'border-amber-600/30 bg-amber-50 text-amber-950 dark:border-amber-400/30 dark:bg-amber-950/50 dark:text-amber-100',
  bad: 'border-red-600/30 bg-red-50 text-red-950 dark:border-red-400/30 dark:bg-red-950/50 dark:text-red-100',
  neutral: 'border-border bg-muted/40 text-muted-foreground',
};

const toneIcon: Record<Tone, typeof CheckCircle2Icon> = {
  ok: CheckCircle2Icon,
  warn: TriangleAlertIcon,
  bad: XCircleIcon,
  neutral: MinusIcon,
};

function StatusPill({ tone, label, children }: { tone: Tone; label: string; children: ReactNode }) {
  const Icon = toneIcon[tone];
  return (
    <li
      aria-label={label}
      className={cn('flex min-h-9 items-center gap-2 rounded-lg border px-3 py-1.5 text-sm', toneClass[tone])}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      <span className="truncate">{children}</span>
    </li>
  );
}

function relativeTime(iso: string): string {
  const diffMs = new Date(iso).getTime() - Date.now();
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 1000 * 60 * 60 * 24 * 365],
    ['month', 1000 * 60 * 60 * 24 * 30],
    ['day', 1000 * 60 * 60 * 24],
    ['hour', 1000 * 60 * 60],
    ['minute', 1000 * 60],
  ];
  for (const [unit, ms] of units) {
    if (Math.abs(diffMs) >= ms || unit === 'minute') {
      return formatter.format(Math.round(diffMs / ms), unit);
    }
  }
  return 'just now';
}

export interface ProvenanceBadgeProps {
  /** Exact npm package name. */
  pkg: string;
  /** `https://github.com/owner/repo` the provenance must name to count as verified. */
  expectedRepository: string;
}

export function ProvenanceBadgeSkeleton() {
  return (
    <div
      className="w-full max-w-sm rounded-xl border bg-card p-4"
      aria-busy="true"
      aria-label="Loading live registry status"
    >
      <div className="h-4 w-40 animate-pulse rounded bg-muted" />
      <ul className="mt-3 space-y-2">
        {[0, 1, 2].map((i) => (
          <li key={i} className="h-9 animate-pulse rounded-lg bg-muted" />
        ))}
      </ul>
      <div className="mt-3 h-3 w-56 animate-pulse rounded bg-muted" />
    </div>
  );
}

export async function ProvenanceBadge({ pkg, expectedRepository }: ProvenanceBadgeProps) {
  const latest = await getLatestVersion(pkg);

  if (!latest.ok) {
    return (
      <Shell pkg={pkg} note={`Live status unavailable: ${latest.error}.`}>
        <StatusPill tone="neutral" label="Version unknown">
          Version —
        </StatusPill>
        <StatusPill tone="neutral" label="Provenance status unknown">
          Provenance —
        </StatusPill>
        <StatusPill tone="neutral" label="Registry signature status unknown">
          Registry signatures —
        </StatusPill>
      </Shell>
    );
  }

  const { version, publishedAt, attestationsUrl } = latest.data;
  const [provenance, signatures] = await Promise.all([
    getProvenance(pkg, version, { expectedRepository, attestationsUrl }),
    getSignatures(pkg, version),
  ]);

  const provenancePill = (() => {
    if (!provenance.ok) {
      return (
        <StatusPill tone="neutral" label="Provenance status unknown">
          Provenance —
        </StatusPill>
      );
    }
    if (provenance.data.count === 0) {
      return (
        <StatusPill tone="warn" label="Provenance missing">
          Provenance missing
        </StatusPill>
      );
    }
    if (!provenance.data.verified) {
      return (
        <StatusPill tone="bad" label="Provenance invalid: attested repository does not match the package metadata">
          Provenance invalid (repo mismatch)
        </StatusPill>
      );
    }
    return (
      <StatusPill tone="ok" label="Provenance attested by the expected repository">
        Provenance attested
      </StatusPill>
    );
  })();

  const signaturesPill = (() => {
    if (!signatures.ok) {
      return (
        <StatusPill tone="neutral" label="Registry signature status unknown">
          Registry signatures —
        </StatusPill>
      );
    }
    const { verified, missing, invalid } = signatures.data;
    if (invalid > 0) {
      return (
        <StatusPill tone="bad" label={`Registry signatures: ${invalid} invalid`}>
          Registry signatures: {invalid} invalid
        </StatusPill>
      );
    }
    if (missing > 0 || verified === 0) {
      return (
        <StatusPill tone="warn" label="Registry signatures missing">
          Registry signatures missing
        </StatusPill>
      );
    }
    return (
      <StatusPill tone="ok" label={`Registry signatures: ${verified} verified`}>
        Registry signatures: {verified} verified
      </StatusPill>
    );
  })();

  const attestationLink = provenance.ok ? provenance.data.urls[0] : undefined;

  return (
    <Shell
      pkg={pkg}
      note={
        <>
          Attestation presence and source repository are checked here. Cryptographic verification is what{' '}
          <code className="font-mono">npm audit signatures</code> does on your machine.
          {attestationLink && (
            <>
              {' '}
              <a
                href={attestationLink}
                className="underline underline-offset-4"
                target="_blank"
                rel="noopener noreferrer"
              >
                Raw attestation
              </a>
              .
            </>
          )}
        </>
      }
    >
      <StatusPill
        tone="neutral"
        label={`Version ${version}${publishedAt ? `, published ${relativeTime(publishedAt)}` : ''}`}
      >
        v{version}
        {publishedAt && (
          <>
            {' '}
            published <time dateTime={publishedAt}>{relativeTime(publishedAt)}</time>
          </>
        )}
      </StatusPill>
      {provenancePill}
      {signaturesPill}
    </Shell>
  );
}

function Shell({ pkg, note, children }: { pkg: string; note: ReactNode; children: ReactNode }) {
  return (
    <div className="w-full max-w-sm rounded-xl border bg-card p-4">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Live registry status · <span className="font-mono normal-case">{pkg}</span>
      </p>
      <ul className="mt-3 space-y-2" aria-label="Live registry status">
        {children}
      </ul>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">{note}</p>
    </div>
  );
}
