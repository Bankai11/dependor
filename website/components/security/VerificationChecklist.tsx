// website/components/security/VerificationChecklist.tsx
'use client';

import { ChevronDownIcon, ExternalLinkIcon, RotateCcwIcon } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { CopyCommand } from '@/components/security/CopyCommand';
import { buttonVariants } from '@/components/ui/button';
import { useStoredChecklist } from '@/lib/checklist-store';
import { renderInline } from '@/lib/markdown';
import { cn } from '@/lib/utils';

/**
 * Versioned so a future change to step ids can start from a clean slate
 * instead of showing stale ticks against renumbered steps.
 */
export const CHECKLIST_STORAGE_KEY = 'wireup:security-checklist:v1';

export interface ChecklistCommand {
  code: string;
  html: string;
  lang?: string;
}

export interface ChecklistStep {
  id: string;
  number: number;
  title: string;
  /**
   * Short framing sentence shown above the command. Markdown inline syntax
   * (code spans, bold, links). Strings rather than React nodes keep the
   * serialized RSC payload small; they are rendered on the client with the
   * same `renderInline` the server uses.
   */
  intro?: string;
  commands: ChecklistCommand[];
  /** What a passing result looks like (Markdown inline). */
  expected: string;
  /** What a failing result means (Markdown inline). */
  redFlag: string;
  docs: { href: string; label: string; external?: boolean };
}

export function ProgressRing({ done, total }: { done: number; total: number }) {
  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  const fraction = total === 0 ? 0 : done / total;

  return (
    <div className="flex items-center gap-3">
      <svg width="52" height="52" viewBox="0 0 52 52" aria-hidden="true" className="-rotate-90">
        <circle cx="26" cy="26" r={radius} fill="none" strokeWidth="4" className="stroke-muted" />
        <circle
          cx="26"
          cy="26"
          r={radius}
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
          className={cn(
            'transition-[stroke-dashoffset] duration-200 ease-out',
            done === total && total > 0 ? 'stroke-emerald-600 dark:stroke-emerald-400' : 'stroke-foreground',
          )}
        />
      </svg>
      <p role="status" aria-live="polite" aria-label="Checklist progress" className="text-sm font-medium tabular-nums">
        {done} of {total} verified
      </p>
    </div>
  );
}

export interface VerificationChecklistProps {
  steps: ChecklistStep[];
  /**
   * Step ids expanded on first render. Defaults to none: every collapsed
   * panel keeps its highlighted code out of the initial DOM, which measurably
   * shortens hydration.
   */
  initiallyExpanded?: string[];
}

export function VerificationChecklist({ steps, initiallyExpanded = [] }: VerificationChecklistProps) {
  const { checked, toggle: toggleChecked, reset } = useStoredChecklist(CHECKLIST_STORAGE_KEY);
  const [expanded, setExpanded] = useState<string[]>(initiallyExpanded);

  const validIds = useMemo(() => new Set(steps.map((step) => step.id)), [steps]);
  const done = checked.filter((id) => validIds.has(id)).length;

  const toggleExpanded = useCallback((id: string) => {
    setExpanded((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
  }, []);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <ProgressRing done={done} total={steps.length} />
        <button
          type="button"
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
          onClick={reset}
          disabled={done === 0}
          aria-label="Reset checklist progress"
        >
          <RotateCcwIcon aria-hidden="true" data-icon="inline-start" />
          Reset
        </button>
      </div>

      <ol className="mt-6 divide-y rounded-xl border">
        {steps.map((step) => {
          const isOpen = expanded.includes(step.id);
          const isDone = checked.includes(step.id);
          const panelId = `${step.id}-panel`;
          const buttonId = `${step.id}-button`;
          const checkboxId = `${step.id}-done`;

          return (
            <li key={step.id} className="px-4 py-3 sm:px-5">
              <div className="flex items-start gap-3">
                <input
                  id={checkboxId}
                  type="checkbox"
                  checked={isDone}
                  onChange={() => toggleChecked(step.id)}
                  aria-label={`Mark step ${step.number} verified: ${step.title}`}
                  className="mt-1 size-4 shrink-0 cursor-pointer accent-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                />
                <button
                  id={buttonId}
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => toggleExpanded(step.id)}
                  className="flex flex-1 items-start justify-between gap-3 rounded-md text-left focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  <span className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
                    <span className="font-mono text-xs text-muted-foreground tabular-nums">Step {step.number}</span>
                    <span
                      className={cn(
                        'font-medium',
                        isDone && 'text-muted-foreground line-through decoration-foreground/30',
                      )}
                    >
                      {step.title}
                    </span>
                  </span>
                  <ChevronDownIcon
                    aria-hidden="true"
                    className={cn(
                      'mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform duration-200',
                      isOpen && 'rotate-180',
                    )}
                  />
                </button>
              </div>

              <div
                id={panelId}
                role="region"
                aria-labelledby={buttonId}
                hidden={!isOpen}
                className="mt-3 ml-7 space-y-4 pb-1 text-sm"
              >
                {/* Panel content is mounted only while expanded: five collapsed
                    panels of highlighted code would otherwise dominate the
                    hydrated DOM and the style/layout cost on first load. */}
                {isOpen && (
                  <>
                    {step.intro && <p className="leading-6 text-muted-foreground">{renderInline(step.intro)}</p>}

                    <div className="space-y-2">
                      {step.commands.map((command) => (
                        <CopyCommand key={command.code} code={command.code} html={command.html} lang={command.lang} />
                      ))}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-lg border border-emerald-600/30 bg-emerald-50 p-3 text-emerald-950 dark:border-emerald-400/30 dark:bg-emerald-950/40 dark:text-emerald-50">
                        <p className="text-xs font-semibold tracking-wide uppercase">Good looks like</p>
                        <div className="mt-1 leading-6">{renderInline(step.expected)}</div>
                      </div>
                      <div className="rounded-lg border border-red-600/30 bg-red-50 p-3 text-red-950 dark:border-red-400/30 dark:bg-red-950/40 dark:text-red-50">
                        <p className="text-xs font-semibold tracking-wide uppercase">Red flag</p>
                        <div className="mt-1 leading-6">{renderInline(step.redFlag)}</div>
                      </div>
                    </div>

                    <a
                      href={step.docs.href}
                      className="inline-flex items-center gap-1 text-sm underline underline-offset-4 decoration-foreground/40 hover:decoration-foreground"
                      {...(step.docs.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                    >
                      {step.docs.label}
                      {step.docs.external && <ExternalLinkIcon aria-hidden="true" className="size-3.5" />}
                    </a>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
