import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '@/i18n';
import { usePreferencesStore } from '@/services/preferencesStore';
import { useAuthStore } from '@/services/authStore';
import { useToastStore } from '@/services/toastStore';
import { toSyncedPreferences } from '@/services/preferencesSync';
import { expenseRepository } from '@/repositories/expenseRepository';
import { categoryBudgetRepository } from '@/services/categoryBudgets';
import { recurringRepository } from '@/services/recurringRepository';
import { createBackup, type AusgegebenBackup, type BackupSummary } from '@/services/backupFormat';
import { readAndValidateBackupFile, restoreBackup } from '@/services/backupRestore';
import {
  executeReplace,
  getRestoreOperation,
  resumeReplace,
  rollbackReplace,
  dismissCompletedOperation,
  planReplace,
  computeBackupFingerprint,
  computeLegacyBackupFingerprint,
  type RestoreOperationDoc,
  type ReplacePlan,
} from '@/services/backupReplace';
import { formatAmount } from '@/utils/currency';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { SettingsRow } from '@/components/SettingsRow';
import { IconAlertTriangle, IconShield, IconUpload } from '@/components/Icons';
import packageJson from '../../package.json';

/**
 * Backup export, restore (merge) and Replace on the Settings screen: the state, the
 * handlers, and the three pieces of UI that SettingsView places at different spots on
 * the page (the unfinished-Replace banner, the data-section rows and the dialogs).
 * Moved out of SettingsView.tsx unchanged apart from this wiring.
 */
export function useSettingsBackup() {
  const { t } = useTranslation();
  const currency = usePreferencesStore((s) => s.currency);
  const locale = usePreferencesStore((s) => s.locale);
  const themeMode = usePreferencesStore((s) => s.themeMode);
  const monthlyBudget = usePreferencesStore((s) => s.monthlyBudget);
  const user = useAuthStore((s) => s.user);
  const [showExportBackupTruncatedConfirm, setShowExportBackupTruncatedConfirm] = useState(false);
  const [pendingExportBackup, setPendingExportBackup] = useState<AusgegebenBackup | null>(null);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [pendingRestore, setPendingRestore] = useState<{
    backup: AusgegebenBackup;
    summary: BackupSummary;
    fileUid: string;
  } | null>(null);
  const [restoringBackup, setRestoringBackup] = useState(false);
  const restoreFileInputRef = useRef<HTMLInputElement>(null);
  const [showReplaceConfirm, setShowReplaceConfirm] = useState(false);
  const [pendingReplace, setPendingReplace] = useState<{
    backup: AusgegebenBackup;
    plan: ReplacePlan;
    fileUid: string;
  } | null>(null);
  const [replacingBackup, setReplacingBackup] = useState(false);
  const [unresolvedOp, setUnresolvedOp] = useState<RestoreOperationDoc | null>(null);
  const replaceFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) {
      setUnresolvedOp(null);
      return;
    }
    let active = true;
    void getRestoreOperation(user.uid)
      .then((op) => {
        if (active) setUnresolvedOp(op);
      })
      .catch(() => {
        if (active) setUnresolvedOp(null);
      });
    return () => {
      active = false;
    };
  }, [user]);

  const downloadBackup = (backup: AusgegebenBackup, truncated: boolean) => {
    const json = JSON.stringify(backup, null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ausgegeben-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    useToastStore.getState().show(truncated ? t('settingsExportBackupTruncated') : t('settingsExportBackupOk'));
  };

  const exportBackup = async () => {
    const exportUid = useAuthStore.getState().user?.uid;
    if (!exportUid) return;
    try {
      const expenses = await expenseRepository.getAllExpensesForBackup();
      const categories = await expenseRepository.getAllCategories();
      const categoryBudgets = await categoryBudgetRepository.getAll(exportUid);
      const recurringTemplates = await recurringRepository.getAll(exportUid);
      const recurringReceipts = await recurringRepository.getAllReceipts(exportUid);
      if (useAuthStore.getState().user?.uid !== exportUid) throw new Error('AUTH_ACCOUNT_CHANGED');
      const backup = createBackup({
        categoryBudgets,
        recurring: {
          templates: recurringTemplates,
          receipts: recurringReceipts,
        },
        preferences: {
          currency,
          monthlyBudget,
          locale,
          themeMode,
          preferencesUpdatedAt: usePreferencesStore.getState().preferencesUpdatedAt,
        },
        categories,
        expenses,
        appVersion: packageJson.version,
      });
      downloadBackup(backup, false);
    } catch {
      useToastStore.getState().show(t('settingsExportFailed'));
    }
  };

  const handleRestoreFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const currentUser = useAuthStore.getState().user;
    if (!currentUser) return;
    try {
      const { backup, summary } = await readAndValidateBackupFile(file);
      setPendingRestore({ backup, summary, fileUid: currentUser.uid });
      setShowRestoreConfirm(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'BACKUP_FILE_TOO_LARGE') {
        useToastStore.getState().show(t('settingsRestoreFileTooLarge'));
      } else if (msg.startsWith('VALIDATION_FAILED')) {
        useToastStore.getState().show(
          t('settingsRestoreInvalid', { error: msg.replace('VALIDATION_FAILED: ', '') }),
        );
      } else {
        useToastStore.getState().show(t('settingsRestoreInvalid', { error: msg || 'malformed' }));
      }
    }
  };

  const executeRestore = async () => {
    if (!pendingRestore) return;
    setRestoringBackup(true);
    try {
      const res = await restoreBackup(pendingRestore.backup, pendingRestore.fileUid);
      setShowRestoreConfirm(false);
      setPendingRestore(null);
      useToastStore.getState().show(
        t('settingsRestoreSuccess', {
          expenses: String(res.expensesRestored),
          categories: String(res.categoriesRestored),
        }),
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'AUTH_ACCOUNT_CHANGED') {
        useToastStore.getState().show(t('settingsRestoreAuthChanged'));
      } else if (msg.startsWith('CATEGORY_TYPE_CONFLICT')) {
        useToastStore.getState().show(t('settingsRestoreConflict'));
      } else if (msg.startsWith('CATEGORY_BUSY')) {
        useToastStore.getState().show(t('settingsRestoreCategoryBusy'));
      } else {
        useToastStore.getState().show(t('settingsRestoreFailed'));
      }
      setShowRestoreConfirm(false);
      setPendingRestore(null);
    } finally {
      setRestoringBackup(false);
    }
  };

  const handleReplaceFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const currentUser = useAuthStore.getState().user;
    if (!currentUser) return;
    try {
      const { backup } = await readAndValidateBackupFile(file);
      const currentExpenses = await expenseRepository.getAllExpensesForBackup();
      const currentCategories = await expenseRepository.getAllCategories();
      const plan = planReplace({
        backup,
        currentExpenses,
        currentCategories,
        currentPreferences: toSyncedPreferences(usePreferencesStore.getState()),
      });
      if (plan.conflicts.length > 0) {
        useToastStore.getState().show(t('settingsRestoreConflict'));
        return;
      }
      if (unresolvedOp && unresolvedOp.phase !== 'COMPLETED' && unresolvedOp.phase !== 'ROLLED_BACK') {
        const fingerprint = await computeBackupFingerprint(backup);
        const legacyFingerprint = await computeLegacyBackupFingerprint(backup);
        if (fingerprint !== unresolvedOp.backupFingerprint && legacyFingerprint !== unresolvedOp.backupFingerprint) {
          useToastStore.getState().show(t('settingsReplaceFailed', { error: 'FINGERPRINT_MISMATCH' }));
          return;
        }
      }
      setPendingReplace({ backup, plan, fileUid: currentUser.uid });
      setShowReplaceConfirm(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'BACKUP_FILE_TOO_LARGE') {
        useToastStore.getState().show(t('settingsRestoreFileTooLarge'));
      } else if (msg.startsWith('VALIDATION_FAILED')) {
        useToastStore.getState().show(
          t('settingsRestoreInvalid', { error: msg.replace('VALIDATION_FAILED: ', '') }),
        );
      } else {
        useToastStore.getState().show(t('settingsRestoreInvalid', { error: msg || 'malformed' }));
      }
    }
  };

  const executeReplaceAction = async () => {
    if (!pendingReplace) return;
    setReplacingBackup(true);
    try {
      const isResume = Boolean(unresolvedOp && unresolvedOp.phase !== 'COMPLETED' && unresolvedOp.phase !== 'ROLLED_BACK');
      if (isResume && unresolvedOp) {
        await resumeReplace(unresolvedOp, pendingReplace.backup, pendingReplace.fileUid);
      } else {
        await executeReplace(pendingReplace.backup, pendingReplace.fileUid);
      }
      const op = await getRestoreOperation(pendingReplace.fileUid);
      setUnresolvedOp(op);
      setShowReplaceConfirm(false);
      setPendingReplace(null);
      useToastStore.getState().show(t('settingsReplaceSuccess'));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'failed';
      useToastStore.getState().show(t('settingsReplaceFailed', { error: msg }));
      setShowReplaceConfirm(false);
      setPendingReplace(null);
      if (user) {
        void getRestoreOperation(user.uid).then(setUnresolvedOp);
      }
    } finally {
      setReplacingBackup(false);
    }
  };

  const handleResumeReplace = () => {
    if (!unresolvedOp || !user) return;
    if (unresolvedOp.initiatorPlatform && unresolvedOp.initiatorPlatform !== 'web') {
      useToastStore.getState().show(t('settingsReplaceForeignPlatform', { platform: unresolvedOp.initiatorPlatform }));
      return;
    }
    replaceFileInputRef.current?.click();
  };

  const handleRollbackReplace = async () => {
    if (!unresolvedOp || !user) return;
    if (unresolvedOp.initiatorPlatform && unresolvedOp.initiatorPlatform !== 'web') {
      useToastStore.getState().show(t('settingsReplaceForeignPlatform', { platform: unresolvedOp.initiatorPlatform }));
      return;
    }
    setReplacingBackup(true);
    try {
      await rollbackReplace(unresolvedOp, user.uid);
      const op = await getRestoreOperation(user.uid);
      setUnresolvedOp(op);
      useToastStore.getState().show(t('settingsReplaceRollbackSuccess'));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'failed';
      useToastStore.getState().show(t('settingsReplaceRollbackFailed', { error: msg }));
      void getRestoreOperation(user.uid).then(setUnresolvedOp);
    } finally {
      setReplacingBackup(false);
    }
  };

  const handleDismissOperation = async () => {
    if (!user) return;
    try {
      await dismissCompletedOperation(user.uid);
      setUnresolvedOp(null);
    } catch {
      // ignore
    }
  };

  return {
    user,
    unresolvedOp,
    replacingBackup,
    handleDismissOperation,
    handleResumeReplace,
    handleRollbackReplace,
    exportBackup,
    restoreFileInputRef,
    handleRestoreFileSelected,
    replaceFileInputRef,
    handleReplaceFileSelected,
    showExportBackupTruncatedConfirm,
    setShowExportBackupTruncatedConfirm,
    pendingExportBackup,
    setPendingExportBackup,
    downloadBackup,
    showRestoreConfirm,
    setShowRestoreConfirm,
    pendingRestore,
    setPendingRestore,
    restoringBackup,
    executeRestore,
    showReplaceConfirm,
    setShowReplaceConfirm,
    pendingReplace,
    setPendingReplace,
    executeReplaceAction,
  };
}

type SettingsBackupState = ReturnType<typeof useSettingsBackup>;

/** Shown at the top of Settings while a Replace is unfinished or awaiting dismissal. */
export function ReplaceUnresolvedBanner({ backup }: { backup: SettingsBackupState }) {
  const { t } = useTranslation();
  const { user, unresolvedOp, replacingBackup, handleDismissOperation, handleResumeReplace, handleRollbackReplace } = backup;
  return (
    user && unresolvedOp ? (
      <div className="settings-replace-unresolved" role="alert">
        <p className="settings-replace-unresolved__text">
          {unresolvedOp.phase === 'COMPLETED'
            ? t('settingsReplaceSuccess')
            : unresolvedOp.phase === 'ROLLED_BACK'
              ? t('settingsReplaceRollbackSuccess')
              : unresolvedOp.initiatorPlatform && unresolvedOp.initiatorPlatform !== 'web'
                ? t('settingsReplaceForeignPlatform', { platform: unresolvedOp.initiatorPlatform })
                : `${t('settingsReplaceUnresolvedBanner')} (${unresolvedOp.phase})`}
        </p>
        <div className="settings-replace-unresolved__actions">
          {unresolvedOp.phase === 'COMPLETED' || unresolvedOp.phase === 'ROLLED_BACK' ? (
            <button
              type="button"
              className="settings-replace-unresolved__action"
              disabled={replacingBackup}
              onClick={() => void handleDismissOperation()}
            >
              {t('settingsReplaceDismiss')}
            </button>
          ) : (!unresolvedOp.initiatorPlatform || unresolvedOp.initiatorPlatform === 'web') ? (
            <>
              {unresolvedOp.phase !== 'ROLLING_BACK' && (
                <button
                  type="button"
                  className="settings-replace-unresolved__action settings-replace-unresolved__action--primary"
                  disabled={replacingBackup}
                  onClick={() => handleResumeReplace()}
                >
                  {t('settingsReplaceResume')}
                </button>
              )}
              {unresolvedOp.snapshotMeta ? (
                <button
                  type="button"
                  className="settings-replace-unresolved__action settings-replace-unresolved__action--destructive"
                  disabled={replacingBackup}
                  onClick={() => void handleRollbackReplace()}
                >
                  {t('settingsReplaceRollback')}
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    ) : null
  );
}

/** The export-backup, restore and Replace rows (with their hidden file inputs) in the data section. */
export function SettingsBackupRows({ backup }: { backup: SettingsBackupState }) {
  const { t } = useTranslation();
  const { exportBackup, unresolvedOp, restoreFileInputRef, handleRestoreFileSelected, replaceFileInputRef, handleReplaceFileSelected } = backup;
  return (
    <>
      <SettingsRow icon={IconShield} iconTint="accent" title={t('settingsExportBackup')} subtitle={t('settingsExportBackupSub')} onClick={() => void exportBackup()} />
      <SettingsRow
        icon={IconUpload}
        iconTint="neutral"
        title={t('settingsRestoreBackup')}
        subtitle={t('settingsRestoreBackupSub')}
        onClick={() => {
          if (unresolvedOp && unresolvedOp.phase !== 'COMPLETED' && unresolvedOp.phase !== 'ROLLED_BACK') {
            useToastStore.getState().show(t('settingsReplaceUnresolvedBanner'));
            return;
          }
          restoreFileInputRef.current?.click();
        }}
      />
      <input
        ref={restoreFileInputRef}
        type="file"
        accept=".json,application/json"
        style={{ display: 'none' }}
        onChange={(e) => void handleRestoreFileSelected(e)}
      />
      <SettingsRow
        icon={IconAlertTriangle}
        iconTint="expense"
        title={t('settingsReplaceBackup')}
        subtitle={t('settingsReplaceBackupSub')}
        onClick={() => {
          if (unresolvedOp && unresolvedOp.phase !== 'COMPLETED' && unresolvedOp.phase !== 'ROLLED_BACK') {
            useToastStore.getState().show(t('settingsReplaceUnresolvedBanner'));
            return;
          }
          replaceFileInputRef.current?.click();
        }}
      />
      <input
        ref={replaceFileInputRef}
        type="file"
        accept=".json,application/json"
        style={{ display: 'none' }}
        onChange={(e) => void handleReplaceFileSelected(e)}
      />
    </>
  );
}

/** The export-backup-truncated, restore and Replace confirmation dialogs. */
export function SettingsBackupDialogs({ backup }: { backup: SettingsBackupState }) {
  const { t } = useTranslation();
  const { showExportBackupTruncatedConfirm, setShowExportBackupTruncatedConfirm, pendingExportBackup, setPendingExportBackup, downloadBackup, showRestoreConfirm, setShowRestoreConfirm, pendingRestore, setPendingRestore, restoringBackup, executeRestore, showReplaceConfirm, setShowReplaceConfirm, pendingReplace, setPendingReplace, replacingBackup, executeReplaceAction } = backup;
  return (
    <>
      <ConfirmDialog
        open={showExportBackupTruncatedConfirm}
        title={t('settingsExportBackup')}
        message={t('settingsExportBackupTruncatedConfirm')}
        confirmLabel={t('settingsExportTruncatedContinue')}
        cancelLabel={t('actionCancel')}
        destructive={false}
        onConfirm={() => {
          const backup = pendingExportBackup;
          setShowExportBackupTruncatedConfirm(false);
          setPendingExportBackup(null);
          if (backup) downloadBackup(backup, true);
        }}
        onCancel={() => {
          setShowExportBackupTruncatedConfirm(false);
          setPendingExportBackup(null);
        }}
      />

      <ConfirmDialog
        open={showRestoreConfirm}
        title={t('settingsRestoreBackup')}
        confirmDisabled={restoringBackup}
        message={
          pendingRestore ? (
            <div className="flex flex-col gap-2">
              <p className="confirm-dialog__message">
                {t('settingsRestoreBackupSummary', {
                  expenses: String(pendingRestore.summary.expenseCount),
                  categories: String(pendingRestore.summary.categoryCount),
                  currency: pendingRestore.summary.currency,
                })}
              </p>
              {pendingRestore.backup.schemaVersion === 1 && <p>{t('categoryBudgetV1')}</p>}
              {pendingRestore.summary.monthlyBudget ? (
                <p className="confirm-dialog__message">
                  {t('settingsRestoreBackupBudget', {
                    budget: formatAmount(pendingRestore.summary.monthlyBudget, pendingRestore.summary.currency),
                  })}
                </p>
              ) : null}
              <p className="confirm-dialog__message font-medium">
                {t('settingsRestoreBackupExplain')}
              </p>
            </div>
          ) : null
        }
        confirmLabel={t('settingsRestoreBackup')}
        cancelLabel={t('actionCancel')}
        onConfirm={() => void executeRestore()}
        onCancel={() => {
          if (!restoringBackup) {
            setShowRestoreConfirm(false);
            setPendingRestore(null);
          }
        }}
      />

      <ConfirmDialog
        open={showReplaceConfirm}
        title={t('settingsReplaceBackupTitle')}
        confirmDisabled={replacingBackup}
        destructive={true}
        message={
          pendingReplace ? (
            <div className="flex flex-col gap-2">
              <p className="confirm-dialog__message">
                {t('settingsReplaceBackupExplain')}
              </p>
              <div className="confirm-dialog__message confirm-dialog__preflight">
                {t('settingsReplaceBackupPreflight', {
                  backupExpenses: String(pendingReplace.plan.counts.backupExpenseCount),
                  backupCategories: String(pendingReplace.plan.counts.backupCategoryCount),
                  toDelete: String(pendingReplace.plan.counts.expensesToDeleteCount),
                  toUpsertCategories: String(pendingReplace.plan.counts.categoriesToUpsertCount),
                  keptCategories: String(pendingReplace.plan.counts.categoriesPreservedCount),
                })}
              </div>
            </div>
          ) : null
        }
        confirmLabel={t('settingsReplaceBackupTitle')}
        cancelLabel={t('actionCancel')}
        onConfirm={() => void executeReplaceAction()}
        onCancel={() => {
          if (!replacingBackup) {
            setShowReplaceConfirm(false);
            setPendingReplace(null);
          }
        }}
      />
    </>
  );
}
