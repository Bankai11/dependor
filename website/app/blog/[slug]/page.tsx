// website/app/blog/[slug]/page.tsx
//
// Renders one content/blog/*.mdx post. Fenced code becomes a <CopyCommand>
// with server-side Shiki highlighting; everything else goes through the
// shared Markdown renderer with internal links as next/link.
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { CopyCommand } from '@/components/security/CopyCommand';
import { getAllPosts, getPost } from '@/lib/blog';
import { formatDate } from '@/lib/format-date';
import { highlight, type HighlightLanguage } from '@/lib/highlight';
import { parseBlocks, renderBlocks } from '@/lib/markdown';

/** Only posts that exist at build time; anything else is a 404, not a runtime render. */
export const dynamicParams = false;

export function generateStaticParams() {
  return getAllPosts().map((post) => ({ slug: post.slug }));
}

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return {};

  return {
    // `absolute` bypasses the "%s | Wireup" template so the title tag is exactly the front-matter title.
    title: { absolute: post.title },
    description: post.description,
    alternates: { canonical: post.canonical },
    openGraph: {
      title: post.title,
      description: post.description,
      type: 'article',
      url: post.canonical,
      publishedTime: post.date,
      authors: [post.author],
      tags: post.tags,
      images: [{ url: post.ogImage, width: 1200, height: 630, alt: post.title }],
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.description,
      images: [post.ogImage],
    },
  };
}

/** Map a fence label onto the grammars lib/highlight.ts loads. */
function toLanguage(fence: string): HighlightLanguage {
  return /^(sh|bash|shell|zsh)$/.test(fence) ? 'bash' : 'text';
}

export default async function BlogPostPage({ params }: { params: Params }) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  const blocks = parseBlocks(post.body);
  const highlighted = await Promise.all(
    blocks.map((block) => (block.type === 'code' ? highlight(block.code, toLanguage(block.lang)) : null)),
  );

  const body = renderBlocks(blocks, {
    newTab: false,
    renderCode: (block, index) => {
      const isShell = toLanguage(block.lang) === 'bash';
      return (
        <CopyCommand
          code={block.code}
          html={highlighted[index] ?? ''}
          lang={isShell ? 'sh' : 'output'}
          copyLabel={isShell ? 'Copy command' : 'Copy output'}
          className="mt-4"
        />
      );
    },
  });

  const origin = new URL(post.canonical).origin;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    dateModified: post.date,
    author: { '@type': 'Organization', name: post.author, url: origin },
    publisher: { '@type': 'Organization', name: 'Wireup', url: origin },
    mainEntityOfPage: { '@type': 'WebPage', '@id': post.canonical },
    image: new URL(post.ogImage, origin).toString(),
    keywords: post.tags.join(', '),
    inLanguage: 'en',
  };

  return (
    <main id="main" className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6">
      <script
        type="application/ld+json"
        // Escaping "<" keeps a closing tag inside the data from ending the script early.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />

      <p className="font-mono text-sm text-muted-foreground">
        <Link href="/blog" className="underline underline-offset-4">
          /blog
        </Link>{' '}
        · <time dateTime={post.date}>{formatDate(post.date)}</time> · {post.author}
      </p>
      <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">{post.title}</h1>
      <p className="mt-6 text-lg leading-8 text-muted-foreground">{post.description}</p>
      <ul className="mt-6 flex flex-wrap gap-2" aria-label="Tags">
        {post.tags.map((tag) => (
          <li key={tag} className="rounded-full border px-2.5 py-0.5 font-mono text-xs text-muted-foreground">
            {tag}
          </li>
        ))}
      </ul>

      <article className="mt-10">{body}</article>

      <footer className="mt-16 rounded-xl border bg-muted/30 p-6 sm:p-8">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Read next</p>
        <p className="mt-2 leading-7">
          <Link href="/security" className="font-medium underline underline-offset-4">
            Verify Wireup yourself
          </Link>
          : the six commands from this post as an interactive checklist, with a live attestation badge.
        </p>
      </footer>
    </main>
  );
}
