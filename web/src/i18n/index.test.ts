import { describe, expect, it } from 'vitest';
import { t } from '@/i18n';
import { en, type TranslationKey } from '@/i18n/en';
import { de } from '@/i18n/de';

describe('i18n', () => {
  it('returns English strings by default', () => {
    expect(t('periodAllTime')).toBe('all time');
  });

  it('interpolates params', () => {
    expect(t('syncLastAt', { time: '10:00' })).toContain('10:00');
  });

  it('de catalog has every English key with a non-empty string', () => {
    const keys = Object.keys(en) as TranslationKey[];
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(de[key], key).toBeTypeOf('string');
      expect(de[key].length, key).toBeGreaterThan(0);
    }
  });
});
