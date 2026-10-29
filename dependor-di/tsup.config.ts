import { defineConfig } from 'tsup';

/**
 * Build configuration.
 *
 * - Dual ESM (`index.js`) + CJS (`index.cjs`) output with matching
 *   declaration files (`index.d.ts` / `index.d.cts`).
 * - `sourcemap: false` on purpose: the published tarball must not carry
 *   source maps that embed original sources (SECURITY-SENSITIVE, see
 *   THREAT_MODEL.md "Information disclosure").
 * - `minify: false` so the published JavaScript is human-reviewable and
 *   matches the repository source line-for-line as closely as possible.
 * - `target: 'node18'` matches `engines.node`.
 */
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: false,
  minify: false,
  splitting: false,
  treeshake: true,
  clean: true,
  target: 'node18',
  platform: 'node',
  outDir: 'dist',
});
