import { useState, type ReactNode, type ComponentType } from 'react';
import { ScreenTitle, SignatureText } from '@/components/ui';
import {
  IconChevronRight,
  IconMoon,
  IconGlobe,
  IconCurrency,
  IconSync,
  IconGauge,
  IconLayers,
  IconDownload,
  IconCloud,
  IconCloudOff,
  IconCheck,
  IconBell,
  IconClock,
  IconDownload as IconInstall,
} from '@/components/Icons';
import type { SVGProps } from 'react';
import { usePreferencesStore } from '@/services/preferencesStore';
import { useAuthStore } from '@/services/authStore';
import { authService } from '@/services/authService';
import { formatRelativeTimestamp } from '@/utils/periodUtils';
import { syncService } from '@/services/syncService';
import { reminderService } from '@/services/reminderService';
import { useTranslation } from '@/i18n';
import { currencyLabel, formatAmount, formatAmountForInput, parseAmount, SUPPORTED_CURRENCIES } from '@/utils/currency';
import { expenseRepository } from '@/repositories/expenseRepository';
import { exportCsv } from '@/utils/analytics';
import { refreshCategoryCache } from '@/services/categoryCache';
import { useToastStore } from '@/services/toastStore';
import { hapticLight, hapticSuccess } from '@/utils/haptics';
import { THEME_MODES, themeLabel, themePreviewColors } from '@/utils/themeLabels';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { IosInstallSheet } from '@/components/IosInstallSheet';
import { SettingsBottomSheet } from '@/components/SettingsBottomSheet';
import { canShowIosInstallHint, isStandalonePwa } from '@/utils/pwaUtils';
import packageJson from '../../package.json';
import type { ThemeMode } from '@/models/types';

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;
type IconTint = 'accent' | 'income' | 'expense' | 'neutral';

interface SettingsViewProps {
  onManageCategories: () => void;
  onRequestSignIn?: () => void;
}

export function SettingsView({ onManageCategories, onRequestSignIn }: SettingsViewProps) {
  const { t } = useTranslation();
  const currency = usePreferencesStore((s) => s.currency);
  const locale = usePreferencesStore((s) => s.locale);
  const themeMode = usePreferencesStore((s) => s.themeMode);
  const monthlyBudget = usePreferencesStore((s) => s.monthlyBudget);
  const dailyReminder = usePreferencesStore((s) => s.dailyReminder);
  const reminderHour = usePreferencesStore((s) => s.reminderHour);
  const reminderMinute = usePreferencesStore((s) => s.reminderMinute);
  const lastCloudSyncAt = usePreferencesStore((s) => s.lastCloudSyncAt);
  const deferredInstallPrompt = usePreferencesStore((s) => s.deferredInstallPrompt);
  const user = useAuthStore((s) => s.user);
  const syncing = useAuthStore((s) => s.syncing);
  const syncError = useAuthStore((s) => s.syncError);
  const setCurrency = usePreferencesStore((s) => s.setCurrency);
  const setLocale = usePreferencesStore((s) => s.setLocale);
  const setThemeMode = usePreferencesStore((s) => s.setThemeMode);
  const setMonthlyBudget = usePreferencesStore((s) => s.setMonthlyBudget);
  const setDailyReminder = usePreferencesStore((s) => s.setDailyReminder);
  const setReminderTime = usePreferencesStore((s) => s.setReminderTime);
  const showToast = useToastStore((s) => s.show);
  const [showTheme, setShowTheme] = useState(false);
  const [showCurrency, setShowCurrency] = useState(false);
  const [showLanguage, setShowLanguage] = useState(false);
  const [showReminderTime, setShowReminderTime] = useState(false);
  const [draftReminderTime, setDraftReminderTime] = useState('19:00');
  const [showBudget, setShowBudget] = useState(false);
  const [budgetInput, setBudgetInput] = useState('');
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [showIosInstall, setShowIosInstall] = useState(false);
  const showIosInstallCard = canShowIosInstallHint() && !deferredInstallPrompt;

  const reminderTimeLabel = `${String(reminderHour).padStart(2, '0')}:${String(reminderMinute).padStart(2, '0')}`;

  const handleInstallClick = async () => {
    if (!deferredInstallPrompt) return;
    hapticLight();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    await (deferredInstallPrompt as any).prompt();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const { outcome } = await (deferredInstallPrompt as any).userChoice as { outcome: string };
    if (outcome === 'accepted') {
      usePreferencesStore.getState().setDeferredInstallPrompt(null);
    }
  };

  const exportData = async () => {
    try {
      const expenses = await expenseRepository.getAllExpenses();
      const categories = await refreshCategoryCache();
      const csv = exportCsv(expenses, categories);
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const stamp = new Date().toISOString().slice(0, 10);
      a.download = `ausgegeben-export-${stamp}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      showToast(t('settingsExportOk'));
    } catch {
      showToast(t('settingsExportFailed'));
    }
  };

  const syncLabel = syncing
    ? t('syncInProgress')
    : syncError
      ? t('settingsSyncFailed')
      : lastCloudSyncAt
        ? t('syncLastAt', { time: formatRelativeTimestamp(lastCloudSyncAt, locale) })
        : t('syncNever');

  const runSync = async () => {
    const result = await syncService.fullSync(true);
    if (result.ok) {
      useAuthStore.getState().setSyncError(null);
      hapticSuccess();
      showToast(
        t('syncOk', {
          expenses: String(result.appliedExpenses),
          categories: String(result.appliedCategories),
        }),
      );
    } else if (result.error) {
      showToast(result.error);
    }
  };

  const displayName = user?.displayName?.trim()
    || user?.email?.split('@')[0]
    || t('settingsCloudAccount');
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <div className="page-content settings-view">
      <ScreenTitle title={t('screenSettings')} />

      <p className="settings-version">{t('settingsVersionSubtitle', { version: packageJson.version })}</p>

      <div className="settings-view__stack">
      {user ? (
        <section className="settings-section">
          <div className="section-title">{t('settingsCloudAccount')}</div>
          <div className="account-profile-card card card--elevated insights-glass-island">
            {syncError && !syncing ? (
              <div className="sync-error-banner sync-error-banner--glass" role="alert">
                <span className="sync-error-banner__icon" aria-hidden>
                  <IconCloudOff width={18} height={18} />
                </span>
                <div className="sync-error-banner__copy">
                  <span className="sync-error-banner__title">{t('settingsSyncFailed')}</span>
                  <span className="sync-error-banner__message">{syncError}</span>
                </div>
                <div className="sync-error-banner__actions">
                  <button type="button" className="btn btn-secondary sync-error-banner__retry" onClick={() => void runSync()} disabled={syncing}>
                    {t('recordErrorRetry')}
                  </button>
                  <button
                    type="button"
                    className="sync-error-banner__dismiss"
                    onClick={() => useAuthStore.getState().setSyncError(null)}
                    aria-label={t('actionClose')}
                  >
                    ×
                  </button>
                </div>
              </div>
            ) : null}
            <div className="account-profile-card__header">
              <div className="account-profile-card__avatar" aria-hidden>{initial}</div>
              <div className="account-profile-card__copy">
                <div className="account-profile-card__name">
                  <SignatureText text={displayName} />
                </div>
                {user.email ? <div className="account-profile-card__email">{user.email}</div> : null}
                <div className="account-profile-card__badge">{t('settingsAccountSyncEnabled')}</div>
              </div>
            </div>
            <div className="account-profile-card__meta" role="status" aria-live="polite">{syncLabel}</div>
            <div className="account-profile-card__actions">
              <button
                type="button"
                className="btn btn-secondary account-profile-card__btn"
                onClick={() => void runSync()}
                disabled={syncing}
                aria-busy={syncing || undefined}
              >
                <IconSync width={18} height={18} className={syncing ? 'spin' : undefined} aria-hidden />
                {t('syncNow').toLowerCase()}
              </button>
            </div>
            <p className="account-profile-card__receipt-hint">{t('settingsReceiptLocalHint')}</p>
          </div>
        </section>
      ) : (
        <section className="settings-section">
          <div className="section-title">{t('settingsManagement')}</div>
          <SettingsRow
            icon={IconCloud}
            tint="accent"
            title={t('settingsSignIn')}
            subtitle={t('authSubtitle')}
            onClick={() => onRequestSignIn?.()}
          />
        </section>
      )}

      {(deferredInstallPrompt || showIosInstallCard) && (
        <section className="settings-section">
          <div className="section-title">{t('installApp')}</div>
          <button
            type="button"
            className="card card--elevated insights-glass-island settings-install-card"
            onClick={() => {
              if (deferredInstallPrompt) void handleInstallClick();
              else setShowIosInstall(true);
            }}
          >
            <div className="settings-install-card__icon" aria-hidden>
              <IconInstall width={20} height={20} />
            </div>
            <div className="settings-install-card__copy">
              <div className="settings-install-card__title">{t('installApp')}</div>
              <div className="settings-install-card__sub">{t('installAppSub')}</div>
            </div>
            <IconChevronRight width={16} height={16} className="settings-install-card__chevron" aria-hidden />
          </button>
        </section>
      )}

      <section className="settings-section">
        <div className="section-title">{t('settingsAppearance')}</div>
        <div className="card card--elevated insights-glass-island settings-group settings-group--glass">
          <SettingsRow
            icon={IconLayers}
            tint="accent"
            title={t('settingsCategories')}
            onClick={onManageCategories}
          />
          <div className="settings-divider" />
          <SettingsRow
            icon={IconMoon}
            tint="accent"
            title={t('settingsTheme')}
            subtitle={themeLabel(themeMode, t)}
            onClick={() => setShowTheme(true)}
          />
          <div className="settings-divider" />
          <SettingsRow
            icon={IconGlobe}
            tint="accent"
            title={t('settingsLanguage')}
            subtitle={locale === 'de' ? t('langGerman') : t('langEnglish')}
            onClick={() => setShowLanguage(true)}
          />
          <div className="settings-divider" />
          <SettingsRow
            icon={IconCurrency}
            tint="accent"
            title={t('settingsCurrency')}
            subtitle={currencyLabel(currency)}
            onClick={() => setShowCurrency(true)}
          />
        </div>
      </section>

      <section className="settings-section">
        <div className="section-title">{t('settingsNotifications')}</div>
        <div className="card card--elevated insights-glass-island settings-group settings-group--glass">
          <div className="settings-row settings-row--switch">
            <div className="settings-row__icon-tile" data-tint="accent">
              <IconBell width={20} height={20} />
            </div>
            <div className="settings-row__label">
              <div className="settings-row__title">{t('settingsEveningReminder')}</div>
            </div>
            <button
              type="button"
              className={`ios-switch${dailyReminder ? ' ios-switch--on' : ''}`}
              onClick={() => {
                void (async () => {
                  const next = !dailyReminder;
                  if (next) {
                    const granted = await reminderService.requestPermission();
                    if (!granted) {
                      showToast(t('settingsReminderPermissionDenied'));
                      return;
                    }
                  }
                  setDailyReminder(next);
                })();
              }}
              role="switch"
              aria-checked={dailyReminder}
              aria-label={t('settingsEveningReminder')}
            >
              <span className="ios-switch__thumb" />
            </button>
          </div>
          {dailyReminder && (
            <>
              <div className="settings-divider" />
              <SettingsRow
                icon={IconClock}
                tint="accent"
                title={t('settingsReminderTime')}
                subtitle={reminderTimeLabel}
                onClick={() => {
                  setDraftReminderTime(reminderTimeLabel);
                  setShowReminderTime(true);
                }}
              />
            </>
          )}
        </div>
        {dailyReminder && canShowIosInstallHint() ? (
          <p className="settings-hint">{t('settingsReminderIosHint')}</p>
        ) : dailyReminder && isStandalonePwa() ? (
          <p className="settings-hint">{t('settingsReminderBackgroundHint')}</p>
        ) : null}
      </section>

      <section className="settings-section">
        <div className="section-title">{t('settingsBudget')}</div>
        <div className="card card--elevated insights-glass-island settings-group settings-group--glass">
          <SettingsRow
            icon={IconGauge}
            tint="neutral"
            title={t('settingsMonthlyLimit')}
            subtitle={monthlyBudget ? formatAmount(monthlyBudget, currency) : t('settingsMonthlyLimitNotSet')}
            onClick={() => {
              setBudgetInput(monthlyBudget ? formatAmountForInput(monthlyBudget) : '');
              setShowBudget(true);
            }}
          />
        </div>
      </section>

      <section className="settings-section">
        <div className="section-title">{t('settingsSectionExport')}</div>
        <div className="card card--elevated insights-glass-island settings-group settings-group--glass">
          <SettingsRow
            icon={IconDownload}
            tint="neutral"
            title={t('settingsExport')}
            subtitle={t('settingsExportSub')}
            onClick={() => void exportData()}
          />
        </div>
      </section>

      {user && (
        <div className="settings-footer insights-glass-island">
          <button
            type="button"
            className="btn btn-secondary btn-block settings-sign-out"
            onClick={() => setShowSignOutConfirm(true)}
          >
            {t('settingsSignOut').toLowerCase()}
          </button>
        </div>
      )}

      </div>

      {showTheme && (
        <SettingsBottomSheet
          title={t('settingsChooseTheme')}
          onClose={() => setShowTheme(false)}
          selectionGroup
        >
          {THEME_MODES.map((mode) => (
            <SelectionRow
              key={mode}
              label={themeLabel(mode, t)}
              selected={themeMode === mode}
              onClick={() => {
                setThemeMode(mode);
                setShowTheme(false);
                hapticLight();
              }}
              accessory={<ThemePreview mode={mode} />}
            />
          ))}
        </SettingsBottomSheet>
      )}

      {showLanguage && (
        <SettingsBottomSheet
          title={t('settingsLanguage')}
          onClose={() => setShowLanguage(false)}
          selectionGroup
        >
          <SelectionRow
            label={t('langEnglish')}
            selected={locale === 'en'}
            onClick={() => {
              setLocale('en');
              setShowLanguage(false);
              hapticLight();
            }}
          />
          <SelectionRow
            label={t('langGerman')}
            selected={locale === 'de'}
            onClick={() => {
              setLocale('de');
              setShowLanguage(false);
              hapticLight();
            }}
          />
        </SettingsBottomSheet>
      )}

      {showCurrency && (
        <SettingsBottomSheet
          title={t('settingsChooseCurrency')}
          onClose={() => setShowCurrency(false)}
          selectionGroup
        >
          {SUPPORTED_CURRENCIES.map((code) => (
            <SelectionRow
              key={code}
              label={currencyLabel(code)}
              selected={currency === code}
              onClick={() => {
                setCurrency(code);
                setShowCurrency(false);
                hapticLight();
              }}
              accessory={<span className="currency-code-tag">{code}</span>}
            />
          ))}
        </SettingsBottomSheet>
      )}

      {showReminderTime && (
        <SettingsBottomSheet
          title={t('settingsReminderTime')}
          onClose={() => setShowReminderTime(false)}
        >
          <div className="settings-reminder-time">
            <div className="card card--elevated settings-reminder-time__inner">
              <input
                type="time"
                className="settings-reminder-time__input"
                value={draftReminderTime}
                onChange={(e) => setDraftReminderTime(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="btn btn-primary btn-block settings-sheet-actions"
              onClick={() => {
                const [h, m] = draftReminderTime.split(':').map(Number);
                if (!isNaN(h) && !isNaN(m)) {
                  setReminderTime(h, m);
                  hapticSuccess();
                  showToast(t('settingsReminderSet', { time: draftReminderTime }));
                }
                setShowReminderTime(false);
              }}
            >
              {t('actionSave')}
            </button>
          </div>
        </SettingsBottomSheet>
      )}

      {showBudget && (
        <SettingsBottomSheet
          title={t('settingsBudgetDialogTitle')}
          onClose={() => setShowBudget(false)}
        >
          <div className="settings-budget-field">
            <p className="settings-dialog-body">{t('settingsBudgetDialogBody')}</p>
            <div className="card card--elevated settings-budget-field__inner budget-input-group">
              <span className="budget-input-currency">{currency}</span>
              <input
                type="text"
                inputMode="decimal"
                className="settings-budget-input"
                placeholder={formatAmount(0, currency, false)}
                value={budgetInput}
                onChange={(e) => setBudgetInput(e.target.value)}
              />
            </div>
            <div className="settings-sheet-actions budget-editor-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  const amount = parseAmount(budgetInput);
                  if (amount != null && amount >= 0) {
                    setMonthlyBudget(amount > 0 ? amount : null);
                    hapticSuccess();
                    showToast(amount > 0 ? t('settingsBudgetSet') : t('settingsBudgetCleared'));
                    setShowBudget(false);
                  }
                }}
              >
                {t('actionSave')}
              </button>
              {monthlyBudget && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setMonthlyBudget(null);
                    hapticLight();
                    showToast(t('settingsBudgetCleared'));
                    setShowBudget(false);
                  }}
                >
                  {t('actionClear')}
                </button>
              )}
            </div>
          </div>
        </SettingsBottomSheet>
      )}

      {showIosInstall ? <IosInstallSheet onClose={() => setShowIosInstall(false)} /> : null}

      {showSignOutConfirm && (
        <ConfirmDialog
          title={t('settingsSignOut')}
          cancelLabel={t('actionCancel')}
          confirmLabel={t('settingsSignOut')}
          onCancel={() => setShowSignOutConfirm(false)}
          onConfirm={() => {
            void authService.signOut();
            setShowSignOutConfirm(false);
          }}
        >
          {t('settingsSignOutConfirm')}
        </ConfirmDialog>
      )}
    </div>
  );
}

function SettingsRow({
  icon: Icon,
  tint,
  title,
  subtitle,
  onClick,
}: {
  icon: IconComponent;
  tint: IconTint;
  title: string;
  subtitle?: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className="settings-row settings-row--interactive" onClick={onClick}>
      <div className="settings-row__icon-tile" data-tint={tint}>
        <Icon width={20} height={20} />
      </div>
      <div className="settings-row__label">
        <div className="settings-row__title">{title}</div>
        {subtitle ? <div className="settings-row__sub">{subtitle}</div> : null}
      </div>
      <IconChevronRight width={16} height={16} className="settings-row__chevron" />
    </button>
  );
}

function SelectionRow({
  label,
  selected,
  onClick,
  accessory,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  accessory?: ReactNode;
}) {
  return (
    <button type="button" className="selection-row" onClick={onClick} role="radio" aria-checked={selected}>
      <div className="selection-row__label">{label}</div>
      <div className="selection-row__accessory">
        {accessory}
        {selected ? <IconCheck width={20} height={20} className="selection-row__check" /> : null}
      </div>
    </button>
  );
}

function ThemePreview({ mode }: { mode: ThemeMode }) {
  const colors = themePreviewColors(mode);
  return (
    <div className="theme-preview-dots">
      <span className="theme-preview-dot" style={{ background: colors[0] }} />
      <span className="theme-preview-dot" style={{ background: colors[1] }} />
    </div>
  );
}
