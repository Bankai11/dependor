// website/components/security/AdoptionChecklist.tsx
'use client';

import { RotateCcwIcon } from 'lucide-react';

import { buttonVariants } from '@/components/ui/button';
import { useStoredChecklist } from '@/lib/checklist-store';
import { renderInline } from '@/lib/markdown';
import { cn } from '@/lib/utils';

export const ADOPTION_STORAGE_KEY = 'wireup:security-adoption-checklist:v1';

export interface AdoptionItem {
  id: string;
  /** The verbatim THREAT_MODEL.md task item, Markdown inline syntax. */
  content: string;
}

/**
 * The pre-upgrade checklist from THREAT_MODEL.md as tickable items. State is
 * kept separately from the verification checklist because the two are done
 * at different times (once per release vs once per upgrade PR).
 */
export function AdoptionChecklist({ items }: { items: AdoptionItem[] }) {
  const { checked, toggle, reset } = useStoredChecklist(ADOPTION_STORAGE_KEY);

  const done = items.filter((item) => checked.includes(item.id)).length;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p
          role="status"
          aria-live="polite"
          aria-label="Adoption checklist progress"
          className="text-sm font-medium tabular-nums"
        >
          {done} of {items.length} checked
        </p>
        <button
          type="button"
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
          disabled={done === 0}
          onClick={reset}
          aria-label="Reset adoption checklist"
        >
          <RotateCcwIcon aria-hidden="true" data-icon="inline-start" />
          Reset
        </button>
      </div>
      <ol className="mt-4 space-y-3">
        {items.map((item, index) => {
          const isDone = checked.includes(item.id);
          return (
            <li key={item.id} className="flex items-start gap-3">
              <input
                id={item.id}
                type="checkbox"
                checked={isDone}
                onChange={() => toggle(item.id)}
                className="mt-1 size-4 shrink-0 cursor-pointer accent-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              />
              <label
                htmlFor={item.id}
                className={cn('cursor-pointer text-sm leading-6', isDone && 'text-muted-foreground')}
              >
                <span className="mr-2 font-mono text-xs text-muted-foreground tabular-nums">{index + 1}.</span>
                {renderInline(item.content)}
              </label>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
