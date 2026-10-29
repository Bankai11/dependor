// website/components/security/VerificationChecklist.test.tsx
//
// TODO(e2e): add a Playwright spec that loads /security in a real browser,
// ticks a step, reloads, and asserts the tick survived. This file covers the
// component in jsdom only.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  CHECKLIST_STORAGE_KEY,
  VerificationChecklist,
  type ChecklistStep,
} from './VerificationChecklist';

const progress = () => screen.getByRole('status', { name: 'Checklist progress' });

const steps: ChecklistStep[] = [
  {
    id: 'step-1',
    number: 1,
    title: 'Verify registry signatures',
    commands: [{ code: 'npm audit signatures', html: '<pre class="shiki"><code>npm audit signatures</code></pre>' }],
    expected: 'zero missing or invalid',
    redFlag: 'any missing or invalid count',
    docs: { href: 'https://docs.npmjs.com/cli/v11/commands/npm-audit', label: 'npm audit docs', external: true },
  },
  {
    id: 'step-2',
    number: 2,
    title: 'Inspect the attestation',
    commands: [{ code: 'npm view pkg dist.attestations', html: '<pre class="shiki"><code>npm view</code></pre>' }],
    expected: 'a provenance attestation',
    redFlag: 'no attestation',
    docs: { href: '/security/threat-model', label: 'threat model' },
  },
];

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe('VerificationChecklist', () => {
  it('starts at zero and updates the progress ring when a step is ticked', () => {
    render(<VerificationChecklist steps={steps} />);
    expect(progress()).toHaveTextContent('0 of 2 verified');

    fireEvent.click(screen.getByLabelText('Mark step 1 verified: Verify registry signatures'));
    expect(progress()).toHaveTextContent('1 of 2 verified');

    fireEvent.click(screen.getByLabelText('Mark step 2 verified: Inspect the attestation'));
    expect(progress()).toHaveTextContent('2 of 2 verified');
  });

  it('persists ticks to the versioned localStorage key and restores them', () => {
    const first = render(<VerificationChecklist steps={steps} />);
    fireEvent.click(screen.getByLabelText('Mark step 2 verified: Inspect the attestation'));

    expect(JSON.parse(window.localStorage.getItem(CHECKLIST_STORAGE_KEY) ?? 'null')).toEqual({
      version: 1,
      checked: ['step-2'],
    });

    first.unmount();
    render(<VerificationChecklist steps={steps} />);
    expect(progress()).toHaveTextContent('1 of 2 verified');
    expect(screen.getByLabelText('Mark step 2 verified: Inspect the attestation')).toBeChecked();
  });

  it('ignores stored ids that no longer exist and malformed storage', () => {
    window.localStorage.setItem(
      CHECKLIST_STORAGE_KEY,
      JSON.stringify({ version: 1, checked: ['step-99', 'step-1'] }),
    );
    const first = render(<VerificationChecklist steps={steps} />);
    expect(progress()).toHaveTextContent('1 of 2 verified');
    first.unmount();

    window.localStorage.setItem(CHECKLIST_STORAGE_KEY, '{not json');
    render(<VerificationChecklist steps={steps} />);
    expect(progress()).toHaveTextContent('0 of 2 verified');
  });

  it('reset clears progress and removes the storage key', () => {
    render(<VerificationChecklist steps={steps} />);
    const reset = screen.getByRole('button', { name: 'Reset checklist progress' });
    expect(reset).toBeDisabled();

    fireEvent.click(screen.getByLabelText('Mark step 1 verified: Verify registry signatures'));
    expect(reset).toBeEnabled();

    fireEvent.click(reset);
    expect(progress()).toHaveTextContent('0 of 2 verified');
    expect(window.localStorage.getItem(CHECKLIST_STORAGE_KEY)).toBeNull();
  });

  it('rows are buttons with aria-expanded that toggle their panel', () => {
    render(<VerificationChecklist steps={steps} />);
    const row = screen.getByRole('button', { name: /Step 2/ });
    const panel = document.getElementById('step-2-panel');

    expect(row).toHaveAttribute('aria-expanded', 'false');
    expect(row).toHaveAttribute('aria-controls', 'step-2-panel');
    expect(panel).toHaveProperty('hidden', true);

    fireEvent.click(row);
    expect(row).toHaveAttribute('aria-expanded', 'true');
    expect(panel).toHaveProperty('hidden', false);
    expect(screen.getByText('a provenance attestation')).toBeVisible();
  });

  it('collapses every step by default and mounts a command only once expanded', () => {
    render(<VerificationChecklist steps={steps} />);
    expect(screen.getByRole('button', { name: /Step 1/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: 'Copy command: npm audit signatures' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Step 1/ }));
    expect(screen.getByRole('button', { name: 'Copy command: npm audit signatures' })).toBeInTheDocument();
  });

  it('honours initiallyExpanded', () => {
    render(<VerificationChecklist steps={steps} initiallyExpanded={['step-2']} />);
    expect(screen.getByRole('button', { name: /Step 2/ })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('a provenance attestation')).toBeVisible();
  });
});
