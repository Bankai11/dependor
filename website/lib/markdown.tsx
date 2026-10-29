// website/lib/markdown.tsx
//
// A deliberately small Markdown renderer covering exactly the constructs used
// by dependor-di/THREAT_MODEL.md and SECURITY.md: ATX headings, paragraphs,
// bullet and numbered lists (with task items and indented continuations),
// pipe tables, fenced code, block quotes, horizontal rules, HTML comments,
// and inline code / bold / italic / links / autolinks.
//
// TODO: if the docs grow beyond this subset, the smallest real option is
// `@next/mdx` (first-party, no extra runtime). It was not added because the
// brief forbids new runtime dependencies without sign-off.
import Link from 'next/link';
import { Fragment, type ReactNode } from 'react';

/** GitHub-style heading anchors, with inline markup stripped. */
export function slugify(text: string): string {
  return text
    .replace(/[`*_]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

const INLINE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*)|(\[[^\]]+\]\([^)\s]+\))|(<https?:\/\/[^>]+>)/g;

const linkClass = 'underline underline-offset-4 decoration-foreground/40 hover:decoration-foreground';

export interface InlineOptions {
  /**
   * Open external links in a new tab. The /security routes keep the default
   * (true); long-form articles pass false so every link opens in place.
   */
  newTab?: boolean;
}

function MarkdownLink({ href, children, newTab = true }: { href: string; children: ReactNode; newTab?: boolean }) {
  // Site-relative links go through next/link so navigation stays client-side.
  if (href.startsWith('/')) {
    return (
      <Link href={href} className={linkClass}>
        {children}
      </Link>
    );
  }
  const external = /^https?:\/\//.test(href);
  return (
    <a
      href={href}
      className={linkClass}
      {...(external && newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      {children}
    </a>
  );
}

/** Render a single line of Markdown inline syntax. */
export function renderInline(text: string, options: InlineOptions = {}): ReactNode {
  const nodes: ReactNode[] = [];
  let last = 0;
  let key = 0;

  for (const match of text.matchAll(INLINE)) {
    const index = match.index ?? 0;
    if (index > last) nodes.push(text.slice(last, index));
    const [token] = match;

    if (token.startsWith('`')) {
      nodes.push(
        <code key={key++} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]">
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith('**')) {
      nodes.push(<strong key={key++}>{renderInline(token.slice(2, -2), options)}</strong>);
    } else if (token.startsWith('*')) {
      nodes.push(<em key={key++}>{renderInline(token.slice(1, -1), options)}</em>);
    } else if (token.startsWith('[')) {
      const parts = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token);
      if (parts) {
        nodes.push(
          <MarkdownLink key={key++} href={parts[2]} newTab={options.newTab}>
            {renderInline(parts[1], options)}
          </MarkdownLink>,
        );
      }
    } else if (token.startsWith('<')) {
      const href = token.slice(1, -1);
      nodes.push(
        <MarkdownLink key={key++} href={href} newTab={options.newTab}>
          {href}
        </MarkdownLink>,
      );
    }
    last = index + token.length;
  }

  if (last < text.length) nodes.push(text.slice(last));
  return nodes.length === 1 ? nodes[0] : nodes;
}

export interface CodeBlock {
  type: 'code';
  lang: string;
  code: string;
}

export type Block =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; ordered: boolean; items: { text: string; task: boolean | null }[] }
  | { type: 'table'; header: string[]; rows: string[][] }
  | CodeBlock
  | { type: 'quote'; text: string }
  | { type: 'hr' };

const LIST_MARKER = /^(\s*)([-*]|\d+\.) (.+)$/;

/** Split a document into blocks. HTML comments and MDX brace-slash-star comments are dropped. */
export function parseBlocks(markdown: string): Block[] {
  const lines = markdown
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .split(/\r?\n/);
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === '') {
      i += 1;
      continue;
    }

    const heading = /^(#{1,6}) (.+)$/.exec(line);
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2].trim() });
      i += 1;
      continue;
    }

    if (/^---+$/.test(line.trim())) {
      blocks.push({ type: 'hr' });
      i += 1;
      continue;
    }

    const fence = /^```(\w*)/.exec(line);
    if (fence) {
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith('```')) {
        code.push(lines[i]);
        i += 1;
      }
      i += 1;
      blocks.push({ type: 'code', lang: fence[1] || 'text', code: code.join('\n') });
      continue;
    }

    if (line.trim().startsWith('|')) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(
          lines[i]
            .trim()
            .replace(/^\|/, '')
            .replace(/\|$/, '')
            .split('|')
            .map((cell) => cell.trim()),
        );
        i += 1;
      }
      const [header, , ...body] = rows;
      blocks.push({ type: 'table', header, rows: body });
      continue;
    }

    if (line.startsWith('>')) {
      const quote: string[] = [];
      while (i < lines.length && lines[i].startsWith('>')) {
        quote.push(lines[i].replace(/^>\s?/, ''));
        i += 1;
      }
      blocks.push({ type: 'quote', text: quote.join(' ') });
      continue;
    }

    if (LIST_MARKER.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items: { text: string; task: boolean | null }[] = [];
      while (i < lines.length) {
        const current = lines[i];
        const match = LIST_MARKER.exec(current);
        if (match) {
          const task = /^\[([ xX])\] /.exec(match[3]);
          items.push({
            text: task ? match[3].slice(4) : match[3],
            task: task ? task[1] !== ' ' : null,
          });
          i += 1;
        } else if (/^\s+\S/.test(current)) {
          items[items.length - 1].text += ` ${current.trim()}`;
          i += 1;
        } else {
          break;
        }
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }

    const paragraph: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^(#{1,6} |```|>|\||---)/.test(lines[i]) &&
      !LIST_MARKER.test(lines[i])
    ) {
      paragraph.push(lines[i].trim());
      i += 1;
    }
    blocks.push({ type: 'paragraph', text: paragraph.join(' ') });
  }

  return blocks;
}

const headingClass: Record<number, string> = {
  1: 'mt-2 scroll-mt-24 text-3xl font-semibold tracking-tight',
  2: 'mt-12 scroll-mt-24 border-b pb-2 text-2xl font-semibold tracking-tight',
  3: 'mt-8 scroll-mt-24 text-xl font-semibold tracking-tight',
  4: 'mt-6 scroll-mt-24 text-lg font-semibold',
  5: 'mt-4 scroll-mt-24 font-semibold',
  6: 'mt-4 scroll-mt-24 font-semibold text-muted-foreground',
};

export interface RenderOptions extends InlineOptions {
  /**
   * Replace the default `<pre>` for fenced code, for example with a
   * highlighted copy block. The returned node is keyed by the caller.
   */
  renderCode?: (block: CodeBlock, index: number) => ReactNode;
}

/**
 * Render a Markdown document to React elements. Headings get ids from
 * {@link slugify} so in-page anchors from other routes resolve.
 */
export function renderMarkdown(markdown: string, options: RenderOptions = {}): ReactNode {
  return renderBlocks(parseBlocks(markdown), options);
}

/** Render already-parsed blocks; lets callers pre-process code blocks asynchronously. */
export function renderBlocks(blocks: Block[], options: RenderOptions = {}): ReactNode {
  return blocks.map((block, index) => {
    switch (block.type) {
      case 'heading': {
        const Tag = `h${block.level}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
        return (
          <Tag key={index} id={slugify(block.text)} className={headingClass[block.level]}>
            {renderInline(block.text, options)}
          </Tag>
        );
      }
      case 'paragraph':
        return (
          <p key={index} className="mt-4 leading-7">
            {renderInline(block.text, options)}
          </p>
        );
      case 'quote':
        return (
          <blockquote key={index} className="mt-4 border-l-2 pl-4 text-muted-foreground">
            {renderInline(block.text, options)}
          </blockquote>
        );
      case 'hr':
        return <hr key={index} className="my-8" />;
      case 'code':
        if (options.renderCode) {
          return <Fragment key={index}>{options.renderCode(block, index)}</Fragment>;
        }
        return (
          <pre
            key={index}
            data-language={block.lang}
            className="mt-4 overflow-x-auto rounded-lg border bg-muted/40 p-4 font-mono text-sm leading-6"
          >
            <code>{block.code}</code>
          </pre>
        );
      case 'list': {
        const Tag = block.ordered ? 'ol' : 'ul';
        return (
          <Tag
            key={index}
            className={`mt-4 space-y-2 pl-6 leading-7 ${block.ordered ? 'list-decimal' : 'list-disc'}`}
          >
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex} className={item.task !== null ? '-ml-6 flex list-none gap-2' : undefined}>
                {item.task !== null && (
                  <span
                    aria-hidden="true"
                    className="mt-1.5 inline-block size-4 shrink-0 rounded border border-foreground/40"
                  />
                )}
                <span>{renderInline(item.text, options)}</span>
              </li>
            ))}
          </Tag>
        );
      }
      case 'table':
        return (
          <div key={index} className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b">
                  {block.header.map((cell, cellIndex) => (
                    <th key={cellIndex} scope="col" className="py-2 pr-4 text-left font-semibold">
                      {renderInline(cell, options)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, rowIndex) => (
                  <tr key={rowIndex} className="border-b align-top last:border-0">
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex} className="py-2 pr-4 leading-6">
                        {renderInline(cell, options)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
    }
  });
}
