// website/lib/highlight.ts
//
// Shiki runs only on the server (build time for this static page). The
// highlighter is created once per process with a single grammar and two
// themes; the output carries both themes as CSS variables so dark mode is a
// pure-CSS switch with no client JavaScript.
import 'server-only';

import { createHighlighterCore, type HighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';

let highlighterPromise: Promise<HighlighterCore> | null = null;

function getHighlighter(): Promise<HighlighterCore> {
  highlighterPromise ??= createHighlighterCore({
    themes: [import('shiki/themes/github-light-default.mjs'), import('shiki/themes/github-dark-default.mjs')],
    langs: [import('shiki/langs/bash.mjs')],
    engine: createJavaScriptRegexEngine(),
  });
  return highlighterPromise;
}

/** `text` is Shiki's built-in plain-text language: no grammar is loaded for it. */
export type HighlightLanguage = 'bash' | 'text';

/** Highlight a snippet to HTML with light and dark theme variables. */
export async function highlight(code: string, lang: HighlightLanguage = 'bash'): Promise<string> {
  const highlighter = await getHighlighter();
  return highlighter.codeToHtml(code, {
    lang,
    themes: { light: 'github-light-default', dark: 'github-dark-default' },
    defaultColor: false,
  });
}
