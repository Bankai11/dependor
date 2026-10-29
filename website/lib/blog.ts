// website/lib/blog.ts
//
// Build-time reader for content/blog/*.mdx. Posts are rendered by
// lib/markdown.tsx, the same renderer the /security routes use for the
// package docs, so the content must stay inside its Markdown subset: no JSX,
// no expressions. The .mdx extension is kept so the files are valid MDX as
// well and can move to @next/mdx without rewriting if JSX in content is ever
// needed. (That would be a new dependency; the brief says ask first.)
import 'server-only';

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { parseFrontmatter } from './frontmatter';

export const BLOG_DIR = path.resolve(process.cwd(), 'content', 'blog');

export interface Post {
  slug: string;
  title: string;
  description: string;
  /** ISO date, YYYY-MM-DD. */
  date: string;
  author: string;
  tags: string[];
  /** Absolute canonical URL. */
  canonical: string;
  /** Site-relative path of the Open Graph image. */
  ogImage: string;
  /** Markdown body with front matter removed. */
  body: string;
}

const REQUIRED = ['title', 'description', 'date', 'author', 'canonical', 'ogImage'] as const;

/** Turn a post source file into a Post, failing loudly on missing fields. */
export function loadPost(slug: string, source: string): Post {
  const { data, body } = parseFrontmatter(source);

  for (const key of REQUIRED) {
    if (typeof data[key] !== 'string' || data[key].length === 0) {
      throw new Error(`content/blog/${slug}: front matter is missing "${key}".`);
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date as string)) {
    throw new Error(`content/blog/${slug}: "date" must be YYYY-MM-DD, got "${String(data.date)}".`);
  }

  const tags = data.tags;
  return {
    slug,
    title: data.title as string,
    description: data.description as string,
    date: data.date as string,
    author: data.author as string,
    tags: Array.isArray(tags) ? tags : [],
    canonical: data.canonical as string,
    ogImage: data.ogImage as string,
    body,
  };
}

function postFiles(): string[] {
  if (!existsSync(BLOG_DIR)) return [];
  return readdirSync(BLOG_DIR)
    .filter((file) => /\.mdx?$/.test(file))
    .sort();
}

export function getAllPosts(): Post[] {
  return postFiles()
    .map((file) => loadPost(file.replace(/\.mdx?$/, ''), readFileSync(path.join(BLOG_DIR, file), 'utf8')))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.slug.localeCompare(b.slug)));
}

export function getPost(slug: string): Post | null {
  const file = postFiles().find((candidate) => candidate.replace(/\.mdx?$/, '') === slug);
  if (!file) return null;
  return loadPost(slug, readFileSync(path.join(BLOG_DIR, file), 'utf8'));
}
