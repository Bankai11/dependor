// website/lib/blog.test.ts
//
// Two jobs: unit-test the loader, and act as the content lint for the posts
// in content/blog/. The copy rules below come from the brief for the
// provenance post (no emoji, no exclamation marks, word budget, thesis
// sentence, link counts). Keeping them in a test means `npm test` fails if a
// future edit drifts.
import { describe, expect, it } from 'vitest';

import { getAllPosts, getPost, loadPost } from './blog';

const posts = getAllPosts();

/** Body text with code fences, comments and link URLs removed. */
function prose(body: string): string {
  return body
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\]\([^)]*\)/g, ']');
}

function words(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

describe('loadPost', () => {
  const valid = [
    '---',
    'title: "T"',
    'description: "D"',
    'date: 2026-10-29',
    'author: "A"',
    'canonical: "https://example.com/blog/t"',
    'ogImage: "/blog/t/opengraph-image"',
    '---',
    'Body',
  ].join('\n');

  it('returns a Post for valid front matter', () => {
    const post = loadPost('t', valid);
    expect(post.slug).toBe('t');
    expect(post.title).toBe('T');
    expect(post.tags).toEqual([]);
    expect(post.body.trim()).toBe('Body');
  });

  it('names the missing field', () => {
    expect(() => loadPost('t', valid.replace('author: "A"\n', ''))).toThrow(/missing "author"/);
  });

  it('rejects non-ISO dates', () => {
    expect(() => loadPost('t', valid.replace('2026-10-29', '29/10/2026'))).toThrow(/YYYY-MM-DD/);
  });
});

describe('content/blog', () => {
  it('has at least one post and getPost agrees with getAllPosts', () => {
    expect(posts.length).toBeGreaterThan(0);
    for (const post of posts) {
      expect(getPost(post.slug)).toEqual(post);
    }
    expect(getPost('does-not-exist')).toBeNull();
  });

  it.each(posts.map((post) => [post.slug, post] as const))('%s has SEO-safe front matter', (_slug, post) => {
    expect(post.title.length).toBeLessThanOrEqual(60);
    expect(post.description.length).toBeLessThanOrEqual(155);
    expect(post.canonical).toMatch(/^https:\/\/[^/]+\/blog\/[a-z0-9-]+$/);
    expect(post.canonical.endsWith(`/blog/${post.slug}`)).toBe(true);
    expect(post.ogImage).toBe(`/blog/${post.slug}/opengraph-image`);
    expect(post.tags.length).toBeGreaterThan(0);
  });

  it.each(posts.map((post) => [post.slug, post] as const))('%s follows the house copy rules', (_slug, post) => {
    const text = prose(post.body);
    expect(text, 'no exclamation marks').not.toMatch(/!/);
    expect(text, 'no emoji').not.toMatch(/\p{Extended_Pictographic}/u);
    expect(text, 'no marketing superlatives').not.toMatch(/game-changer|revolutioni[sz]e/i);
    // Bare `dependor` is a different npm package; only the scoped name, the
    // GitHub slug and the tarball basename may contain the word.
    expect(text, 'no bare package name').not.toMatch(/(?<![@/\-\w])dependor(?![\w\-/])/);
  });
});

describe('provenance-is-not-security', () => {
  const post = getPost('provenance-is-not-security');
  if (!post) throw new Error('content/blog/provenance-is-not-security.mdx is missing');
  const text = prose(post.body);

  it('keeps the exact title and a description within 155 characters', () => {
    expect(post.title).toBe('Provenance is not security');
    expect(post.description.length).toBeLessThanOrEqual(155);
  });

  it('stays within the 1,100 to 1,400 word budget (prose, code fences excluded)', () => {
    const count = words(text);
    expect(count).toBeGreaterThanOrEqual(1100);
    expect(count).toBeLessThanOrEqual(1400);
  });

  it('has the required sections in order', () => {
    const headings = [...post.body.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
    expect(headings).toEqual([
      'The green checkmark problem',
      'What provenance actually proves',
      'What provenance does not prove',
      'A worked example: verifying Wireup end to end',
      'Provenance as one signal among several',
      'What to do before your next npm install',
    ]);
  });

  it('states the thesis verbatim and labels the hypothetical', () => {
    expect(post.body).toContain('Provenance is not a verdict. It is a precondition.');
    expect(post.body).toContain('[hypothetical]');
  });

  it('links to /security at least three times and to the disclosure policy', () => {
    const internal = [...post.body.matchAll(/\]\((\/[^)]*)\)/g)].map((m) => m[1]);
    expect(internal.filter((href) => href === '/security' || href.startsWith('/security#')).length).toBeGreaterThanOrEqual(3);
    expect(internal).toContain('/security/policy');
  });

  it('cites only the allowed external hosts', () => {
    const external = [...post.body.matchAll(/\]\((https?:\/\/[^)]*)\)/g)].map((m) => new URL(m[1]).hostname);
    const allowed = new Set(['slsa.dev', 'in-toto.io', 'docs.npmjs.com', 'docs.sigstore.dev', 'www.sigstore.dev']);
    for (const host of external) expect(allowed.has(host), host).toBe(true);
  });

  it('does not cite named incidents or CVEs', () => {
    expect(text).not.toMatch(/CVE-\d{4}-\d+/);
    expect(text).not.toMatch(/AsyncAPI/i);
  });
});
