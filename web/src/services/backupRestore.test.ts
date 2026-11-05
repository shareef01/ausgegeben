import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  readAndValidateBackupFile,
  restoreBackup,
  MAX_BACKUP_FILE_BYTES,
} from './backupRestore';
import { useAuthStore } from '@/services/authStore';
import { BACKUP_FORMAT_IDENTIFIER, CURRENT_BACKUP_SCHEMA_VERSION, type AusgegebenBackup } from './backupFormat';

describe('backupRestore unit tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ user: null });
  });

  const validBackup: AusgegebenBackup = {
    format: BACKUP_FORMAT_IDENTIFIER,
    schemaVersion: CURRENT_BACKUP_SCHEMA_VERSION,
    categoryBudgets: [],
    recurring: {
      templates: [],
      receipts: [],
    },
    exportedAt: '2026-10-01T00:00:00.000Z',
    appVersion: '2.0.8',
    preferences: {
      currency: 'EUR',
      monthlyBudget: 500,
      locale: 'de',
      themeMode: 'system',
    },
    categories: [
      {
        id: 'cat-1',
        name: 'Food',
        iconName: 'food',
        colorInt: -16711936,
        transactionType: 'expense',
        sortOrder: 0,
      },
    ],
    expenses: [
      {
        id: 'exp-1',
        amount: 12.5,
        dateMillis: 1700000000000,
        categoryId: 'cat-1',
        note: 'Lunch',
        transactionType: 'expense',
      },
    ],
  };

  it('rejects files exceeding MAX_BACKUP_FILE_BYTES', async () => {
    const hugeFile = {
      size: MAX_BACKUP_FILE_BYTES + 1,
      text: () => Promise.resolve('{}'),
    } as unknown as File;

    await expect(readAndValidateBackupFile(hugeFile)).rejects.toThrow('BACKUP_FILE_TOO_LARGE');
  });

  it('rejects files with invalid JSON syntax', async () => {
    const file = {
      size: 100,
      text: () => Promise.resolve('{ not valid json'),
    } as unknown as File;

    await expect(readAndValidateBackupFile(file)).rejects.toThrow('INVALID_JSON');
  });

  it('rejects backups with validation errors', async () => {
    const file = {
      size: 100,
      text: () => Promise.resolve(JSON.stringify({ format: 'wrong-format' })),
    } as unknown as File;

    await expect(readAndValidateBackupFile(file)).rejects.toThrow('VALIDATION_FAILED');
  });

  it('parses valid backup and produces accurate summary', async () => {
    const file = {
      size: 500,
      text: () => Promise.resolve(JSON.stringify(validBackup)),
    } as unknown as File;

    const { backup, summary } = await readAndValidateBackupFile(file);
    expect(backup.format).toBe(BACKUP_FORMAT_IDENTIFIER);
    expect(summary.expenseCount).toBe(1);
    expect(summary.categoryCount).toBe(1);
    expect(summary.currency).toBe('EUR');
    expect(summary.monthlyBudget).toBe(500);
  });

  // A receipt whose expense id is not the canonical one for its template and date.
  const mismatchedReceiptBackup: AusgegebenBackup = {
    ...validBackup,
    recurring: {
      templates: [],
      receipts: [{
        id: '550e8400-e29b-41d4-a716-446655440000_2024-01-31',
        templateId: '550e8400-e29b-41d4-a716-446655440000',
        scheduledDate: '2024-01-31',
        expenseId: 'b'.repeat(64),
        createdAt: 1,
      }],
    },
  };

  it('rejects the whole file when a recurring receipt does not match its occurrence', async () => {
    const file = {
      size: 2000,
      text: () => Promise.resolve(JSON.stringify(mismatchedReceiptBackup)),
    } as unknown as File;

    await expect(readAndValidateBackupFile(file)).rejects.toThrow(
      /VALIDATION_FAILED: Invalid recurring section: INVALID_RECURRING_SECTION: recurring receipt 550e8400-e29b-41d4-a716-446655440000_2024-01-31/,
    );
  });

  it('accepts a file whose recurring receipt carries the canonical expense id', async () => {
    const backup = {
      ...mismatchedReceiptBackup,
      recurring: {
        templates: [],
        receipts: [{ ...mismatchedReceiptBackup.recurring!.receipts[0], expenseId: '15634124eab0e61b1e96e3bcc40968a8bfdce35bd2ee44f76fabdc3ab77e78f4' }],
      },
    };
    const file = { size: 2000, text: () => Promise.resolve(JSON.stringify(backup)) } as unknown as File;
    await expect(readAndValidateBackupFile(file)).resolves.toBeDefined();
  });

  it('restoreBackup aborts if user is not signed in', async () => {
    useAuthStore.setState({ user: null });
    await expect(restoreBackup(validBackup, 'user-1')).rejects.toThrow('AUTH_ACCOUNT_CHANGED');
  });

  it('restoreBackup aborts if active UID does not match expectedUid', async () => {
    useAuthStore.setState({
      user: {
        uid: 'user-b',
        email: 'user-b@example.com',
        displayName: null,
        emailVerified: true,
      },
    });

    await expect(restoreBackup(validBackup, 'user-a')).rejects.toThrow('AUTH_ACCOUNT_CHANGED');
  });

  it('restoreBackup aborts if email is unverified', async () => {
    useAuthStore.setState({
      user: {
        uid: 'user-1',
        email: 'unverified@example.com',
        displayName: null,
        emailVerified: false,
      },
    });

    await expect(restoreBackup(validBackup, 'user-1')).rejects.toThrow('EMAIL_NOT_VERIFIED');
  });
});
