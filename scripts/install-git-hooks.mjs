#!/usr/bin/env node
/** Point this clone at repo .githooks (strips Cursor co-author trailers). */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

try {
  execFileSync('git', ['rev-parse', '--is-inside-work-tree'], {
    cwd: root,
    stdio: 'ignore',
  });
  execFileSync('git', ['config', 'core.hooksPath', '.githooks'], {
    cwd: root,
    stdio: 'ignore',
  });
} catch {
  // Not a git checkout (e.g. packaged install) — skip quietly.
}
