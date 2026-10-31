// website/lib/package-docs.ts
//
// Build-time readers for the frozen package documentation in dependor-di/.
// Nothing here is invented: every string is lifted from package.json,
// THREAT_MODEL.md, SECURITY.md or README.md. If the directory cannot be
// found the build fails with a message naming the env var that points at it.
import 'server-only';

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { slugify } from './markdown';

/**
 * Where the package repository lives relative to the website. Override with
 * WIREUP_PACKAGE_DIR when the site is deployed from a different layout.
 */
export const PACKAGE_DIR = process.env.WIREUP_PACKAGE_DIR
  ? path.resolve(process.env.WIREUP_PACKAGE_DIR)
  : path.resolve(process.cwd(), '..', 'dependor-di');

export type PackageDoc = 'README.md' | 'SECURITY.md' | 'THREAT_MODEL.md' | 'package.json';

export function readPackageDoc(file: PackageDoc): string {
  const target = path.join(PACKAGE_DIR, file);
  if (!existsSync(target)) {
    throw new Error(
      `Cannot read ${target}. Set WIREUP_PACKAGE_DIR to the directory that contains the published package's ${file}.`,
    );
  }
  return readFileSync(target, 'utf8');
}

export interface PackageMeta {
  /** Exact npm package name, e.g. `@wireupjs/core`. */
  name: string;
  version: string;
  /** `https://github.com/owner/repo`, normalised from `repository.url`. */
  repositoryUrl: string;
  /** `owner/repo`. */
  repositorySlug: string;
  homepage: string;
  bugsUrl: string;
  npmUrl: string;
  /** Tarball basename npm pack produces, e.g. `wireupjs-core-0.1.0.tgz`. */
  tarballName: string;
}

export function normalizeRepositoryUrl(url: string): string {
  return url
    .replace(/^git\+/, '')
    .replace(/^git:\/\//, 'https://')
    .replace(/^ssh:\/\/git@/, 'https://')
    .replace(/\.git$/, '')
    .replace(/\/$/, '');
}

export function getPackageMeta(): PackageMeta {
  const pkg = JSON.parse(readPackageDoc('package.json')) as {
    name: string;
    version: string;
    repository?: { url?: string } | string;
    homepage?: string;
    bugs?: { url?: string } | string;
  };

  const rawRepository =
    typeof pkg.repository === 'string' ? pkg.repository : (pkg.repository?.url ?? '');
  const repositoryUrl = normalizeRepositoryUrl(rawRepository);
  const slugMatch = /github\.com\/([^/]+\/[^/]+)$/.exec(repositoryUrl);

  return {
    name: pkg.name,
    version: pkg.version,
    repositoryUrl,
    repositorySlug: slugMatch?.[1] ?? repositoryUrl,
    homepage: pkg.homepage ?? repositoryUrl,
    bugsUrl: typeof pkg.bugs === 'string' ? pkg.bugs : (pkg.bugs?.url ?? `${repositoryUrl}/issues`),
    npmUrl: `https://www.npmjs.com/package/${pkg.name}`,
    tarballName: `${pkg.name.replace(/^@/, '').replace('/', '-')}-${pkg.version}.tgz`,
  };
}

export interface ThreatMitigation {
  mitigation: string;
  where: string;
}

export interface ThreatSection {
  /** `2.1`, `2.2`, ... */
  number: string;
  /** Heading text without the number. */
  title: string;
  /** Anchor id matching the heading rendered on /security/threat-model. */
  slug: string;
  /** The italic attacker summary paragraph, or null if the section has none. */
  summary: string | null;
  mitigations: ThreatMitigation[];
  residualRisk: string | null;
}

export interface ThreatModel {
  sections: ThreatSection[];
  /** Bullets under "Explicitly out of scope", verbatim markdown. */
  outOfScope: string[];
  /** Task items under "Consumer checklist before adopting a new version", verbatim markdown. */
  consumerChecklist: string[];
  consumerChecklistSlug: string;
  outOfScopeSlug: string;
}

/** Join a list item with its indented continuation lines. */
function collectListItems(lines: string[], marker: RegExp): string[] {
  const items: string[] = [];
  for (const line of lines) {
    const match = marker.exec(line);
    if (match) {
      items.push(match[1].trim());
    } else if (/^\s+\S/.test(line) && items.length > 0) {
      items[items.length - 1] += ` ${line.trim()}`;
    }
  }
  return items;
}

function paragraphs(lines: string[]): string[] {
  const out: string[] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (line.trim() === '') {
      if (current.length) out.push(current.join(' '));
      current = [];
    } else {
      current.push(line.trim());
    }
  }
  if (current.length) out.push(current.join(' '));
  return out;
}

function parseTable(lines: string[]): ThreatMitigation[] {
  const rows = lines.filter((line) => line.trim().startsWith('|'));
  return rows
    .slice(2) // header + separator
    .map((row) => row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim()))
    .filter((cells) => cells.length >= 2)
    .map(([mitigation, where]) => ({ mitigation, where }));
}

export function parseThreatModel(markdown: string): ThreatModel {
  const lines = markdown.split(/\r?\n/);
  const sections: ThreatSection[] = [];

  const headingIndexes = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => /^#{2,3} /.test(line));

  for (let i = 0; i < headingIndexes.length; i += 1) {
    const { line, index } = headingIndexes[i];
    const match = /^### (\d+\.\d+) (.+)$/.exec(line);
    if (!match) continue;
    const end = headingIndexes[i + 1]?.index ?? lines.length;
    const body = lines.slice(index + 1, end);
    const paras = paragraphs(body.filter((l) => !l.trim().startsWith('|')));

    sections.push({
      number: match[1],
      title: match[2],
      slug: slugify(`${match[1]} ${match[2]}`),
      summary:
        paras
          .find((p) => /^\*[^*].*\*$/.test(p))
          ?.replace(/^\*/, '')
          .replace(/\*$/, '') ?? null,
      mitigations: parseTable(body),
      residualRisk:
        paras.find((p) => p.startsWith('**Residual risk:**'))?.replace(/^\*\*Residual risk:\*\*\s*/, '') ??
        null,
    });
  }

  const sectionBody = (prefix: string): { heading: string; lines: string[] } => {
    const start = lines.findIndex((l) => l.startsWith(prefix));
    if (start === -1) return { heading: '', lines: [] };
    const next = lines.findIndex((l, idx) => idx > start && /^## /.test(l));
    return {
      heading: lines[start].replace(/^## /, ''),
      lines: lines.slice(start + 1, next === -1 ? lines.length : next),
    };
  };

  const outOfScope = sectionBody('## 3.');
  const checklist = sectionBody('## 4.');

  return {
    sections,
    outOfScope: collectListItems(outOfScope.lines, /^- (?!\[)(.+)$/),
    outOfScopeSlug: slugify(outOfScope.heading),
    consumerChecklist: collectListItems(checklist.lines, /^- \[[ xX]\] (.+)$/),
    consumerChecklistSlug: slugify(checklist.heading),
  };
}

export function getThreatModel(): ThreatModel {
  return parseThreatModel(readPackageDoc('THREAT_MODEL.md'));
}

/** Extract the disclosure window from SECURITY.md so the page cannot drift from it. */
export function getDisclosurePolicy(): { windowDays: number | null; advisoriesUrl: string | null } {
  const text = readPackageDoc('SECURITY.md');
  const days = /\*\*(\d+)-day coordinated disclosure\*\*/.exec(text);
  const advisories = /<(https:\/\/github\.com\/[^>]+\/security\/advisories\/new)>/.exec(text);
  return {
    windowDays: days ? Number(days[1]) : null,
    advisoriesUrl: advisories?.[1] ?? null,
  };
}
