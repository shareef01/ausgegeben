/**
 * Fails when a Tailwind-shaped utility class is used in JSX but never defined
 * in src/theme/*.css.
 *
 * This project hand-writes its utility classes — there is no Tailwind or
 * PostCSS build — so a class like `w-32` or `bg-[color-mix(...)]` silently does
 * nothing if nobody wrote the rule. That has already shipped real bugs (an
 * invisible loading skeleton, a bottom nav docked off-screen), and neither
 * TypeScript nor the bundler can catch it.
 *
 * Only utility-shaped tokens are checked. Semantic/BEM names (`skeleton-row`,
 * `overlay--settings`) are intentionally style-optional and are ignored.
 */
import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Tokens that look like a utility rather than a semantic component class. */
const UTILITY_PATTERNS = [
  /^-?(w|h|min-w|min-h|max-w|max-h|p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|gap-x|gap-y|space-x|space-y|inset|top|bottom|left|right|z)-/,
  /^-?(text|bg|border|rounded|shadow|opacity|ring|fill|stroke|tracking|leading|font)-/,
  /^(flex|grid|block|inline|hidden|absolute|relative|fixed|sticky|truncate|shrink|grow|order)-/,
  /^(hover|focus|active|disabled|group-hover|focus-visible|last|first|sm|md|lg|xl):/,
];

const isUtilityShaped = (t) =>
  !t.includes('${') && UTILITY_PATTERNS.some((re) => re.test(t));

function collectUsedClasses() {
  const files = globSync('src/**/*.{tsx,ts}', { cwd: root });
  const used = new Map(); // token -> Set(file)
  for (const rel of files) {
    const src = readFileSync(join(root, rel), 'utf8');
    const chunks = [];
    // Plain quotes only. Allowing a backtick here made this regex slice template
    // literals at the first inner quote, which both emitted junk tokens (`===`, `?`)
    // and meant the conditional class was never collected at all.
    for (const m of src.matchAll(/className=\{?["']([^"']+)["']/g)) chunks.push(m[1]);
    for (const m of src.matchAll(/className=\{`([^`]*)`\}/g)) {
      const body = m[1];
      // Classes inside the ${...} holes are real class names — collect them before
      // stripping, or every conditional class escapes the check.
      for (const q of body.matchAll(/['"]([^'"]*)['"]/g)) chunks.push(q[1]);
      // Then the static text around the holes.
      chunks.push(body.replace(/\$\{[^}]*\}/g, ' '));
    }
    for (const chunk of chunks) {
      for (const token of chunk.split(/\s+/)) {
        if (!token) continue;
        if (!used.has(token)) used.set(token, new Set());
        used.get(token).add(rel);
      }
    }
  }
  return used;
}

function loadCss() {
  return globSync('src/theme/*.css', { cwd: root })
    .map((rel) => readFileSync(join(root, rel), 'utf8'))
    .join('\n');
}

/** CSS-escape the characters this codebase escapes in its selectors. */
function toSelector(token) {
  return '.' + [...token].map((ch) => (':[]().%/+.,'.includes(ch) ? '\\' + ch : ch)).join('');
}

const css = loadCss();
const used = collectUsedClasses();
const missing = [];

for (const [token, files] of used) {
  if (!isUtilityShaped(token)) continue;
  if (css.includes(toSelector(token)) || css.includes('.' + token)) continue;
  missing.push({ token, files: [...files] });
}

if (missing.length > 0) {
  console.error(`\n${missing.length} utility class(es) used in JSX but not defined in src/theme/*.css:\n`);
  for (const { token, files } of missing.sort((a, b) => a.token.localeCompare(b.token))) {
    console.error(`  ${token}`);
    for (const f of files) console.error(`      used in ${f}`);
  }
  console.error('\nDefine them in src/theme/layout.css (or restyle the component), then re-run.\n');
  process.exit(1);
}

console.log(`check-css-classes: OK — ${used.size} class tokens scanned, no undefined utilities.`);
