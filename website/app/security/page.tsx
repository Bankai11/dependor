// website/app/security/page.tsx
//
// TODO: rename to @wireup/core when the scope is registered — search-and-replace,
// do not hardcode in components. (The name is read from dependor-di/package.json
// via getPackageMeta(); nothing below hardcodes it.)
import { ArrowDownIcon, ArrowRightIcon, TriangleAlertIcon } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Suspense } from 'react';

import { AdoptionChecklist, type AdoptionItem } from '@/components/security/AdoptionChecklist';
import { ProvenanceBadge, ProvenanceBadgeSkeleton } from '@/components/security/ProvenanceBadge';
import { ThreatModelGrid, type ThreatCard } from '@/components/security/ThreatModelGrid';
import { VerificationChecklist, type ChecklistStep } from '@/components/security/VerificationChecklist';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { buttonVariants } from '@/components/ui/button';
import { highlight } from '@/lib/highlight';
import { renderInline } from '@/lib/markdown';
import { getLatestVersion } from '@/lib/npm';
import { getDisclosurePolicy, getPackageMeta, getThreatModel } from '@/lib/package-docs';

export const runtime = 'nodejs';
export const revalidate = 3600;

const DOCS = {
  npmAudit: 'https://docs.npmjs.com/cli/v11/commands/npm-audit',
  npmProvenance: 'https://docs.npmjs.com/generating-provenance-statements',
  slsa: 'https://slsa.dev/spec/v1.0/provenance',
  trustedPublishing: 'https://docs.npmjs.com/trusted-publishers',
};

/** The five cards the brief asks for, mapped onto THREAT_MODEL.md sections. */
const CARD_PLAN: { id: string; name: string; section: string; mitigationRow: number }[] = [
  { id: 'typosquatting', name: 'Typosquatting / name confusion', section: '2.2', mitigationRow: 1 },
  { id: 'account-takeover', name: 'Maintainer account takeover', section: '2.1', mitigationRow: 0 },
  { id: 'postinstall', name: 'Malicious postinstall scripts', section: '2.3', mitigationRow: 0 },
  { id: 'dependency-confusion', name: 'Dependency confusion', section: '2.2', mitigationRow: 0 },
  { id: 'devdeps', name: 'Compromised devDependencies', section: '2.4', mitigationRow: 0 },
];

export default async function SecurityPage() {
  const meta = getPackageMeta();
  const threatModel = getThreatModel();
  const policy = getDisclosurePolicy();
  const latest = await getLatestVersion(meta.name);

  // Commands use the live version when the registry has one, otherwise the
  // README's literal <version> placeholder. Nothing is guessed.
  const version = latest.ok ? latest.data.version : '<version>';
  const unscoped = meta.name.replace(/^@/, '').replace('/', '-');
  const tarball = `${unscoped}-${version}.tgz`;
  const releaseUrl = `${meta.repositoryUrl}/releases/tag/v${version}`;
  const npmVersionUrl = `${meta.npmUrl}/v/${version}`;
  const actionsUrl = `${meta.repositoryUrl}/actions/workflows/publish.yml`;
  const readmeVerifyUrl = `${meta.repositoryUrl}#how-to-verify-this-package`;

  const code = async (text: string) => ({ code: text, html: await highlight(text) });

  // Step copy is Markdown inline syntax, rendered by the client component.
  const steps: ChecklistStep[] = [
    {
      id: 'step-1',
      number: 1,
      title: 'Verify registry signatures and provenance',
      intro:
        "Checks the registry's signature on the tarball and the provenance attestation against the Sigstore transparency log.",
      commands: [await code(`npm install ${meta.name}\nnpm audit signatures`)],
      expected:
        '`verified registry signatures` and `verified attestations` counts with zero `missing` or `invalid`.',
      redFlag: 'Any `missing` or `invalid` count. Stop and compare against the release before using the package.',
      docs: { href: DOCS.npmAudit, label: 'npm audit signatures reference', external: true },
    },
    {
      id: 'step-2',
      number: 2,
      title: 'Inspect the attestation on npm',
      intro: `The Provenance panel on [the npm version page](${npmVersionUrl}) names the source commit, the workflow file and the exact Actions run. The same data from the CLI:`,
      commands: [await code(`npm view ${meta.name}@${version} dist.attestations`)],
      expected: `A panel reading "Built and signed on GitHub Actions" that names \`.github/workflows/publish.yml\` in \`${meta.repositorySlug}\`.`,
      redFlag:
        'No Provenance panel, or an attestation naming a different repository or workflow than the one in `package.json`.',
      docs: { href: DOCS.npmProvenance, label: 'How npm provenance statements work', external: true },
    },
    {
      id: 'step-3',
      number: 3,
      title: 'Compare the tarball hash with the GitHub release asset',
      intro: `CI attaches the exact tarball it published, plus a \`.sha256\` file, to [the GitHub release](${releaseUrl}).`,
      commands: [
        await code(`# What the registry serves:\nnpm pack ${meta.name}@${version}\nsha256sum ${tarball}`),
        await code(`# What CI built (download from ${releaseUrl}):\ncat ${tarball}.sha256`),
      ],
      expected:
        'The two hashes match, and `npm pack --dry-run` lists only `dist/index.js`, `dist/index.cjs`, `dist/index.d.ts`, `dist/index.d.cts`, `package.json`, `README.md`, `LICENSE` and `CHANGELOG.md`.',
      redFlag:
        'Hashes differ, or the tarball contains `.map` files, tests or CI config. The registry copy is not what CI built.',
      docs: { href: releaseUrl, label: 'Release assets on GitHub', external: true },
    },
    {
      id: 'step-4',
      number: 4,
      title: 'Check the package metadata points at the real repo',
      commands: [await code(`npm view ${meta.name} repository.url homepage bugs.url`)],
      expected: `All three reference \`github.com/${meta.repositorySlug}\`. A typosquat can copy a README but cannot produce a provenance attestation naming this repository.`,
      redFlag: `Any field pointing somewhere else, or a package name other than \`${meta.name}\`.`,
      docs: { href: readmeVerifyUrl, label: 'The same steps in the package README', external: true },
    },
    {
      id: 'step-5',
      number: 5,
      title: 'Review the Actions run that produced the release',
      intro: `Follow the link from the provenance panel or the release page to the [Publish workflow run](${actionsUrl}). There is no command for this step; it is a read.`,
      commands: [
        await code(
          `# Triggered by: release: published, tag v${version}\n# Final step: "Verify published package (hash + npm audit signatures)"`,
        ),
      ],
      expected: `A green run triggered by a \`release: published\` event for tag \`v${version}\`, whose final step prints the built and registry SHA-256 hashes side by side.`,
      redFlag:
        'A red run, a manual trigger, a different tag, or a workflow file other than `.github/workflows/publish.yml`.',
      docs: {
        href: `${meta.repositoryUrl}/blob/main/.github/workflows/publish.yml`,
        label: 'Read publish.yml',
        external: true,
      },
    },
    {
      id: 'step-6',
      number: 6,
      title: 'Diff dist/index.js between versions',
      intro:
        'Steps 1 to 5 prove where the code came from. They do not prove the code is free of bugs, or that the repository was not compromised at that commit. The shipped file is unminified and about 200 lines.',
      commands: [
        await code(
          `npm pack ${meta.name}@<previous> ${meta.name}@${version}\n` +
            `mkdir prev next && tar -xzf ${unscoped}-<previous>.tgz -C prev && tar -xzf ${tarball} -C next\n` +
            `diff -u prev/package/dist/index.js next/package/dist/index.js`,
        ),
      ],
      expected:
        'A diff you can read in a few minutes, matching the `CHANGELOG.md` entry, with no network, filesystem, `child_process`, `eval` or `Function` usage.',
      redFlag: 'Anything in the diff the changelog does not explain. Provenance will not catch this; only reading does.',
      docs: {
        href: `/security/threat-model#${threatModel.consumerChecklistSlug}`,
        label: 'Consumer checklist in the threat model',
      },
    },
  ];

  const cards: ThreatCard[] = CARD_PLAN.map((plan) => {
    const section = threatModel.sections.find((s) => s.number === plan.section);
    const mitigation = section?.mitigations[plan.mitigationRow];
    return {
      id: plan.id,
      name: plan.name,
      sectionNumber: plan.section,
      sectionTitle: section?.title ?? `TODO: section ${plan.section} not found in THREAT_MODEL.md`,
      description: section?.summary
        ? renderInline(section.summary)
        : `TODO: no attacker summary for section ${plan.section} in THREAT_MODEL.md`,
      mitigation: mitigation
        ? renderInline(mitigation.mitigation)
        : `TODO: no mitigation row ${plan.mitigationRow} in section ${plan.section}`,
      where: mitigation ? renderInline(mitigation.where) : 'TODO',
      href: `/security/threat-model#${section?.slug ?? ''}`,
    };
  });

  const adoptionItems: AdoptionItem[] = threatModel.consumerChecklist.map((text, index) => ({
    id: `adopt-${index + 1}`,
    content: text,
  }));

  return (
    <main id="main" className="mx-auto w-full max-w-6xl px-4 pb-24 sm:px-6">
      {/* A. Hero */}
      <section className="grid items-start gap-10 py-16 lg:grid-cols-[1fr_auto] lg:py-24">
        <div className="max-w-2xl">
          <p className="font-mono text-sm text-muted-foreground">
            {meta.name} ·{' '}
            <Link href="/security/threat-model" className="underline underline-offset-4">
              threat model
            </Link>{' '}
            ·{' '}
            <Link href="/security/policy" className="underline underline-offset-4">
              disclosure policy
            </Link>
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
            Verify Wireup yourself. Don&apos;t take our word for it.
          </h1>
          <p className="mt-6 text-lg leading-8 text-muted-foreground">
            Every release is provenance-signed, hash-published, and reproducible from CI. Here are the six commands
            that prove it, and the threat model behind them.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="#checklist" className={buttonVariants({ size: 'lg' })}>
              Run the checklist
              <ArrowDownIcon aria-hidden="true" data-icon="inline-end" />
            </a>
            <a href="#threat-model" className={buttonVariants({ size: 'lg', variant: 'outline' })}>
              Read the threat model
              <ArrowRightIcon aria-hidden="true" data-icon="inline-end" />
            </a>
          </div>
        </div>

        {/* B. Live provenance badge; space is reserved by the skeleton. */}
        <div className="min-h-[13.5rem] lg:w-sm">
          <Suspense fallback={<ProvenanceBadgeSkeleton />}>
            <ProvenanceBadge pkg={meta.name} expectedRepository={meta.repositoryUrl} />
          </Suspense>
        </div>
      </section>

      {/* C. Verification checklist */}
      <Section
        id="checklist"
        eyebrow="Verification"
        title="Six steps, about ninety seconds"
        lead={
          <>
            The same procedure as the package README&apos;s{' '}
            <a href={readmeVerifyUrl} className="underline underline-offset-4" target="_blank" rel="noopener noreferrer">
              How to verify this package
            </a>
            . Ticks are stored in your browser only.
          </>
        }
      >
        <VerificationChecklist steps={steps} />
      </Section>

      {/* D. Threat model grid */}
      <Section
        id="threat-model"
        eyebrow="Threat model"
        title="What the controls are for"
        lead={
          <>
            Five attack classes from{' '}
            <Link href="/security/threat-model" className="underline underline-offset-4">
              THREAT_MODEL.md
            </Link>
            , each with the mitigation applied and where it lives. The full document, including residual risks, is
            one click away.
          </>
        }
      >
        <ThreatModelGrid
          cards={cards}
          outOfScope={threatModel.outOfScope.map((item) => renderInline(item))}
          outOfScopeHref={`/security/threat-model#${threatModel.outOfScopeSlug}`}
        />
      </Section>

      {/* E. The honest caveat */}
      <Section id="caveat" eyebrow="Read this before trusting any badge" title="Provenance is not security">
        <Alert className="border-amber-600/40 bg-amber-50 text-amber-950 dark:border-amber-400/40 dark:bg-amber-950/40 dark:text-amber-50 [&_a]:text-current">
          <TriangleAlertIcon aria-hidden="true" />
          <AlertTitle className="text-base">Provenance proves origin, not safety.</AlertTitle>
          <AlertDescription className="text-current/90 leading-7 text-wrap md:text-wrap">
            <p>
              A green attestation means the tarball was built by this repo&apos;s CI — it does not mean the code is
              free of bugs, and it does not protect you if the maintainer account is compromised. That is why step 6
              (diffing dist/index.js) exists. Treat provenance as{' '}
              <Link href="/blog/provenance-is-not-security" className="underline underline-offset-4">
                one signal among several
              </Link>
              .
            </p>
          </AlertDescription>
        </Alert>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          Specs, if you want them:{' '}
          <a href={DOCS.slsa} className="underline underline-offset-4" target="_blank" rel="noopener noreferrer">
            SLSA provenance v1
          </a>{' '}
          and{' '}
          <a
            href={DOCS.trustedPublishing}
            className="underline underline-offset-4"
            target="_blank"
            rel="noopener noreferrer"
          >
            npm trusted publishers
          </a>
          .
        </p>
      </Section>

      {/* F. Consumer checklist before adopting a new version */}
      <Section
        id="adoption"
        eyebrow="Before you upgrade"
        title={`Consumer checklist, ${threatModel.consumerChecklist.length} items`}
        lead={
          <>
            Verbatim from the{' '}
            <Link
              href={`/security/threat-model#${threatModel.consumerChecklistSlug}`}
              className="underline underline-offset-4"
            >
              end of THREAT_MODEL.md
            </Link>
            . Copy it into your upgrade PR.
          </>
        }
      >
        <AdoptionChecklist items={adoptionItems} />
      </Section>

      {/* G. Footer CTA */}
      <section className="mt-20 rounded-xl border bg-muted/30 p-6 sm:p-8">
        <h2 className="text-xl font-semibold tracking-tight">See something wrong?</h2>
        <p className="mt-2 leading-7 text-muted-foreground">
          SECURITY.md has our disclosure process and a{' '}
          {policy.windowDays !== null
            ? `${policy.windowDays}-day`
            : 'TODO: disclosure window not found in SECURITY.md'}{' '}
          policy.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/security/policy" className={buttonVariants()}>
            Read the disclosure policy
            <ArrowRightIcon aria-hidden="true" data-icon="inline-end" />
          </Link>
          {policy.advisoriesUrl && (
            <a
              href={policy.advisoriesUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ variant: 'outline' })}
            >
              Report privately on GitHub
            </a>
          )}
        </div>
      </section>
    </main>
  );
}

function Section({
  id,
  eyebrow,
  title,
  lead,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  lead?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-20 border-t pt-14 pb-6">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{eyebrow}</p>
      <h2 id={`${id}-title`} className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
        {title}
      </h2>
      {lead && <p className="mt-3 max-w-2xl leading-7 text-muted-foreground">{lead}</p>}
      <div className="mt-8">{children}</div>
    </section>
  );
}
