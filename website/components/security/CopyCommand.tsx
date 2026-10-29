// website/components/security/CopyCommand.tsx
'use client';

import { CheckIcon, CopyIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

export interface CopyCommandProps {
  /** The raw command, used for the clipboard and the accessible name. */
  code: string;
  /** Pre-highlighted HTML produced on the server by `lib/highlight.ts`. */
  html: string;
  /** Language label shown in the corner. Always set; defaults to `sh`. */
  lang?: string;
  /** Verb for the button's accessible name, e.g. "Copy output" for a result block. */
  copyLabel?: string;
  className?: string;
}

/**
 * A code block with a copy button. Highlighting happens on the server; this
 * component only owns the clipboard interaction. The button is visually
 * quiet until hover or focus but is always in the tab order.
 */
export function CopyCommand({ code, html, lang = 'sh', copyLabel = 'Copy command', className }: CopyCommandProps) {
  const [copied, setCopied] = useState(false);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeout.current) clearTimeout(timeout.current);
    };
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      if (timeout.current) clearTimeout(timeout.current);
      timeout.current = setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-lg border bg-muted/40 text-sm [&_pre]:overflow-x-auto [&_pre]:px-4 [&_pre]:py-3 [&_pre]:font-mono [&_pre]:leading-6',
        className,
      )}
      data-language={lang}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-2 right-12 font-mono text-[11px] text-muted-foreground"
      >
        {lang}
      </span>
      <div dangerouslySetInnerHTML={{ __html: html }} />
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? 'Copied to clipboard' : `${copyLabel}: ${code}`}
        className="absolute top-1.5 right-1.5 inline-flex size-8 items-center justify-center rounded-md border bg-background text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        {copied ? (
          <CheckIcon aria-hidden="true" className="size-4" />
        ) : (
          <CopyIcon aria-hidden="true" className="size-4" />
        )}
      </button>
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? 'Command copied' : ''}
      </span>
    </div>
  );
}
