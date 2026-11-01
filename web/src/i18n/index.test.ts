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

  it('de strings use the same {placeholders} as English, so no value is silently dropped', () => {
    const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const key of Object.keys(en) as TranslationKey[]) {
      expect(placeholders(de[key]), key).toEqual(placeholders(en[key]));
    }
  });

  it('the Replace preflight shows how many current categories are kept', () => {
    const text = t('settingsReplaceBackupPreflight', {
      backupExpenses: '3', backupCategories: '2', toDelete: '1', toUpsertCategories: '2', keptCategories: '4',
    });
    expect(text).toContain('Current categories kept (not in the backup): 4');
    expect(text).not.toMatch(/\{\w+\}/);
  });

  /**
   * PRIV-1: a JSON backup is a plaintext copy of the user's whole financial history. The export
   * row is the only place the user is told, so both catalogs must say it (Android's
   * `settings_export_backup_subtitle` carries the same sentence).
   */
  it('the backup export row discloses that the file is unencrypted', () => {
    expect(en.settingsExportBackupSub.toLowerCase()).toContain('unencrypted');
    expect(de.settingsExportBackupSub.toLowerCase()).toContain('unverschlüsselt');
  });
});
