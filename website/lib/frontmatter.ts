// website/lib/frontmatter.ts
//
// Minimal front-matter reader for content/blog/*.mdx. It understands exactly
// the subset the posts use: `key: value` lines where the value is a bare
// scalar, a double- or single-quoted string, or a JSON array. There is no YAML
// dependency because the brief forbids new runtime dependencies.

export type FrontmatterValue = string | string[];

export interface ParsedFrontmatter {
  data: Record<string, FrontmatterValue>;
  /** The document with the front-matter block removed. */
  body: string;
}

const BLOCK = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;
const LINE = /^([A-Za-z][\w-]*):\s*(.*)$/;

export function parseFrontmatter(source: string): ParsedFrontmatter {
  const match = BLOCK.exec(source);
  if (!match) return { data: {}, body: source };

  const data: Record<string, FrontmatterValue> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = LINE.exec(line);
    if (!kv) continue;
    const [, key, raw] = kv;
    const value = raw.trim();
    if (value.startsWith('[')) {
      const parsed: unknown = JSON.parse(value);
      if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === 'string')) {
        throw new Error(`Front-matter key "${key}" must be an array of strings.`);
      }
      data[key] = parsed;
    } else {
      data[key] = value.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
    }
  }

  return { data, body: source.slice(match[0].length) };
}
