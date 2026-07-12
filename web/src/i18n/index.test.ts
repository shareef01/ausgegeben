import { describe, expect, it } from 'vitest';
import { t } from '@/i18n';

describe('i18n', () => {
  it('returns English strings by default', () => {
    expect(t('periodAllTime')).toBe('all time');
  });

  it('interpolates params', () => {
    expect(t('syncLastAt', { time: '10:00' })).toContain('10:00');
  });
});
