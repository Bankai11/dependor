// website/app/blog/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';

import { getAllPosts } from '@/lib/blog';
import { formatDate } from '@/lib/format-date';

const description = 'Notes on verifiable supply chains, npm provenance and dependency injection from the Wireup team.';

export const metadata: Metadata = {
  title: 'Blog',
  description,
  alternates: { canonical: '/blog' },
};

export default function BlogIndex() {
  const posts = getAllPosts();

  return (
    <main id="main" className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6">
      <p className="font-mono text-sm text-muted-foreground">
        <Link href="/" className="underline underline-offset-4">
          Wireup
        </Link>{' '}
        · blog
      </p>
      <h1 className="mt-4 text-4xl font-semibold tracking-tight">Blog</h1>
      <p className="mt-4 max-w-xl leading-7 text-muted-foreground">{description}</p>

      <ul className="mt-12 divide-y">
        {posts.map((post) => (
          <li key={post.slug} className="py-8 first:pt-0">
            <article>
              <p className="font-mono text-xs text-muted-foreground tabular-nums">
                <time dateTime={post.date}>{formatDate(post.date)}</time> · {post.author}
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                <Link href={`/blog/${post.slug}`} className="hover:underline hover:underline-offset-4">
                  {post.title}
                </Link>
              </h2>
              <p className="mt-3 leading-7 text-muted-foreground">{post.description}</p>
              <ul className="mt-4 flex flex-wrap gap-2" aria-label="Tags">
                {post.tags.map((tag) => (
                  <li key={tag} className="rounded-full border px-2.5 py-0.5 font-mono text-xs text-muted-foreground">
                    {tag}
                  </li>
                ))}
              </ul>
            </article>
          </li>
        ))}
      </ul>
    </main>
  );
}
