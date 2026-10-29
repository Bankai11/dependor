// website/lib/npm.ts
//
// Server-only helpers that talk to registry.npmjs.org. Every exported function
// catches its own errors and returns a `Result<T>` union so a registry hiccup
// can never crash a page. Nothing here is imported by client components; the
// `server-only` import makes that a build error rather than a convention.
import 'server-only';

import { createPublicKey, verify as cryptoVerify } from 'node:crypto';

export const REGISTRY_URL = 'https://registry.npmjs.org';

/** How long Next.js caches each registry response, in seconds. */
export const REGISTRY_REVALIDATE_SECONDS = 3600;

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export interface RegistryLatest {
  name: string;
  version: string;
  /** `dist.integrity`, a Subresource Integrity string (`sha512-...`). */
  integrity: string | null;
  /** `dist.tarball`, the URL the registry serves the package from. */
  tarball: string | null;
  /** ISO 8601 publish time from the packument's `time[version]`, if present. */
  publishedAt: string | null;
  /** `dist.attestations.url`, present only when the version was published with provenance. */
  attestationsUrl: string | null;
  /** `dist.attestations.provenance.predicateType`, if present. */
  provenancePredicateType: string | null;
}

export interface ProvenanceStatus {
  /**
   * `true` when a SLSA provenance attestation exists for the version AND, if
   * `expectedRepository` was supplied, the attestation's source repository
   * matches it. This is a claim-level check of the attestation's contents. It
   * is NOT a cryptographic verification of the Sigstore bundle; that is what
   * `npm audit signatures` does.
   */
  verified: boolean;
  /** Number of attestations the registry returned (provenance + publish). */
  count: number;
  /** Links a human can open: the attestation document and Rekor log entries. */
  urls: string[];
  /** `https://github.com/<owner>/<repo>` from the provenance predicate, if present. */
  sourceRepository: string | null;
  /** Workflow file path inside the repo, e.g. `.github/workflows/publish.yml`. */
  workflowPath: string | null;
  /** The GitHub Actions run that produced the tarball, if recorded. */
  runUrl: string | null;
  /** The git commit the build resolved, if recorded. */
  commit: string | null;
  /** All `predicateType` values seen, verbatim. */
  predicateTypes: string[];
}

export interface SignatureStatus {
  /** Signatures that cryptographically verify against the registry's published keys. */
  verified: number;
  /** 1 when the version has no `dist.signatures` at all, otherwise 0. */
  missing: number;
  /** Signatures whose key is unknown, expired before publish, or whose ECDSA check fails. */
  invalid: number;
}

interface VersionDoc {
  name?: unknown;
  version?: unknown;
  dist?: {
    integrity?: unknown;
    tarball?: unknown;
    signatures?: unknown;
    attestations?: { url?: unknown; provenance?: { predicateType?: unknown } };
  };
}

interface Packument {
  time?: Record<string, unknown>;
}

interface RegistryKey {
  keyid: string;
  key: string;
  expires: string | null;
}

interface AttestationsDoc {
  attestations?: Array<{
    predicateType?: unknown;
    bundle?: {
      dsseEnvelope?: { payload?: unknown };
      verificationMaterial?: { tlogEntries?: Array<{ logIndex?: unknown }> };
    };
  }>;
}

/** Scoped names are encoded as `@scope%2Fname`, which is what the registry expects. */
export function encodePackageName(pkg: string): string {
  return pkg.startsWith('@') ? `@${encodeURIComponent(pkg.slice(1))}` : encodeURIComponent(pkg);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

async function fetchJson(url: string): Promise<{ status: number; body: unknown }> {
  const response = await fetch(url, {
    headers: { accept: 'application/json' },
    next: { revalidate: REGISTRY_REVALIDATE_SECONDS },
  });
  if (!response.ok) {
    return { status: response.status, body: null };
  }
  return { status: response.status, body: (await response.json()) as unknown };
}

async function fetchPublishedAt(pkg: string, version: string): Promise<string | null> {
  // Separate URL, therefore separately cached by Next.js.
  const packument = await fetchJson(`${REGISTRY_URL}/${encodePackageName(pkg)}`);
  const time = (packument.body as Packument | null)?.time;
  return time ? asString(time[version]) : null;
}

/**
 * Resolve the `latest` dist-tag of a package plus its publish time.
 *
 * Two requests: `/{pkg}/latest` for the version document and `/{pkg}` (the
 * packument) for the `time` map, which the version document does not carry.
 */
export async function getLatestVersion(pkg: string): Promise<Result<RegistryLatest>> {
  try {
    const latest = await fetchJson(`${REGISTRY_URL}/${encodePackageName(pkg)}/latest`);
    if (latest.status === 404) {
      return { ok: false, error: `${pkg} is not published on registry.npmjs.org` };
    }
    if (latest.body === null) {
      return { ok: false, error: `registry responded with HTTP ${latest.status}` };
    }

    const doc = latest.body as VersionDoc;
    const version = asString(doc.version);
    if (version === null) {
      return { ok: false, error: 'registry response had no version field' };
    }

    const publishedAt = await fetchPublishedAt(pkg, version);

    return {
      ok: true,
      data: {
        name: asString(doc.name) ?? pkg,
        version,
        integrity: asString(doc.dist?.integrity),
        tarball: asString(doc.dist?.tarball),
        publishedAt,
        attestationsUrl: asString(doc.dist?.attestations?.url),
        provenancePredicateType: asString(doc.dist?.attestations?.provenance?.predicateType),
      },
    };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

interface SlsaPredicateV1 {
  buildDefinition?: {
    externalParameters?: { workflow?: { repository?: unknown; path?: unknown } };
    resolvedDependencies?: Array<{ digest?: { gitCommit?: unknown } }>;
  };
  runDetails?: { metadata?: { invocationId?: unknown } };
}

interface SlsaPredicateV02 {
  invocation?: { configSource?: { uri?: unknown; entryPoint?: unknown; digest?: { sha1?: unknown } } };
  metadata?: { buildInvocationId?: unknown };
}

function decodeDssePayload(payload: unknown): Record<string, unknown> | null {
  if (typeof payload !== 'string') return null;
  try {
    const json = JSON.parse(Buffer.from(payload, 'base64').toString('utf8')) as unknown;
    return json !== null && typeof json === 'object' ? (json as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function normalizeRepository(url: string): string {
  return url
    .replace(/^git\+/, '')
    .replace(/\.git$/, '')
    .replace(/\/$/, '')
    .toLowerCase();
}

/**
 * Look up the Sigstore attestations npm stores for a published version.
 *
 * A 404 means "no attestations" and is reported as `{ ok: true, verified: false }`,
 * not as an error. Only transport failures produce `ok: false`.
 *
 * @param options.expectedRepository - `https://github.com/owner/repo`; when given,
 *   `verified` additionally requires the provenance predicate to name it.
 * @param options.attestationsUrl - `dist.attestations.url` from the version
 *   document, preferred over the constructed URL when available.
 */
export async function getProvenance(
  pkg: string,
  version: string,
  options: { expectedRepository?: string; attestationsUrl?: string | null } = {},
): Promise<Result<ProvenanceStatus>> {
  const empty: ProvenanceStatus = {
    verified: false,
    count: 0,
    urls: [],
    sourceRepository: null,
    workflowPath: null,
    runUrl: null,
    commit: null,
    predicateTypes: [],
  };

  try {
    const url =
      options.attestationsUrl ??
      `${REGISTRY_URL}/-/npm/v1/attestations/${encodePackageName(pkg)}@${version}`;
    const response = await fetchJson(url);
    if (response.status === 404) {
      return { ok: true, data: empty };
    }
    if (response.body === null) {
      return { ok: false, error: `attestations endpoint responded with HTTP ${response.status}` };
    }

    const attestations = (response.body as AttestationsDoc).attestations ?? [];
    const status: ProvenanceStatus = { ...empty, count: attestations.length, urls: [url], predicateTypes: [] };
    let hasProvenance = false;

    for (const attestation of attestations) {
      const predicateType = asString(attestation.predicateType);
      if (predicateType) status.predicateTypes.push(predicateType);

      for (const entry of attestation.bundle?.verificationMaterial?.tlogEntries ?? []) {
        const logIndex =
          asString(entry.logIndex) ?? (typeof entry.logIndex === 'number' ? String(entry.logIndex) : null);
        if (logIndex) status.urls.push(`https://search.sigstore.dev/?logIndex=${logIndex}`);
      }

      if (!predicateType?.includes('slsa.dev/provenance')) continue;
      hasProvenance = true;

      const statement = decodeDssePayload(attestation.bundle?.dsseEnvelope?.payload);
      const predicate = statement?.predicate as (SlsaPredicateV1 & SlsaPredicateV02) | undefined;
      if (!predicate) continue;

      const v1Workflow = predicate.buildDefinition?.externalParameters?.workflow;
      const v02Source = predicate.invocation?.configSource;

      status.sourceRepository =
        asString(v1Workflow?.repository) ??
        (asString(v02Source?.uri)?.replace(/^git\+/, '').replace(/@.*$/, '') ?? null);
      status.workflowPath = asString(v1Workflow?.path) ?? asString(v02Source?.entryPoint);
      status.runUrl =
        asString(predicate.runDetails?.metadata?.invocationId) ??
        asString(predicate.metadata?.buildInvocationId);
      status.commit =
        asString(predicate.buildDefinition?.resolvedDependencies?.[0]?.digest?.gitCommit) ??
        asString(v02Source?.digest?.sha1);
      if (status.runUrl) status.urls.push(status.runUrl);
    }

    const repositoryMatches =
      options.expectedRepository === undefined ||
      (status.sourceRepository !== null &&
        normalizeRepository(status.sourceRepository) === normalizeRepository(options.expectedRepository));

    status.verified = hasProvenance && repositoryMatches;
    return { ok: true, data: status };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

/**
 * Verify one registry signature. The registry signs the string
 * `"<name>@<version>:<integrity>"` with ECDSA P-256 / SHA-256 and publishes
 * the SPKI public key at `/-/npm/v1/keys`. This is the same check
 * `npm audit signatures` performs for registry signatures.
 */
export function verifyRegistrySignature(
  spkiBase64: string,
  message: string,
  signatureBase64: string,
): boolean {
  try {
    const publicKey = createPublicKey({
      key: Buffer.from(spkiBase64, 'base64'),
      format: 'der',
      type: 'spki',
    });
    return cryptoVerify(
      'sha256',
      Buffer.from(message, 'utf8'),
      publicKey,
      Buffer.from(signatureBase64, 'base64'),
    );
  } catch {
    return false;
  }
}

/**
 * Count verified, missing and invalid registry signatures for a version.
 *
 * Three cached requests: the registry key set, the version document (for
 * `dist.signatures` and `dist.integrity`) and the packument (for the publish
 * time, used to reject keys that had already expired when the version was
 * published).
 */
export async function getSignatures(pkg: string, version: string): Promise<Result<SignatureStatus>> {
  try {
    const [keysResponse, versionResponse, publishedAt] = await Promise.all([
      fetchJson(`${REGISTRY_URL}/-/npm/v1/keys`),
      fetchJson(`${REGISTRY_URL}/${encodePackageName(pkg)}/${version}`),
      fetchPublishedAt(pkg, version),
    ]);

    if (keysResponse.body === null) {
      return { ok: false, error: `keys endpoint responded with HTTP ${keysResponse.status}` };
    }
    if (versionResponse.status === 404) {
      return { ok: false, error: `${pkg}@${version} is not published on registry.npmjs.org` };
    }
    if (versionResponse.body === null) {
      return { ok: false, error: `registry responded with HTTP ${versionResponse.status}` };
    }

    const keys = ((keysResponse.body as { keys?: unknown }).keys ?? []) as RegistryKey[];
    const doc = versionResponse.body as VersionDoc;
    const integrity = asString(doc.dist?.integrity);
    const signatures = Array.isArray(doc.dist?.signatures)
      ? (doc.dist.signatures as Array<{ sig?: unknown; keyid?: unknown }>)
      : [];

    if (signatures.length === 0 || integrity === null) {
      return { ok: true, data: { verified: 0, missing: 1, invalid: 0 } };
    }

    const message = `${pkg}@${version}:${integrity}`;
    const result: SignatureStatus = { verified: 0, missing: 0, invalid: 0 };

    for (const signature of signatures) {
      const sig = asString(signature.sig);
      const keyid = asString(signature.keyid);
      const key = keys.find((candidate) => candidate.keyid === keyid);

      if (!sig || !key) {
        result.invalid += 1;
        continue;
      }
      if (key.expires && publishedAt && new Date(key.expires) < new Date(publishedAt)) {
        result.invalid += 1;
        continue;
      }
      if (verifyRegistrySignature(key.key, message, sig)) {
        result.verified += 1;
      } else {
        result.invalid += 1;
      }
    }

    return { ok: true, data: result };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}
