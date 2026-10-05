import { CategoryBudgetManager } from '@/components/CategoryBudgets';
import { categoryBudgetRepository } from '@/services/categoryBudgets';
import { useState, type ReactNode, type ComponentType, useRef, useCallback, useEffect } from 'react';
import { PageTitle } from '@/components/ui';
import {
  IconChevronRight,
  IconMoon,
  IconGlobe,
  IconCurrency,
  IconGauge,
  IconLayers,
  IconDownload,
  IconCheck,
  IconSettings,
  IconShield,
  IconUpload,
  IconAlertTriangle,
} from '@/components/Icons';
import type { SVGProps } from 'react';
import { usePreferencesStore } from '@/services/preferencesStore';
import { useAuthStore } from '@/services/authStore';
import { authService } from '@/services/authService';
import { preferencesSync, toSyncedPreferences, PREFS_SYNC_ERROR_NETWORK, PREFS_SYNC_ERROR_PERMISSION } from '@/services/preferencesSync';
import { useTranslation, type Locale, type TranslationKey } from '@/i18n';
import { currencyLabel, formatAmount, formatAmountForInput, parseAmount, SUPPORTED_CURRENCIES } from '@/utils/currency';
import type { ThemeMode } from '@/models/types';
import { themePalettes } from '@/theme/tokens';
import { expenseRepository } from '@/repositories/expenseRepository';
import { exportCsv } from '@/utils/analytics';
import { useToastStore } from '@/services/toastStore';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import { ConfirmDialog } from '@/components/ConfirmDialog';
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
  type RestoreOperationDoc,
  type ReplacePlan,
} from '@/services/backupReplace';
import packageJson from '../../package.json';
import { useCssProps } from '@/utils/cssVars';
import { applyErrorReportingPreference } from '@/services/errorSink';
import { readErrorReportingEnabled, writeErrorReportingEnabled } from '@/services/errorReportPreference';
import { isPersistentStorageEnabled, setPersistentStorageEnabled } from '@/services/firebase';

const ERROR_REPORTING_AVAILABLE = Boolean(import.meta.env.VITE_ERROR_REPORT_URL?.trim());

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;
type IconTint = 'accent' | 'income' | 'expense' | 'neutral';

const THEME_OPTIONS: { key: ThemeMode; labelKey: TranslationKey }[] = [
  { key: 'system', labelKey: 'themeSystem' },
  { key: 'light', labelKey: 'themeLight' },
  { key: 'dark', labelKey: 'themeDark' },
  { key: 'amoled', labelKey: 'themeAmoled' },
  { key: 'midnight', labelKey: 'themeMidnight' },
  { key: 'ocean', labelKey: 'themeOcean' },
  { key: 'forest', labelKey: 'themeForest' },
  { key: 'sunset', labelKey: 'themeSunset' },
  { key: 'lavender', labelKey: 'themeLavender' },
  { key: 'soft_light', labelKey: 'themeSoftLight' },
];

interface SettingsViewProps {
  onManageCategories: () => void;
}

export function SettingsView({ onManageCategories }: SettingsViewProps) {
  const { t } = useTranslation();
  const currency = usePreferencesStore((s) => s.currency);
  const locale = usePreferencesStore((s) => s.locale);
  const themeMode = usePreferencesStore((s) => s.themeMode);
  const monthlyBudget = usePreferencesStore((s) => s.monthlyBudget);
  const user = useAuthStore((s) => s.user);
  const syncError = useAuthStore((s) => s.syncError);
  const setCurrency = usePreferencesStore((s) => s.setCurrency);
  const setLocale = usePreferencesStore((s) => s.setLocale);
  const setThemeMode = usePreferencesStore((s) => s.setThemeMode);
  const setMonthlyBudget = usePreferencesStore((s) => s.setMonthlyBudget);
  const [showTheme, setShowTheme] = useState(false);
  const [showCurrency, setShowCurrency] = useState(false);
  const [showLanguage, setShowLanguage] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [showDeleteAccountConfirm, setShowDeleteAccountConfirm] = useState(false);
  const [showExportTruncatedConfirm, setShowExportTruncatedConfirm] = useState(false);
  const [pendingExportCsv, setPendingExportCsv] = useState<string | null>(null);
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
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null);
  const [editBudget, setEditBudget] = useState(false);
  const [budgetInput, setBudgetInput] = useState('');
  const [deletionPending, setDeletionPending] = useState(false);
  const [reportErrors, setReportErrors] = useState(() => readErrorReportingEnabled());
  const [persistentStorage, setPersistentStorage] = useState(() => isPersistentStorageEnabled());
  const [persistentAuth, setPersistentAuth] = useState(() => authService.isPersistentAuth());
  const budgetInputRef = useRef<HTMLInputElement>(null);
  const parsedBudget = parseAmount(budgetInput, currency);
  // Upper bound mirrors firestore.rules' validPreferences (< 1e9): without it a
  // fat-fingered value passes the client and fails the write with a generic
  // permission error that names no field.
  const canSaveBudget = parsedBudget != null && parsedBudget > 0 && parsedBudget < 1_000_000_000;
  const budgetInvalid = budgetInput.length > 0 && !canSaveBudget;

  const saveBudget = useCallback(() => {
    if (!canSaveBudget || parsedBudget == null) return;
    setMonthlyBudget(parsedBudget);
    setEditBudget(false);
    useToastStore.getState().show(t('settingsBudgetSet'));
  }, [canSaveBudget, parsedBudget, setMonthlyBudget, t]);

  const clearBudget = useCallback(() => {
    setMonthlyBudget(null);
    setEditBudget(false);
    useToastStore.getState().show(t('settingsBudgetCleared'));
  }, [setMonthlyBudget, t]);

  // Surfaces an account stuck mid-deletion: the cloud wipe went through but the Auth
  // delete did not, so ensureSeeded is refusing to re-seed and the account has no
  // categories. Settings is where the user already is when they hit that toast.
  useEffect(() => {
    if (!user) {
      setDeletionPending(false);
      setUnresolvedOp(null);
      return;
    }
    let active = true;
    void expenseRepository
      .isAccountDeletionPending()
      .then((pending) => {
        if (active) setDeletionPending(pending);
      })
      .catch(() => {
        if (active) setDeletionPending(false);
      });
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

  const downloadCsv = (csv: string, truncated: boolean) => {
    // U+FEFF so Excel on Windows reads the file as UTF-8. Without it Excel assumes the
    // system ANSI code page and mangles every umlaut — "Lebensmittel & Getränke" becomes
    // mojibake — which matters because German is a first-class locale here and CSV export
    // is the app's data-portability promise. Added at the file layer, not in exportCsv(),
    // so the CSV string itself stays pure and its parity tests keep asserting exact bytes.
    const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ausgegeben-export.csv';
    a.click();
    URL.revokeObjectURL(url);
    useToastStore.getState().show(truncated ? t('settingsExportTruncated') : t('settingsExportOk'));
  };

  const exportData = async () => {
    try {
      const { items: expenses, truncated } = await expenseRepository.getAllExpensesCapped(5_000);
      const categories = await expenseRepository.getAllCategories();
      const csv = exportCsv(expenses, categories, t('recordUnknownCategory'));
      if (truncated) {
        setPendingExportCsv(csv);
        setShowExportTruncatedConfirm(true);
        return;
      }
      downloadCsv(csv, false);
    } catch {
      useToastStore.getState().show(t('settingsExportFailed'));
    }
  };

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
      const { items: expenses, truncated } = await expenseRepository.getAllExpensesCapped(5_000);
      const categories = await expenseRepository.getAllCategories();
      const categoryBudgets = await categoryBudgetRepository.getAll(exportUid);
      if (useAuthStore.getState().user?.uid !== exportUid) throw new Error('AUTH_ACCOUNT_CHANGED');
      const backup = createBackup({
        categoryBudgets,
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
      if (truncated) {
        setPendingExportBackup(backup);
        setShowExportBackupTruncatedConfirm(true);
        return;
      }
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
      const { items: currentExpenses } = await expenseRepository.getAllExpensesCapped(5_000);
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
        if (fingerprint !== unresolvedOp.backupFingerprint) {
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

  const displayName = user?.displayName?.trim()
    || user?.email?.split('@')[0]
    || t('settingsCloudAccount');
  const initial = displayName.charAt(0).toUpperCase();
  const syncErrorText = syncError === PREFS_SYNC_ERROR_PERMISSION
    ? t('settingsSyncErrorPermission')
    : syncError === PREFS_SYNC_ERROR_NETWORK
      ? t('settingsSyncErrorNetwork')
      : syncError
        ? t('settingsSyncErrorGeneric')
        : null;

  return (
    <>
      <div className="settings-page">
        <header className="settings-page__header">
          <PageTitle text={t('screenSettings')} icon={IconSettings} />
        </header>

        {syncErrorText ? (
          <div className="settings-sync-error" role="alert">
            <p className="settings-sync-error__text">{syncErrorText}</p>
            <button
              type="button"
              className="settings-sync-error__retry"
              onClick={() => preferencesSync.retry()}
            >
              {t('settingsSyncRetry')}
            </button>
          </div>
        ) : null}

        {user && deletionPending ? (
          <div className="settings-deletion-pending" role="alert">
            <p className="settings-deletion-pending__text">{t('settingsDeletionPending')}</p>
            <div className="settings-deletion-pending__actions">
              <button
                type="button"
                className="settings-deletion-pending__action"
                disabled={deletingAccount}
                onClick={() => setShowDeleteAccountConfirm(true)}
              >
                {t('settingsDeletionFinish')}
              </button>
            </div>
          </div>
        ) : null}

        {user && unresolvedOp ? (
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
        ) : null}

        {user ? (
          <section className="settings-account card card--elevated" aria-label={t('settingsCloudAccount')}>
            <div className="settings-account__avatar" aria-hidden>{initial}</div>
            <div className="settings-account__meta">
              <div className="settings-account__name">{displayName}</div>
              {user.email ? <div className="settings-account__email">{user.email}</div> : null}
              <div className="settings-account__badge">{t('settingsAccountSyncEnabled')}</div>
            </div>
            <div className="settings-account__actions">
              <button
                type="button"
                className="settings-signout-btn"
                onClick={() => setShowSignOutConfirm(true)}
              >
                {t('settingsSignOut')}
              </button>
              <button
                type="button"
                className="settings-signout-btn settings-delete-account-btn"
                disabled={deletingAccount}
                onClick={() => setShowDeleteAccountConfirm(true)}
              >
                {t('settingsDeleteAccount')}
              </button>
            </div>
          </section>
        ) : null}

        <div className="settings-grid">
          <Section title={t('settingsPreferences')}>
            <SettingsRow icon={IconMoon} iconTint="accent" title={t('settingsTheme')} subtitle={t(THEME_OPTIONS.find((opt) => opt.key === themeMode)?.labelKey ?? 'themeSystem')} onClick={() => setShowTheme(true)} />
            <SettingsRow icon={IconGlobe} iconTint="accent" title={t('settingsLanguage')} subtitle={locale === 'de' ? t('langGerman') : t('langEnglish')} onClick={() => setShowLanguage(true)} />
            <SettingsRow icon={IconCurrency} iconTint="income" title={t('settingsCurrency')} subtitle={currencyLabel(currency)} onClick={() => setShowCurrency(true)} />
            {editBudget ? (
              <div className="settings-budget-edit">
                <input
                  ref={budgetInputRef}
                  className="field__input"
                  type="text"
                  inputMode="decimal"
                  placeholder={t('budgetPlaceholder')}
                  aria-label={t('settingsMonthlyLimit')}
                  aria-invalid={budgetInvalid || undefined}
                  aria-describedby={budgetInvalid ? 'budget-hint' : undefined}
                  value={budgetInput}
                  onChange={(e) => {
                    const input = e.target.value;
                    const separators = (input.match(/[.,]/g) ?? []).length;
                    if (input === '' || (/^[\d.,]*$/.test(input) && separators <= 1)) {
                      setBudgetInput(input);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      saveBudget();
                    } else if (e.key === 'Escape') {
                      setEditBudget(false);
                    }
                  }}
                  autoFocus
                />
                {budgetInvalid ? (
                  <p id="budget-hint" className="auth-page__field-hint auth-page__field-hint--error" role="status">
                    {t('budgetInvalidHint')}
                  </p>
                ) : null}
                <div className="settings-budget-edit__actions">
                  <button
                    type="button"
                    className="btn btn-secondary flex-1 px-4 py-2.5 rounded-xl border border-surface-border settings-budget-edit__clear"
                    onClick={clearBudget}
                  >
                    {t('actionClear')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary flex-1 px-4 py-2.5 rounded-xl border border-surface-border"
                    onClick={() => setEditBudget(false)}
                  >
                    {t('actionCancel')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary flex-1 px-4 py-2.5 rounded-xl font-bold"
                    disabled={!canSaveBudget}
                    onClick={saveBudget}
                  >
                    {t('actionSave')}
                  </button>
                </div>
              </div>
            ) : (
              <SettingsRow
                icon={IconGauge}
                iconTint="neutral"
                title={t('settingsMonthlyLimit')}
                subtitle={monthlyBudget ? formatAmount(monthlyBudget, currency) : t('settingsMonthlyLimitNotSet')}
                onClick={() => {
                  setBudgetInput(
                    monthlyBudget != null ? formatAmountForInput(monthlyBudget, currency) : '',
                  );
                  setEditBudget(true);
                }}
              />
            )}
          </Section>

          <CategoryBudgetManager />
          <Section title={t('settingsData')}>
            <SettingsRow icon={IconLayers} iconTint="accent" title={t('settingsCategories')} subtitle={t('settingsCategoriesSub')} onClick={onManageCategories} />
            <SettingsRow icon={IconDownload} iconTint="neutral" title={t('settingsExport')} subtitle={t('settingsExportSub')} onClick={() => void exportData()} />
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
            <label className="settings-row settings-row--static settings-row--toggle">
              <span className="settings-row__icon-tile" data-tint="neutral">
                <IconSettings width={18} height={18} strokeWidth={2} />
              </span>
              <div className="settings-row__label">
                <div className="settings-row__title">{t('settingsTrustedDevice')}</div>
                <div className="settings-row__sub">{t('settingsTrustedDeviceSub')}</div>
              </div>
              <input
                type="checkbox"
                className="settings-row__toggle"
                checked={persistentStorage}
                aria-label={t('settingsTrustedDevice')}
                onChange={(event) => {
                  const enabled = event.target.checked;
                  void setPersistentStorageEnabled(enabled)
                    .then(() => {
                      setPersistentStorage(enabled);
                      window.location.reload();
                    })
                    .catch(() => useToastStore.getState().show(t('settingsLocalCleanupFailed')));
                }}
              />
            </label>
            <label className="settings-row settings-row--static settings-row--toggle">
              <span className="settings-row__icon-tile" data-tint="accent">
                <IconShield width={18} height={18} strokeWidth={2} />
              </span>
              <div className="settings-row__label">
                <div className="settings-row__title">{t('settingsPersistentAuth')}</div>
                <div className="settings-row__sub">{t('settingsPersistentAuthSub')}</div>
              </div>
              <input
                type="checkbox"
                className="settings-row__toggle"
                checked={persistentAuth}
                aria-label={t('settingsPersistentAuth')}
                onChange={(event) => {
                  const enabled = event.target.checked;
                  void authService.setPersistentAuth(enabled)
                    .then(() => {
                      setPersistentAuth(enabled);
                    })
                    .catch(() => useToastStore.getState().show(t('settingsLocalCleanupFailed')));
                }}
              />
            </label>
          </Section>

          <Section title={t('settingsAbout')}>
            {ERROR_REPORTING_AVAILABLE ? (
              <label className="settings-row settings-row--static settings-row--toggle">
                <span className="settings-row__icon-tile" data-tint="neutral">
                  <IconSettings width={18} height={18} strokeWidth={2} />
                </span>
                <div className="settings-row__label">
                  <div className="settings-row__title">{t('settingsErrorReporting')}</div>
                  <div className="settings-row__sub">{t('settingsErrorReportingSub')}</div>
                </div>
                <input
                  type="checkbox"
                  className="settings-row__toggle"
                  checked={reportErrors}
                  aria-label={t('settingsErrorReporting')}
                  onChange={(event) => {
                    const enabled = event.target.checked;
                    writeErrorReportingEnabled(enabled);
                    applyErrorReportingPreference(enabled);
                    setReportErrors(enabled);
                  }}
                />
              </label>
            ) : null}
            <SettingsRow
              icon={IconSettings}
              iconTint="neutral"
              title={t('settingsVersion')}
              subtitle={t('settingsVersionSubtitle', { version: packageJson.version })}
            />
            <p className="settings-about-note">{t('settingsRemindersPhoneOnly')}</p>
          </Section>
        </div>
      </div>

      <ConfirmDialog
        open={showSignOutConfirm}
        title={t('settingsSignOut')}
        message={t('settingsSignOutConfirm')}
        confirmLabel={t('settingsSignOut')}
        cancelLabel={t('actionCancel')}
        onConfirm={() => {
          setShowSignOutConfirm(false);
          void authService.signOut().catch(() => {
            useToastStore.getState().show(t('settingsLocalCleanupFailed'));
          });
        }}
        onCancel={() => setShowSignOutConfirm(false)}
      />

      <ConfirmDialog
        open={showExportTruncatedConfirm}
        title={t('settingsExport')}
        message={t('settingsExportTruncatedConfirm')}
        confirmLabel={t('settingsExportTruncatedContinue')}
        cancelLabel={t('actionCancel')}
        destructive={false}
        onConfirm={() => {
          const csv = pendingExportCsv;
          setShowExportTruncatedConfirm(false);
          setPendingExportCsv(null);
          if (csv) downloadCsv(csv, true);
        }}
        onCancel={() => {
          setShowExportTruncatedConfirm(false);
          setPendingExportCsv(null);
        }}
      />

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

      <ConfirmDialog
        open={showDeleteAccountConfirm}
        title={t('settingsDeleteAccount')}
        // Stays open on a wrong password so the user can retry without losing context.
        confirmDisabled={deletingAccount || deletePassword.length === 0}
        message={
          <>
            <p className="confirm-dialog__message">{t('settingsDeleteAccountConfirm')}</p>
            <label className="field">
              <span className="field__label">{t('settingsDeleteAccountPassword')}</span>
              <input
                className="field__input"
                type="password"
                autoComplete="current-password"
                value={deletePassword}
                disabled={deletingAccount}
                onChange={(e) => {
                  setDeletePassword(e.target.value);
                  setDeleteAccountError(null);
                }}
              />
            </label>
            {deleteAccountError ? (
              <p className="confirm-dialog__error" role="alert">{deleteAccountError}</p>
            ) : null}
          </>
        }
        confirmLabel={t('settingsDeleteAccount')}
        cancelLabel={t('actionCancel')}
        onConfirm={() => {
          setDeletingAccount(true);
          setDeleteAccountError(null);
          void authService.deleteAccount(deletePassword)
            .then(() => {
              setShowDeleteAccountConfirm(false);
              setDeletePassword('');
              useToastStore.getState().show(t('settingsDeleteAccountOk'));
            })
            .catch((err: unknown) => {
              const code = err instanceof Error ? err.message : '';
              if (code === 'wrong_password') {
                setDeleteAccountError(t('authErrorInvalid'));
                return;
              }
              setShowDeleteAccountConfirm(false);
              setDeletePassword('');
              useToastStore.getState().show(
                code === 'too_many_requests'
                  ? t('settingsDeleteAccountTooManyAttempts')
                  : code === 'local_cleanup_failed'
                    ? t('settingsLocalCleanupFailed')
                  : code === 'deletion_incomplete'
                    ? t('settingsDeleteAccountIncomplete')
                    : t('settingsDeleteAccountFailed'),
              );
            })
            .finally(() => setDeletingAccount(false));
        }}
        onCancel={() => {
          setShowDeleteAccountConfirm(false);
          setDeletePassword('');
          setDeleteAccountError(null);
        }}
      />

      {showLanguage ? (
        <Modal title={t('settingsLanguage')} onClose={() => setShowLanguage(false)}>
          <div role="radiogroup" aria-label={t('settingsLanguage')}>
            {(['en', 'de'] as Locale[]).map((code) => (
              <PickerOptionRow
                key={code}
                icon={IconGlobe}
                tint="accent"
                label={code === 'de' ? t('langGerman') : t('langEnglish')}
                selected={locale === code}
                onClick={() => { setLocale(code); setShowLanguage(false); }}
              />
            ))}
          </div>
        </Modal>
      ) : null}

      {showTheme ? (
        <Modal title={t('settingsChooseTheme')} onClose={() => setShowTheme(false)}>
          <div className="theme-picker" role="radiogroup" aria-label={t('settingsChooseTheme')}>
            {THEME_OPTIONS.map((opt) => {
              const selected = themeMode === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={`theme-picker__option${selected ? ' theme-picker__option--selected' : ''}`}
                  onClick={() => {
                    setThemeMode(opt.key);
                    requestAnimationFrame(() => setShowTheme(false));
                  }}
                >
                  <ThemeSwatch mode={opt.key} />
                  <span className="theme-picker__meta">
                    <span className="theme-picker__label">{t(opt.labelKey)}</span>
                    {selected ? (
                      <IconCheck className="theme-picker__check" width={16} height={16} strokeWidth={2.5} aria-hidden />
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
        </Modal>
      ) : null}

      {showCurrency ? (
        <Modal title={t('settingsChooseCurrency')} onClose={() => setShowCurrency(false)}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2" role="radiogroup" aria-label={t('settingsChooseCurrency')}>
            {SUPPORTED_CURRENCIES.map((c) => (
              <PickerOptionRow
                key={c}
                icon={IconCurrency}
                tint="income"
                label={currencyLabel(c)}
                selected={currency === c}
                onClick={() => { setCurrency(c); setShowCurrency(false); }}
              />
            ))}
          </div>
        </Modal>
      ) : null}
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="settings-section">
      <h2 className="settings-section__title">{title}</h2>
      <div className="settings-group">{children}</div>
    </section>
  );
}

function SettingsRow({
  icon: Icon,
  iconTint = 'accent',
  title,
  subtitle,
  subtitleError,
  onClick,
}: {
  icon: IconComponent;
  iconTint?: IconTint;
  title: string;
  subtitle: string;
  subtitleError?: boolean;
  onClick?: () => void;
}) {
  const content = (
    <>
      <span className="settings-row__icon-tile" data-tint={iconTint}>
        <Icon width={18} height={18} strokeWidth={2} />
      </span>
      <div className="settings-row__label">
        <div className="settings-row__title">{title}</div>
        <div className={`settings-row__sub ${subtitleError ? 'settings-row__sub--error' : ''}`}>{subtitle}</div>
      </div>
      {onClick ? (
        <span className="settings-row__chevron" aria-hidden>
          <IconChevronRight width={20} height={20} strokeWidth={2.5} />
        </span>
      ) : null}
    </>
  );

  if (!onClick) {
    return <div className="settings-row settings-row--static">{content}</div>;
  }

  return (
    <button type="button" className="settings-row settings-row--interactive" onClick={onClick}>
      {content}
    </button>
  );
}

const PICKER_TINT_CLASSES: Record<IconTint, { bg: string; text: string }> = {
  accent: { bg: 'bg-accent/10', text: 'text-accent' },
  income: { bg: 'bg-income/10', text: 'text-income' },
  expense: { bg: 'bg-expense/10', text: 'text-expense' },
  neutral: { bg: 'bg-on-surface/10', text: 'text-on-surface-variant' },
};

function PickerOptionRow({
  icon: Icon,
  tint = 'accent',
  label,
  selected,
  onClick,
}: {
  icon: IconComponent;
  tint?: IconTint;
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  const { bg, text } = PICKER_TINT_CLASSES[tint];
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      className={`settings-row w-full flex items-center gap-4 p-4 rounded-xl transition-colors hover:bg-on-surface/5 ${selected ? bg : ''}`}
      onClick={onClick}
    >
      <span className="settings-row__icon-tile" data-tint={tint}>
        <Icon width={20} height={20} />
      </span>
      <span className="flex-1 text-left font-medium">{label}</span>
      {selected ? (
        <span className={text} aria-hidden>
          <IconCheck width={20} height={20} />
        </span>
      ) : null}
    </button>
  );
}

function ThemeSwatch({ mode }: { mode: ThemeMode }) {
  const colors =
    mode === 'system'
      ? [themePalettes.light.background, themePalettes.dark.background, themePalettes.dark.income]
      : (() => {
          const palette = themePalettes[mode] ?? themePalettes.dark;
          return [palette.background, palette.income, palette.expense];
        })();

  return (
    <span className="theme-swatch" aria-hidden>
      {colors.map((color, i) => (
        <SwatchBand key={i} color={color} />
      ))}
    </span>
  );
}

function SwatchBand({ color }: { color: string }) {
  const ref = useCssProps<HTMLSpanElement>({ '--swatch-color': color });
  return <span ref={ref} className="theme-swatch__band" />;
}

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const { t } = useTranslation();
  const sheetRef = useRef<HTMLDivElement>(null);
  const handleEscape = useCallback(() => onClose(), [onClose]);
  useFocusTrap(true, sheetRef, handleEscape);
  useBodyScrollLock(true);
  return (
    <div className="overlay overlay--settings" onClick={onClose} role="presentation">
      <div ref={sheetRef} className="sheet sheet--settings" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="settings-modal-title" tabIndex={-1}>
        <div className="sheet--settings__header">
          <h2 id="settings-modal-title" className="sheet--settings__title">{title}</h2>
          <button type="button" className="sheet--settings__close" onClick={onClose}>{t('actionClose')}</button>
        </div>
        <div className="sheet--settings__body">{children}</div>
      </div>
    </div>
  );
}
