// website/lib/npm.test.ts
import { createSign, generateKeyPairSync } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  encodePackageName,
  getLatestVersion,
  getProvenance,
  getSignatures,
  REGISTRY_URL,
  verifyRegistrySignature,
} from './npm';

const PKG = '@bankai11/dependor';
const ENCODED = '@bankai11%2Fdependor';

type Route = { status: number; body?: unknown } | Error;

function mockFetch(routes: Record<string, Route>) {
  const calls: string[] = [];
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push(url);
    const route = routes[url];
    if (route === undefined) throw new Error(`unexpected fetch: ${url}`);
    if (route instanceof Error) throw route;
    return new Response(route.body === undefined ? null : JSON.stringify(route.body), {
      status: route.status,
      headers: { 'content-type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, calls };
}

function makeKeyPair() {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const spki = publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
  return { spki, privateKey };
}

function sign(privateKey: ReturnType<typeof makeKeyPair>['privateKey'], message: string) {
  return createSign('SHA256').update(message).sign(privateKey).toString('base64');
}

function provenanceBundle(predicate: unknown, logIndex = '123') {
  const statement = { predicateType: 'https://slsa.dev/provenance/v1', predicate };
  return {
    predicateType: 'https://slsa.dev/provenance/v1',
    bundle: {
      dsseEnvelope: { payload: Buffer.from(JSON.stringify(statement)).toString('base64') },
      verificationMaterial: { tlogEntries: [{ logIndex }] },
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('encodePackageName', () => {
  it('encodes the slash of a scoped package and leaves the @', () => {
    expect(encodePackageName(PKG)).toBe(ENCODED);
    expect(encodePackageName('sigstore')).toBe('sigstore');
  });
});

describe('getLatestVersion', () => {
  it('returns version, dist fields and publish time from two cached requests', async () => {
    const { calls } = mockFetch({
      [`${REGISTRY_URL}/${ENCODED}/latest`]: {
        status: 200,
        body: {
          name: PKG,
          version: '0.1.0',
          dist: {
            integrity: 'sha512-abc',
            tarball: 'https://registry.npmjs.org/@bankai11/dependor/-/dependor-0.1.0.tgz',
            attestations: {
              url: `${REGISTRY_URL}/-/npm/v1/attestations/${ENCODED}@0.1.0`,
              provenance: { predicateType: 'https://slsa.dev/provenance/v1' },
            },
          },
        },
      },
      [`${REGISTRY_URL}/${ENCODED}`]: {
        status: 200,
        body: { time: { '0.1.0': '2026-10-29T10:00:00.000Z' } },
      },
    });

    const result = await getLatestVersion(PKG);
    expect(result).toEqual({
      ok: true,
      data: {
        name: PKG,
        version: '0.1.0',
        integrity: 'sha512-abc',
        tarball: 'https://registry.npmjs.org/@bankai11/dependor/-/dependor-0.1.0.tgz',
        publishedAt: '2026-10-29T10:00:00.000Z',
        attestationsUrl: `${REGISTRY_URL}/-/npm/v1/attestations/${ENCODED}@0.1.0`,
        provenancePredicateType: 'https://slsa.dev/provenance/v1',
      },
    });
    expect(calls).toEqual([`${REGISTRY_URL}/${ENCODED}/latest`, `${REGISTRY_URL}/${ENCODED}`]);
  });

  it('reports an unpublished package on 404 without throwing', async () => {
    mockFetch({ [`${REGISTRY_URL}/${ENCODED}/latest`]: { status: 404 } });
    const result = await getLatestVersion(PKG);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/not published/);
  });

  it('reports other HTTP failures', async () => {
    mockFetch({ [`${REGISTRY_URL}/${ENCODED}/latest`]: { status: 503 } });
    const result = await getLatestVersion(PKG);
    expect(result).toEqual({ ok: false, error: 'registry responded with HTTP 503' });
  });

  it('reports network errors', async () => {
    mockFetch({ [`${REGISTRY_URL}/${ENCODED}/latest`]: new Error('ECONNRESET') });
    expect(await getLatestVersion(PKG)).toEqual({ ok: false, error: 'ECONNRESET' });
  });

  it('tolerates a missing packument time map', async () => {
    mockFetch({
      [`${REGISTRY_URL}/${ENCODED}/latest`]: { status: 200, body: { version: '0.1.0', dist: {} } },
      [`${REGISTRY_URL}/${ENCODED}`]: { status: 500 },
    });
    const result = await getLatestVersion(PKG);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.publishedAt).toBeNull();
      expect(result.data.integrity).toBeNull();
      expect(result.data.attestationsUrl).toBeNull();
    }
  });
});

describe('getProvenance', () => {
  const url = `${REGISTRY_URL}/-/npm/v1/attestations/${ENCODED}@0.1.0`;

  it('returns verified=false with zero attestations on 404 and does not throw', async () => {
    mockFetch({ [url]: { status: 404 } });
    const result = await getProvenance(PKG, '0.1.0');
    expect(result).toEqual({
      ok: true,
      data: {
        verified: false,
        count: 0,
        urls: [],
        sourceRepository: null,
        workflowPath: null,
        runUrl: null,
        commit: null,
        predicateTypes: [],
      },
    });
  });

  it('extracts repository, workflow, run and commit from a SLSA v1 predicate', async () => {
    mockFetch({
      [url]: {
        status: 200,
        body: {
          attestations: [
            {
              predicateType: 'https://github.com/npm/attestation/tree/main/specs/publish/v0.1',
              bundle: { verificationMaterial: { tlogEntries: [{ logIndex: '1' }] } },
            },
            provenanceBundle(
              {
                buildDefinition: {
                  externalParameters: {
                    workflow: {
                      repository: 'https://github.com/Bankai11/dependor',
                      path: '.github/workflows/publish.yml',
                    },
                  },
                  resolvedDependencies: [{ digest: { gitCommit: 'deadbeef' } }],
                },
                runDetails: {
                  metadata: { invocationId: 'https://github.com/Bankai11/dependor/actions/runs/42/attempts/1' },
                },
              },
              '2',
            ),
          ],
        },
      },
    });

    const result = await getProvenance(PKG, '0.1.0', {
      expectedRepository: 'git+https://github.com/bankai11/dependor.git',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.verified).toBe(true);
    expect(result.data.count).toBe(2);
    expect(result.data.sourceRepository).toBe('https://github.com/Bankai11/dependor');
    expect(result.data.workflowPath).toBe('.github/workflows/publish.yml');
    expect(result.data.commit).toBe('deadbeef');
    expect(result.data.runUrl).toBe('https://github.com/Bankai11/dependor/actions/runs/42/attempts/1');
    expect(result.data.urls).toEqual([
      url,
      'https://search.sigstore.dev/?logIndex=1',
      'https://search.sigstore.dev/?logIndex=2',
      'https://github.com/Bankai11/dependor/actions/runs/42/attempts/1',
    ]);
    expect(result.data.predicateTypes).toHaveLength(2);
  });

  it('is not verified when the attested repository differs from the expected one', async () => {
    mockFetch({
      [url]: {
        status: 200,
        body: {
          attestations: [
            provenanceBundle({
              buildDefinition: {
                externalParameters: {
                  workflow: { repository: 'https://github.com/someone-else/dependor', path: 'x.yml' },
                },
              },
            }),
          ],
        },
      },
    });
    const result = await getProvenance(PKG, '0.1.0', {
      expectedRepository: 'https://github.com/Bankai11/dependor',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.verified).toBe(false);
      expect(result.data.sourceRepository).toBe('https://github.com/someone-else/dependor');
    }
  });

  it('prefers dist.attestations.url when supplied', async () => {
    const custom = `${REGISTRY_URL}/-/npm/v1/attestations/custom`;
    const { calls } = mockFetch({ [custom]: { status: 404 } });
    await getProvenance(PKG, '0.1.0', { attestationsUrl: custom });
    expect(calls).toEqual([custom]);
  });

  it('reports transport failures as ok=false', async () => {
    mockFetch({ [url]: { status: 500 } });
    expect(await getProvenance(PKG, '0.1.0')).toEqual({
      ok: false,
      error: 'attestations endpoint responded with HTTP 500',
    });
    mockFetch({ [url]: new Error('offline') });
    expect(await getProvenance(PKG, '0.1.0')).toEqual({ ok: false, error: 'offline' });
  });
});

describe('getSignatures', () => {
  const keysUrl = `${REGISTRY_URL}/-/npm/v1/keys`;
  const versionUrl = `${REGISTRY_URL}/${ENCODED}/0.1.0`;
  const packumentUrl = `${REGISTRY_URL}/${ENCODED}`;
  const integrity = 'sha512-H/diQD58RdW56';
  const message = `${PKG}@0.1.0:${integrity}`;

  it('cryptographically verifies a signature made with a published key', async () => {
    const { spki, privateKey } = makeKeyPair();
    mockFetch({
      [keysUrl]: { status: 200, body: { keys: [{ keyid: 'SHA256:k1', key: spki, expires: null }] } },
      [versionUrl]: {
        status: 200,
        body: { dist: { integrity, signatures: [{ keyid: 'SHA256:k1', sig: sign(privateKey, message) }] } },
      },
      [packumentUrl]: { status: 200, body: { time: { '0.1.0': '2026-10-29T10:00:00.000Z' } } },
    });
    expect(await getSignatures(PKG, '0.1.0')).toEqual({
      ok: true,
      data: { verified: 1, missing: 0, invalid: 0 },
    });
  });

  it('counts a tampered integrity as invalid', async () => {
    const { spki, privateKey } = makeKeyPair();
    mockFetch({
      [keysUrl]: { status: 200, body: { keys: [{ keyid: 'SHA256:k1', key: spki, expires: null }] } },
      [versionUrl]: {
        status: 200,
        body: {
          dist: { integrity: 'sha512-TAMPERED', signatures: [{ keyid: 'SHA256:k1', sig: sign(privateKey, message) }] },
        },
      },
      [packumentUrl]: { status: 200, body: { time: {} } },
    });
    expect(await getSignatures(PKG, '0.1.0')).toEqual({
      ok: true,
      data: { verified: 0, missing: 0, invalid: 1 },
    });
  });

  it('counts an unknown key id and an expired key as invalid', async () => {
    const { spki, privateKey } = makeKeyPair();
    mockFetch({
      [keysUrl]: {
        status: 200,
        body: { keys: [{ keyid: 'SHA256:old', key: spki, expires: '2020-01-01T00:00:00.000Z' }] },
      },
      [versionUrl]: {
        status: 200,
        body: {
          dist: {
            integrity,
            signatures: [
              { keyid: 'SHA256:old', sig: sign(privateKey, message) },
              { keyid: 'SHA256:nobody', sig: sign(privateKey, message) },
            ],
          },
        },
      },
      [packumentUrl]: { status: 200, body: { time: { '0.1.0': '2026-10-29T10:00:00.000Z' } } },
    });
    expect(await getSignatures(PKG, '0.1.0')).toEqual({
      ok: true,
      data: { verified: 0, missing: 0, invalid: 2 },
    });
  });

  it('reports missing=1 when the version has no signatures', async () => {
    mockFetch({
      [keysUrl]: { status: 200, body: { keys: [] } },
      [versionUrl]: { status: 200, body: { dist: { integrity } } },
      [packumentUrl]: { status: 200, body: {} },
    });
    expect(await getSignatures(PKG, '0.1.0')).toEqual({
      ok: true,
      data: { verified: 0, missing: 1, invalid: 0 },
    });
  });

  it('reports 404 for the version and failures of the keys endpoint', async () => {
    mockFetch({
      [keysUrl]: { status: 200, body: { keys: [] } },
      [versionUrl]: { status: 404 },
      [packumentUrl]: { status: 404 },
    });
    const notFound = await getSignatures(PKG, '0.1.0');
    expect(notFound.ok).toBe(false);
    if (!notFound.ok) expect(notFound.error).toMatch(/not published/);

    mockFetch({
      [keysUrl]: { status: 502 },
      [versionUrl]: { status: 200, body: { dist: { integrity } } },
      [packumentUrl]: { status: 200, body: {} },
    });
    expect(await getSignatures(PKG, '0.1.0')).toEqual({
      ok: false,
      error: 'keys endpoint responded with HTTP 502',
    });

    mockFetch({
      [keysUrl]: new Error('dns failure'),
      [versionUrl]: { status: 200, body: {} },
      [packumentUrl]: { status: 200, body: {} },
    });
    expect(await getSignatures(PKG, '0.1.0')).toEqual({ ok: false, error: 'dns failure' });
  });
});

describe('verifyRegistrySignature', () => {
  it('returns false instead of throwing on garbage input', () => {
    expect(verifyRegistrySignature('not-a-key', 'msg', 'not-a-sig')).toBe(false);
  });
});
