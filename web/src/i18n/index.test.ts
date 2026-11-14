import { describe, expect, it } from 'vitest';
import { pluralKey, t } from '@/i18n';
import { en, type TranslationKey } from '@/i18n/en';
import { de } from '@/i18n/de';

describe('i18n', () => {
  it('returns English strings by default', () => {
    expect(t('periodAllTime')).toBe('all time');
  });

  it('interpolates params', () => {
    expect(t('syncLastAt', { time: '10:00' })).toContain('10:00');
  });

  // t() replaces `{name}`, so a `{{name}}` placeholder renders with stray braces ("{1}").
  it('no catalog string uses {{double-brace}} placeholders', () => {
    for (const [lang, catalog] of [['en', en], ['de', de]] as const) {
      for (const [key, value] of Object.entries(catalog)) {
        expect(value, `${lang}.${key}`).not.toMatch(/\{\{\w+\}\}/);
      }
    }
    expect(t('recurringIssuesWarning', { count: '2' })).toContain(' 2 ');
    expect(t('recurringIssuesWarning', { count: '2' })).not.toMatch(/[{}]/);
  });

  it('pluralKey picks the singular only for a count of one, in both languages', () => {
    expect(pluralKey(1, 'countTransactionsOne', 'countTransactionsOther', 'en')).toBe('countTransactionsOne');
    expect(pluralKey(0, 'countTransactionsOne', 'countTransactionsOther', 'en')).toBe('countTransactionsOther');
    expect(pluralKey(2, 'countTransactionsOne', 'countTransactionsOther', 'en')).toBe('countTransactionsOther');
    expect(pluralKey(1, 'countCategoriesOne', 'countCategoriesOther', 'de')).toBe('countCategoriesOne');
    expect(pluralKey(5, 'countCategoriesOne', 'countCategoriesOther', 'de')).toBe('countCategoriesOther');
    expect(t('countTransactionsOne', { count: 1 })).toBe('1 transaction');
    expect(t('settingsRestoreSuccess', { transactions: '1 transaction', categories: '2 categories' }))
      .toBe('Backup restored: 1 transaction, 2 categories');
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

  /**
   * RST-1: a merge restore overwrites matching records with the file's values (last writer wins,
   * verified in web/emulator/restoreConcurrency.test.ts) and, unlike replace, writes no safety
   * snapshot, so it cannot be undone. The confirmation dialog is the only place the user can
   * learn that before it happens.
   */
  it('the merge restore dialog discloses overwrites of newer edits and that it cannot be undone', () => {
    expect(en.settingsRestoreBackupExplain.toLowerCase()).toContain('another device');
    expect(en.settingsRestoreBackupExplain.toLowerCase()).toContain('cannot be undone');
    expect(de.settingsRestoreBackupExplain.toLowerCase()).toContain('anderen gerät');
    expect(de.settingsRestoreBackupExplain.toLowerCase()).toContain('rückgängig');
  });
});
