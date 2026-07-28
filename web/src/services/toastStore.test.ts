import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useToastStore } from '@/services/toastStore';

describe('toastStore', () => {
  beforeEach(() => {
    useToastStore.getState().dismiss({ skipDismissCallback: true });
  });

  it('runs the previous onDismiss when a new toast replaces it', () => {
    const firstDismiss = vi.fn();
    const secondDismiss = vi.fn();

    useToastStore.getState().show('deleted', 'undo', () => {}, firstDismiss);
    useToastStore.getState().show('saved');

    expect(firstDismiss).toHaveBeenCalledTimes(1);
    expect(useToastStore.getState().message).toBe('saved');
    expect(secondDismiss).not.toHaveBeenCalled();
  });

  it('skips onDismiss when dismiss({ skipDismissCallback: true })', () => {
    const onDismiss = vi.fn();
    useToastStore.getState().show('deleted', 'undo', () => {}, onDismiss);
    useToastStore.getState().dismiss({ skipDismissCallback: true });
    expect(onDismiss).not.toHaveBeenCalled();
    expect(useToastStore.getState().message).toBe('');
  });
});
