import path from 'node:path';

import type { NextConfig } from 'next';

// The /security routes read ../dependor-di/{README,SECURITY,THREAT_MODEL}.md and
// package.json at render time (ISR, revalidate 3600). Those files live outside
// the website root, so tell the file tracer to include them in the serverless
// output; otherwise they are present at build time but missing at runtime.
const packageDocs = ['../dependor-di/*.md', '../dependor-di/package.json'];

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(process.cwd(), '..'),
  outputFileTracingIncludes: {
    '/security': packageDocs,
    '/security/threat-model': packageDocs,
    '/security/policy': packageDocs,
  },
};

export default nextConfig;
