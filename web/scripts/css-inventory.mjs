/**
 * Inventory of the theme stylesheets in cascade order (src/theme/index.css imports).
 *
 *   node scripts/css-inventory.mjs            report only
 *   node scripts/css-inventory.mjs --fix      also delete provably dead declarations
 *
 * "Dead" is deliberately narrow: a declaration is dead when a later rule with the *identical*
 * selector, in the *identical* @media/@supports context, sets the same property with at least
 * the same importance. Same selector means same specificity, so the later one wins for every
 * element and every state — removing the earlier one cannot change rendering. Pairs where the
 * later value may be unsupported somewhere (dvh, env(), color-mix, -webkit-…) are kept, since
 * the earlier value is then the fallback.
 *
 * Everything else (different selectors overriding each other, !important stacks) is reported,
 * not touched.
 */
import postcss from 'postcss';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const THEME = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'theme');
const FIX = process.argv.includes('--fix');

const indexSrc = readFileSync(join(THEME, 'index.css'), 'utf8');
const imports = [...indexSrc.matchAll(/@import\s+'\.\/([^']+)'/g)].map((m) => m[1]);
const files = [...imports, 'index.css'];

const FALLBACK_SENSITIVE = /(\d[dsl]v[hw]\b|env\(|color-mix|-webkit-|-moz-|\bcq[iwbh]\b|:has\(|@container|fit-content|clamp\(|min\(|max\()/;

const roots = new Map(files.map((f) => [f, postcss.parse(readFileSync(join(THEME, f), 'utf8'), { from: f })]));

function contextOf(node) {
  const parts = [];
  for (let p = node.parent; p && p.type !== 'root'; p = p.parent) {
    if (p.type === 'atrule') parts.unshift(`@${p.name} ${p.params.replace(/\s+/g, ' ').trim()}`);
  }
  return parts.join(' > ');
}

const norm = (s) => s.replace(/\s+/g, ' ').replace(/\s*([>+~,])\s*/g, '$1').trim();

// Every declaration, in cascade order.
const decls = [];
let order = 0;
for (const f of files) {
  roots.get(f).walkRules((rule) => {
    if (rule.parent?.type === 'atrule' && /keyframes$/.test(rule.parent.name)) return;
    const ctx = contextOf(rule);
    const selectors = rule.selectors.map(norm);
    rule.each((d) => {
      if (d.type !== 'decl') return;
      decls.push({ file: f, line: d.source.start.line, selectors, ctx, prop: d.prop.toLowerCase(), value: d.value, important: Boolean(d.important), node: d, rule, order: order++ });
    });
  });
}

// Index by (selector, context, property).
const byKey = new Map();
for (const d of decls) {
  for (const s of d.selectors) {
    const k = `${d.ctx}||${s}||${d.prop}`;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(d);
  }
}

// A declaration is dead only if it is dead for *every* selector in its rule's list.
const deadFor = new Map(); // decl -> { winner per selector }
for (const d of decls) {
  const winners = [];
  for (const s of d.selectors) {
    const list = byKey.get(`${d.ctx}||${s}||${d.prop}`);
    const later = list.filter((o) => o.order > d.order && (o.important || !d.important));
    const safe = later.filter((o) => !FALLBACK_SENSITIVE.test(o.value) || o.value === d.value);
    if (safe.length === 0) { winners.length = 0; break; }
    winners.push(safe[safe.length - 1]);
  }
  if (winners.length === d.selectors.length) deadFor.set(d, winners);
}

const rel = (d) => `${d.file}:${d.line}`;
const dead = [...deadFor.keys()];
const identical = dead.filter((d) => deadFor.get(d).every((w) => w.value === d.value && w.important === d.important));

// Same selector+context+property set in more than one file with different values: the
// cross-file overrides the later stylesheets exist to make.
const overrides = [];
for (const [k, list] of byKey) {
  const filesSeen = new Set(list.map((d) => d.file));
  if (filesSeen.size < 2) continue;
  const values = new Set(list.map((d) => `${d.value}${d.important ? ' !important' : ''}`));
  if (values.size < 2) continue;
  const [ctx, sel, prop] = k.split('||');
  overrides.push({ ctx, sel, prop, chain: list.map((d) => `${rel(d)} ${d.value}${d.important ? ' !important' : ''}`) });
}

const importantCount = Object.fromEntries(files.map((f) => [f, decls.filter((d) => d.file === f && d.important).length]));
const keyframes = new Map();
for (const f of files) {
  roots.get(f).walkAtRules(/keyframes$/, (a) => {
    const list = keyframes.get(a.params) ?? [];
    list.push(`${f}:${a.source.start.line}`);
    keyframes.set(a.params, list);
  });
}

console.log(`# CSS inventory (${files.length} files, ${decls.length} declarations)\n`);
console.log(`cascade order: ${files.join(' → ')}\n`);
console.log(`## Dead declarations: ${dead.length} (${identical.length} exact repeats, ${dead.length - identical.length} overridden by a different value)\n`);
for (const d of dead) {
  const w = deadFor.get(d);
  console.log(`- ${rel(d)}  \`${d.selectors.join(', ')}\`${d.ctx ? ` [${d.ctx}]` : ''}  ${d.prop}: ${d.value}${d.important ? ' !important' : ''}  →  wins: ${w.map((x) => `${rel(x)} ${x.value}${x.important ? ' !important' : ''}`).join('; ')}`);
}
console.log(`\n## Cross-file overrides of the same selector: ${overrides.length}\n`);
for (const o of overrides) console.log(`- \`${o.sel}\`${o.ctx ? ` [${o.ctx}]` : ''} ${o.prop}: ${o.chain.join('  ⟶  ')}`);
console.log(`\n## !important per file\n`);
for (const [f, n] of Object.entries(importantCount)) console.log(`- ${f}: ${n}`);
console.log(`\n## Duplicate @keyframes\n`);
for (const [name, where] of keyframes) if (where.length > 1) console.log(`- ${name}: ${where.join(', ')}`);

if (FIX) {
  const touched = new Set();
  for (const d of dead) {
    const rule = d.node.parent;
    d.node.remove();
    touched.add(d.file);
    if (rule && rule.nodes && rule.nodes.filter((n) => n.type === 'decl').length === 0 && rule.nodes.every((n) => n.type !== 'rule')) {
      // Keep comments that documented the rule only if something else remains.
      if (rule.nodes.length === 0 || rule.nodes.every((n) => n.type === 'comment')) {
        const parent = rule.parent;
        rule.remove();
        while (parent && parent.type === 'atrule' && parent.nodes && parent.nodes.length === 0) {
          const up = parent.parent;
          parent.remove();
          if (!up || up.type !== 'atrule') break;
        }
      }
    }
  }
  for (const f of touched) writeFileSync(join(THEME, f), roots.get(f).toString());
  console.log(`\nremoved ${dead.length} declarations from ${[...touched].join(', ')}`);
}
