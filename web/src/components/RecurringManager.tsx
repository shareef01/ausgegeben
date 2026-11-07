import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { localeTag, useTranslation } from '@/i18n';
import { useAuthStore } from '@/services/authStore';
import { usePreferencesStore } from '@/services/preferencesStore';
import { useToastStore } from '@/services/toastStore';
import { formatAmount, colorIntToHex } from '@/utils/currency';
import { recurringRepository } from '@/services/recurringRepository';
import { syncRecurring, useRecurringStore } from '@/services/recurringStore';
import type { RecurringTemplate } from '@/services/recurrence';
import { expenseRepository } from '@/repositories/expenseRepository';
import type { Category } from '@/models/types';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import { ConfirmDialog } from './ConfirmDialog';
import { SettingsRow } from './SettingsRow';
import { CategoryIconTile, EmptyState, LoadingListSkeleton, SignatureText } from './ui';
import { IconAdd, IconClose, IconDelete, IconEdit, IconPause, IconPlay, IconRepeat } from './Icons';
import { RecurringEditor } from './RecurringEditor';
import { formatDueDate, newTemplate, recurringCategoriesFor, scheduleText } from './recurringDraft';

/** The Settings → Data row; opens the recurring panel. */
export function RecurringManager() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const user = useAuthStore((s) => s.user);
  const owner = useRecurringStore((s) => s.owner);
  const loaded = useRecurringStore((s) => s.loaded);
  const rows = useRecurringStore((s) => s.rows);
  useEffect(() => setOpen(false), [user?.uid]);
  const mine = loaded && owner === user?.uid ? rows : [];
  const scheduled = mine.filter((r) => r.enabled && r.nextDate).length;
  const paused = mine.filter((r) => !r.enabled).length;
  const subtitle = scheduled + paused === 0
    ? t('recurringSub')
    : paused > 0
      ? t('recurringSubPaused', { count: scheduled, paused })
      : t('recurringSubCount', { count: scheduled });
  // The quarantine warning lives in the app shell (RecurringIssuesWarning), so it shows on every tab.
  return (
    <>
      <SettingsRow icon={IconRepeat} iconTint="accent" title={t('recurringTitle')} subtitle={subtitle} onClick={() => setOpen(true)} />
      {open && user && <RecurringPanel key={user.uid} owner={user.uid} close={() => setOpen(false)} />}
    </>
  );
}

function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}

type Editing = { template: RecurringTemplate; expected: number | null };

/**
 * The list of recurring transactions. Opening it runs a catch-up pass, and so does every
 * save, so nobody has to press "synchronize" for due transactions to appear.
 */
export function RecurringPanel({ owner, close }: { owner: string; close: () => void }) {
  const { t, locale } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const state = useRecurringStore();
  const currency = usePreferencesStore((s) => s.currency);
  const online = useOnline();
  const root = useRef<HTMLDivElement>(null);
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [categoriesFailed, setCategoriesFailed] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState(false);
  const [removing, setRemoving] = useState<RecurringTemplate | null>(null);
  const [skipping, setSkipping] = useState<{ row: RecurringTemplate; date: string } | null>(null);

  const mineNow = () => useAuthStore.getState().user?.uid === owner;
  const handleEscape = useCallback(() => close(), [close]);
  useFocusTrap(!editing && !removing && !skipping, root, handleEscape);
  useBodyScrollLock(true);

  const loadCategories = useCallback(() => {
    let alive = true;
    setCategoriesFailed(false);
    expenseRepository.getAllCategories()
      .then((c) => { if (alive && useAuthStore.getState().user?.uid === owner) setCategories(c); })
      .catch(() => { if (alive) setCategoriesFailed(true); });
    return () => { alive = false; };
  }, [owner]);
  useEffect(() => loadCategories(), [loadCategories]);

  // Catch up whenever the panel opens; the shell already does so on start, focus and reconnect.
  useEffect(() => { void syncRecurring(); }, []);

  const mine = state.owner === owner;
  const rows = mine ? state.rows : [];
  const issues = mine ? state.issues : [];
  const loading = !mine || !state.loaded || (categories === null && !categoriesFailed);
  const blockedReason = !user?.emailVerified ? t('recurringNeedsVerified') : !online ? t('recurringOffline') : null;
  const disabled = !!busy || !!blockedReason;
  const loadFailed = categoriesFailed || (mine && state.error && online);
  const cats = categories ?? [];
  const categoryOf = (row: RecurringTemplate) => cats.find((c) => c.id === row.categoryId);

  const mutate = async (id: string, work: () => Promise<unknown>, done?: string) => {
    if (busy) return;
    setBusy(id);
    setActionError(false);
    try {
      await work();
      if (!mineNow()) return;
      setRemoving(null);
      setSkipping(null);
      if (done) useToastStore.getState().show(done);
    } catch {
      if (mineNow()) setActionError(true);
    } finally {
      if (mineNow()) setBusy(null);
    }
  };

  const create = () => {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    setActionError(false);
    setEditing({ template: newTemplate(Date.now(), timeZone, recurringCategoriesFor(cats, 'expense')[0]?.id ?? ''), expected: null });
  };

  const toggle = (row: RecurringTemplate) =>
    mutate(row.id, async () => {
      await recurringRepository.save(owner, { ...row, enabled: !row.enabled }, row.updatedAt);
      if (row.enabled === false) void syncRecurring();
    });

  const skip = (row: RecurringTemplate, date: string) =>
    mutate(row.id, async () => {
      await recurringRepository.skipOccurrence(owner, row.id, date, row.updatedAt);
      if (!mineNow()) return;
      const left = recurringRepository.getRecurringIssues(owner);
      useRecurringStore.setState({ issues: left, quarantined: left.length > 0 });
      void syncRecurring();
    });

  const retry = () => {
    if (categoriesFailed) loadCategories();
    void syncRecurring();
  };

  return (
    <>
    {createPortal(
    <div className="fixed inset-0 z-[200] safe-overlay bg-background/80 backdrop-blur-xl flex items-center justify-center" onClick={close}>
      <div
        className="card--pro add-txn recurring-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="recurring-title"
        ref={root}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        aria-hidden={editing ? true : undefined}
      >
        <div className="add-txn__header">
          <h2 id="recurring-title" className="modal-title add-txn__title"><SignatureText text={t('recurringTitle')} /></h2>
          <button type="button" className="icon-btn" onClick={close} aria-label={t('actionClose')}>
            <IconClose width={20} height={20} aria-hidden />
          </button>
        </div>

        <div className="add-txn__body recurring-panel__body">
          <p className="recurring-panel__intro">{t('recurringIntro')}</p>
          {blockedReason ? <p className="recurring-blocked" role="status">{blockedReason}</p> : null}
          {loadFailed ? (
            <div className="recurring-alert" role="alert">
              <p className="recurring-alert__text">{t('recurringLoadError')}</p>
              <button type="button" className="recurring-alert__action" onClick={retry} disabled={state.syncing}>{t('actionRetry')}</button>
            </div>
          ) : null}
          {actionError ? <p className="add-txn__error" role="alert">{t('recurringActionError')}</p> : null}

          {loading && !loadFailed ? (
            <LoadingListSkeleton rows={3} />
          ) : rows.length === 0 ? (
            <EmptyState title={t('recurringEmpty')} subtitle={t('recurringEmptyHint')} />
          ) : (
            <ul className="recurring-list" aria-busy={busy ? true : undefined}>
              {rows.map((row) => {
                const category = categoryOf(row);
                const issue = issues.find((i) => i.templateId === row.id);
                const damaged = issue?.code === 'INVALID_RECURRING_TEMPLATE';
                // Already moved on (fixed elsewhere); the next pass drops the stale issue.
                const showIssue = issue && (damaged || row.nextDate === issue.scheduledDate);
                const status = !row.enabled
                  ? t('recurringPaused')
                  : row.nextDate
                    ? t('recurringNext', { date: formatDueDate(row.nextDate, localeTag(locale)) })
                    : t('recurringEnded');
                const name = row.note || category?.name || t('recurringTitle');
                return (
                  <li key={row.id} className={`recurring-item${row.enabled ? '' : ' recurring-item--paused'}`} data-testid="recurring-item">
                    <CategoryIconTile iconName={category?.iconName ?? 'repeat'} color={colorIntToHex(category?.colorInt ?? 0xff8a8a8a)} size={40} />
                    <div className="recurring-item__main">
                      <div className="recurring-item__top">
                        <span className="recurring-item__name">{name}</span>
                        <span className={`recurring-item__amount recurring-item__amount--${row.transactionType}`}>{formatAmount(row.amount, currency)}</span>
                      </div>
                      <div className="recurring-item__meta">
                        {row.note && category ? `${category.name} · ` : ''}{scheduleText(row.frequency, row.interval, t)} · <span className="recurring-item__status">{status}</span>
                      </div>
                      {showIssue ? (
                        <div className="recurring-row__issue" data-testid="recurring-row-issue">
                          <p className="recurring-warning__text">{damaged ? t('recurringIssueDamaged') : t('recurringIssueStuck', { date: issue.scheduledDate })}</p>
                          {!damaged && (
                            <button type="button" className="btn btn-secondary" disabled={disabled} onClick={() => setSkipping({ row, date: issue.scheduledDate })}>
                              {t('recurringSkipDate')}
                            </button>
                          )}
                        </div>
                      ) : null}
                    </div>
                    <div className="recurring-item__actions">
                      <button
                        type="button"
                        className="icon-btn recurring-item__action"
                        disabled={disabled}
                        aria-label={t(row.enabled ? 'recurringPause' : 'recurringResume')}
                        title={t(row.enabled ? 'recurringPause' : 'recurringResume')}
                        onClick={() => void toggle(row)}
                      >
                        {busy === row.id ? <span className="add-txn__spinner" aria-hidden /> : row.enabled ? <IconPause width={18} height={18} aria-hidden /> : <IconPlay width={18} height={18} aria-hidden />}
                      </button>
                      <button
                        type="button"
                        className="icon-btn recurring-item__action"
                        disabled={disabled}
                        aria-label={t('recurringEdit')}
                        title={t('recurringEdit')}
                        onClick={() => { setActionError(false); setEditing({ template: { ...row }, expected: row.updatedAt }); }}
                      >
                        <IconEdit width={18} height={18} aria-hidden />
                      </button>
                      <button
                        type="button"
                        className="icon-btn icon-btn--danger recurring-item__action"
                        disabled={disabled}
                        aria-label={t('actionDelete')}
                        title={t('actionDelete')}
                        onClick={() => setRemoving(row)}
                      >
                        <IconDelete width={18} height={18} aria-hidden />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="add-txn__footer">
          <button type="button" className="btn btn-primary add-txn__save recurring-panel__new" disabled={disabled || loading} onClick={create}>
            <IconAdd width={18} height={18} aria-hidden />
            <span>{t('recurringNew')}</span>
          </button>
        </div>
      </div>
    </div>,
    document.body,
    )}
      {editing ? (
        <RecurringEditor
          owner={owner}
          template={editing.template}
          expected={editing.expected}
          categories={cats}
          blockedReason={blockedReason}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            useToastStore.getState().show(t('recurringSaved'));
            void syncRecurring();
          }}
        />
      ) : null}
      <ConfirmDialog
        open={!!skipping}
        title={t('recurringSkipTitle', { date: skipping?.date ?? '' })}
        message={t('recurringSkipMessage')}
        confirmLabel={t('recurringSkipDate')}
        confirmDisabled={!!busy}
        onCancel={() => { if (!busy) setSkipping(null); }}
        onConfirm={() => { if (skipping) void skip(skipping.row, skipping.date); }}
      />
      <ConfirmDialog
        open={!!removing}
        title={t('recurringDelete')}
        message={t('recurringDeleteMessage')}
        confirmLabel={t('actionDelete')}
        confirmDisabled={!!busy}
        onCancel={() => { if (!busy) setRemoving(null); }}
        onConfirm={() => { if (removing) void mutate(removing.id, () => recurringRepository.remove(owner, removing.id, removing.updatedAt), t('recurringDeleted')); }}
      />
    </>
  );
}
