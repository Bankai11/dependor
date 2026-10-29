// website/lib/frontmatter.test.ts
import { describe, expect, it } from 'vitest';

import { parseFrontmatter } from './frontmatter';

describe('parseFrontmatter', () => {
  it('parses bare scalars, quoted strings and JSON arrays', () => {
    const { data, body } = parseFrontmatter(
      ['---', 'title: "A title"', "author: 'Someone'", 'date: 2026-10-29', 'tags: ["a", "b"]', '---', '', 'Body', ''].join(
        '\n',
      ),
    );
    expect(data).toEqual({ title: 'A title', author: 'Someone', date: '2026-10-29', tags: ['a', 'b'] });
    expect(body).toBe('\nBody\n');
  });

  it('returns the whole source as body when there is no front matter', () => {
    const source = '# Heading\n\nText\n';
    expect(parseFrontmatter(source)).toEqual({ data: {}, body: source });
  });

  it('handles CRLF line endings', () => {
    const { data, body } = parseFrontmatter('---\r\ntitle: x\r\n---\r\nBody');
    expect(data).toEqual({ title: 'x' });
    expect(body).toBe('Body');
  });

  it('rejects arrays that are not all strings', () => {
    expect(() => parseFrontmatter('---\ntags: [1, 2]\n---\n')).toThrow(/array of strings/);
  });

  it('ignores lines that are not key: value pairs', () => {
    const { data } = parseFrontmatter('---\n# comment\ntitle: x\n---\n');
    expect(data).toEqual({ title: 'x' });
  });
});
