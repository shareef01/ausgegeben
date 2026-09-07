import assert from 'node:assert/strict';
import test from 'node:test';
import { summarize } from './index.js';

test('receiver independently drops sensitive context and redacts message data', () => {
  const entry = summarize({
    source: 'manual',
    error: { message: 'alice@example.com Bearer abc.def.ghi password=hunter2' },
    context: { operation: 'save', amount: 42, note: 'rent', uid: 'user-1' },
  });
  const serialized = JSON.stringify(entry);
  assert.doesNotMatch(serialized, /alice@example\.com|hunter2|rent|user-1|"amount"/);
  assert.equal(entry.context.operation, 'save');
});
