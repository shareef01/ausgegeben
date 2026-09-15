#!/usr/bin/env node
/**
 * TEL-1 structural guard — a narrow heuristic, not a proof of telemetry safety.
 *
 * Fails if a thrown Error anywhere in the app's source dumps a whole object's contents
 * into its message. That is the exact shape a past audit hypothesized and specifically
 * checked for: `throw new Error(`Failed to save expense: ${JSON.stringify(expense)}`)`
 * would put raw financial data (amount, note, category, merchant) directly into a
 * string that later ships to telemetry — and no redaction regex in errorSink.ts's
 * `redact()` can tell that string apart from legitimate free text, because it isn't
 * credential-shaped.
 *
 * This catches exactly one dangerous shape (a `JSON.stringify(` call nested inside a
 * `new Error(` call, anywhere in that call's argument list, including across multiple
 * lines) — it is deliberately not a general ban on template-literal interpolation in
 * Error messages: the codebase already safely interpolates opaque, non-sensitive
 * identifiers (a category's UUID) into a couple of Error messages today, and flagging
 * every such case would be noise a real reviewer would just learn to ignore. It also
 * cannot catch every way user data could end up in a thrown Error — a field
 * interpolated individually (`` `Failed for ${expense.note}` ``), a raw value rethrown
 * from a caught exception, or a error constructed in a way this pattern doesn't
 * recognize would all pass silently. This guard narrows one specific, previously-real
 * mistake; it does not prove arbitrary PII can never reach telemetry.
 *
 * Run: node scripts/check-telemetry-throw-sites.mjs
 */
import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..'); // web/

// The whole app's source, not just repositories/services — a throw site elsewhere
// (viewmodels, components, utils, hooks, views) is just as capable of dumping an
// object into an Error message, and this guard previously missed all of those.
const SCAN_DIRS = ['src'];
const PATTERN = /new\s+Error\s*\([^)]*JSON\.stringify\(/g;

let violations = [];

for (const dir of SCAN_DIRS) {
  const files = globSync(`${dir}/**/*.{ts,tsx}`, { cwd: root }).filter(
    (f) => !f.endsWith('.test.ts') && !f.endsWith('.test.tsx') && !f.endsWith('.spec.ts'),
  );
  for (const file of files) {
    const fullPath = path.join(root, file);
    const text = readFileSync(fullPath, 'utf8');
    // Matched against the whole file (not line-by-line): `[^)]*` and `\s*` already
    // match a literal newline, so a `new Error(` and its `JSON.stringify(` split
    // across multiple lines are still caught — a per-line regex would silently miss
    // that split (independently confirmed during review: a probe throw statement
    // with `new Error(` and `JSON.stringify(` on separate lines passed a per-line
    // version of this check without any violation reported).
    for (const match of text.matchAll(PATTERN)) {
      const line = text.slice(0, match.index).split('\n').length;
      violations.push(`${file}:${line}: ${match[0].replace(/\s+/g, ' ')}`);
    }
  }
}

if (violations.length > 0) {
  console.error('TEL-1 guard failed: found JSON.stringify(...) inside a thrown Error.');
  console.error('This puts raw object contents (potentially amount/note/category/merchant) into');
  console.error('an Error message, where no redaction regex can distinguish it from safe text.');
  console.error('Use an opaque identifier or a fixed error code instead, and attach any diagnostic');
  console.error("detail via the allowlisted `context` object (see errorSink.ts's sanitizeContext),");
  console.error('never via the message/stack itself.\n');
  for (const v of violations) console.error(`  ${v}`);
  process.exit(1);
}

console.log(
  `TEL-1 guard passed: no JSON.stringify(...) found inside a thrown Error across ${SCAN_DIRS.join(', ')}. ` +
    'This is a narrow heuristic for one specific mistake, not a guarantee that no other path can leak data into telemetry.',
);
