import { describe, expect, it } from 'vitest';
import { mergeById, mergePreferences, recordTimestamp } from '@/utils/syncMerge';

type Item = { id?: number; updatedAt?: number; deleted?: boolean; value: string };

describe('syncMerge', () => {
  it('recordTimestamp falls back when missing', () => {
    expect(recordTimestamp(undefined, 42)).toBe(42);
    expect(recordTimestamp(10)).toBe(10);
  });

  it('mergeById applies remote-only items', () => {
    const result = mergeById<Item>([], [{ id: 1, updatedAt: 5, value: 'remote' }]);
    expect(result.toApplyLocal).toHaveLength(1);
    expect(result.toPushRemote).toHaveLength(0);
  });

  it('mergeById pushes local-only items', () => {
    const result = mergeById<Item>([{ id: 2, updatedAt: 3, value: 'local' }], []);
    expect(result.toPushRemote).toHaveLength(1);
  });

  it('mergeById prefers newer remote update', () => {
    const result = mergeById<Item>(
      [{ id: 1, updatedAt: 1, value: 'local' }],
      [{ id: 1, updatedAt: 5, value: 'remote' }],
    );
    expect(result.toApplyLocal[0]?.value).toBe('remote');
  });

  it('mergeById deletes locally when remote tombstone is newer', () => {
    const result = mergeById<Item>(
      [{ id: 1, updatedAt: 1, value: 'local' }],
      [{ id: 1, updatedAt: 5, value: 'remote', deleted: true }],
    );
    expect(result.toDeleteLocal).toEqual([1]);
  });

  it('mergePreferences picks newer updatedAt', () => {
    expect(mergePreferences({ updatedAt: 1, x: 'local' }, { updatedAt: 5, x: 'remote' })).toEqual({
      updatedAt: 5,
      x: 'remote',
    });
  });
});
