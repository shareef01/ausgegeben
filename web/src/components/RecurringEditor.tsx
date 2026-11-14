import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Category, TransactionType } from '@/models/types';
import { useTranslation } from '@/i18n';
import { useAuthStore } from '@/services/authStore';
import { usePreferencesStore } from '@/services/preferencesStore';
import { recurringRepository } from '@/services/recurringRepository';
import type { RecurringTemplate } from '@/services/recurrence';
import { amountPlaceholder, colorIntToHex, currencySymbol } from '@/utils/currency';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import { useHaptics } from '@/hooks/useHaptics';
import { SignatureText } from '@/components/ui';
import { IosSegmentedControl } from '@/components/IosSegmentedControl';
import { CategoryLucideIcon } from '@/components/CategoryLucideIcon';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { IconCheck, IconClose } from '@/components/Icons';
import { CatIcon } from '@/views/AddTransactionView';
import {
  FORM_ERROR_KEYS,
  FREQUENCIES,
  UNIT_KEYS,
  formFromTemplate,
  isRecurringFormDirty,
  recurringCategoriesFor,
  templateFromForm,
  type RecurringForm,
  type RecurringFormError,
} from './recurringDraft';

const TYPES: TransactionType[] = ['expense', 'income', 'transfer'];
const TYPE_KEYS = { expense: 'typeExpense', income: 'typeIncome', transfer: 'typeTransfer' } as const;

interface RecurringEditorProps {
  owner: string;
  /** The template being edited, or a fresh one from `newTemplate`. */
  template: RecurringTemplate;
  /** `updatedAt` the server copy must still have (edit), or null (new). */
  expected: number | null;
  categories: Category[];
  /** Why changes are blocked right now (offline, unverified), or null. */
  blockedReason: string | null;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Create/edit dialog for one recurring transaction. Built from the add-transaction parts
 * (type segment, currency-prefixed amount, category tiles, X close, discard confirmation)
 * so the two read as one product; the schedule fields sit where the add dialog has its date.
 */
export function RecurringEditor({ owner, template, expected, categories, blockedReason, onClose, onSaved }: RecurringEditorProps) {
  const { t } = useTranslation();
  const currency = usePreferencesStore((s) => s.currency);
  const haptics = useHaptics();
  const isNew = expected === null;
  const [baseline] = useState(() => formFromTemplate(template, currency, isNew));
  const [form, setForm] = useState<RecurringForm>(baseline);
  const [error, setError] = useState<RecurringFormError | 'save' | 'conflict' | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const catsRef = useRef<HTMLDivElement>(null);

  const options = useMemo(() => recurringCategoriesFor(categories, form.transactionType), [categories, form.transactionType]);
  const dirty = isRecurringFormDirty(baseline, form, currency);

  const requestClose = useCallback(() => {
    if (saving) return;
    if (dirty) {
      haptics.light();
      setConfirmDiscard(true);
      return;
    }
    onClose();
  }, [saving, dirty, haptics, onClose]);

  useFocusTrap(!confirmDiscard, dialogRef, requestClose);
  useBodyScrollLock(true);

  useEffect(() => {
    amountRef.current?.focus();
  }, []);

  useEffect(() => {
    const selected = catsRef.current?.querySelector<HTMLElement>('.add-txn__cat--selected');
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    selected?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', inline: 'center', block: 'nearest' });
  }, [form.categoryId]);

  const update = (patch: Partial<RecurringForm>) => {
    setForm((f) => ({ ...f, ...patch }));
    setError(null);
  };

  const changeType = (type: TransactionType) => {
    if (type === form.transactionType) return;
    // Like the add dialog: the old category belongs to the old type, so take the first of the new one.
    update({ transactionType: type, categoryId: recurringCategoriesFor(categories, type)[0]?.id ?? '' });
  };

  const save = async () => {
    if (saving || blockedReason) return;
    const result = templateFromForm(template, form, currency);
    if (!result.ok) {
      haptics.light();
      setError(result.error);
      if (result.error === 'amount') amountRef.current?.focus();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await recurringRepository.save(owner, result.template, expected);
      if (useAuthStore.getState().user?.uid !== owner) return;
      haptics.success();
      onSaved();
    } catch (err) {
      if (useAuthStore.getState().user?.uid !== owner) return;
      setError(err instanceof Error && err.message === 'RECURRING_CONFLICT' ? 'conflict' : 'save');
      setSaving(false);
    }
  };

  const errorText = error === 'save' ? t('recurringSaveError') : error === 'conflict' ? t('recurringConflict') : error ? t(FORM_ERROR_KEYS[error]) : null;
  const errorId = errorText ? 'recurring-editor-error' : undefined;
  const invalid = (field: RecurringFormError) => (error === field ? { 'aria-invalid': true as const, 'aria-describedby': errorId } : {});

  return createPortal(
    <>
      <div className="fixed inset-0 z-[200] safe-overlay bg-background/80 backdrop-blur-xl flex items-center justify-center" onClick={requestClose}>
        <div
          ref={dialogRef}
          className="card--pro add-txn recurring-editor"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="recurring-editor-title"
          tabIndex={-1}
        >
          <div className="add-txn__header">
            <h2 id="recurring-editor-title" className="modal-title add-txn__title">
              <SignatureText text={isNew ? t('recurringNew') : t('recurringEditTitle')} />
            </h2>
            <button type="button" className="icon-btn" onClick={requestClose} aria-label={t('actionClose')}>
              <IconClose width={20} height={20} aria-hidden />
            </button>
          </div>

          <div className="add-txn__body">
            <IosSegmentedControl
              aria-label={isNew ? t('recurringNew') : t('recurringEditTitle')}
              options={TYPES.map((type) => ({ value: type, label: t(TYPE_KEYS[type]) }))}
              value={form.transactionType}
              onChange={changeType}
            />

            <div className="field add-txn__field--amount">
              <label htmlFor="recurring-amount" className="field__label">{t('addAmountLabel')}</label>
              <div className="add-txn__amount">
                <span className="add-txn__currency" aria-hidden>{currencySymbol(currency)}</span>
                <input
                  id="recurring-amount"
                  ref={amountRef}
                  className="field__input add-txn__amount-input"
                  placeholder={amountPlaceholder(currency)}
                  inputMode="decimal"
                  autoComplete="off"
                  value={form.amountInput}
                  onChange={(e) => update({ amountInput: e.target.value })}
                  {...invalid('amount')}
                />
              </div>
            </div>

            <div className="add-txn__field--date recurring-schedule">
              <div className="field">
                <span className="field__label" id="recurring-repeat-label">{t('recurringRepeat')}</span>
                <div className="recurring-schedule__repeat" role="group" aria-labelledby="recurring-repeat-label">
                  <input
                    className="field__input recurring-schedule__interval"
                    aria-label={t('recurringInterval')}
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={3}
                    value={form.intervalInput}
                    onChange={(e) => update({ intervalInput: e.target.value.replace(/\D/g, '') })}
                    {...invalid('interval')}
                  />
                  <IosSegmentedControl
                    aria-label={t('recurringUnit')}
                    className="recurring-schedule__unit"
                    activeVariant="default"
                    options={FREQUENCIES.map((f) => ({ value: f, label: t(UNIT_KEYS[f]) }))}
                    value={form.frequency}
                    onChange={(frequency) => update({ frequency })}
                  />
                </div>
              </div>
              <div className="recurring-schedule__dates">
                <div className="field">
                  <label htmlFor="recurring-start" className="field__label">{t('recurringStarts')}</label>
                  <input
                    id="recurring-start"
                    type="date"
                    className="field__input"
                    min="2000-01-01"
                    max="2099-12-31"
                    value={form.startDate}
                    onChange={(e) => { if (e.target.value) update({ startDate: e.target.value }); }}
                  />
                </div>
                <div className="field">
                  <label htmlFor="recurring-end" className="field__label">{t('recurringEnds')}</label>
                  <input
                    id="recurring-end"
                    type="date"
                    className="field__input"
                    min={form.startDate}
                    max="2099-12-31"
                    value={form.endDate}
                    onChange={(e) => update({ endDate: e.target.value })}
                    {...invalid('end')}
                  />
                </div>
              </div>
              <p className="recurring-schedule__zone">{t('recurringZone', { zone: template.timeZone })}</p>
            </div>

            <div className="field add-txn__field--cats">
              <div className="field__label" id="recurring-category-label">{t('addCategoryLabel')}</div>
              <div
                ref={catsRef}
                className="add-txn__cats"
                role="group"
                aria-labelledby="recurring-category-label"
                {...invalid('category')}
              >
                {options.length === 0 ? (
                  <div className="categories-empty add-txn__cats-empty">
                    <p className="categories-empty__text">{t(categories.length ? 'categoriesEmptyForType' : 'categoriesEmptyHint')}</p>
                  </div>
                ) : (
                  options.map((cat) => {
                    const selected = form.categoryId === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        className={`add-txn__cat${selected ? ' add-txn__cat--selected' : ''}`}
                        onClick={() => update({ categoryId: cat.id })}
                        aria-pressed={selected}
                        title={cat.name}
                      >
                        {selected ? (
                          <span className="add-txn__cat-check" aria-hidden>
                            <IconCheck width={12} height={12} strokeWidth={3} />
                          </span>
                        ) : null}
                        <CatIcon color={colorIntToHex(cat.colorInt)}>
                          <CategoryLucideIcon iconName={cat.iconName} size={22} />
                        </CatIcon>
                        <span className="add-txn__cat-name">{cat.name}</span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            <div className="field add-txn__field--note">
              <label htmlFor="recurring-note" className="field__label">{t('noteLabel')}</label>
              <input
                id="recurring-note"
                className="field__input"
                placeholder={t('notePlaceholder')}
                maxLength={2000}
                value={form.note}
                onChange={(e) => update({ note: e.target.value })}
              />
            </div>

            {errorText ? <p id="recurring-editor-error" className="add-txn__error" role="alert">{errorText}</p> : null}
          </div>

          <div className="add-txn__footer">
            {blockedReason ? <p className="recurring-blocked" role="status">{blockedReason}</p> : null}
            <button
              type="button"
              className="btn btn-primary add-txn__save"
              onClick={() => void save()}
              disabled={saving || !!blockedReason}
            >
              {saving ? (
                <span className="add-txn__saving">
                  <span className="add-txn__spinner" aria-hidden />
                  <span>{t('actionSaving')}</span>
                </span>
              ) : t('actionSave')}
            </button>
          </div>
        </div>
      </div>
      <ConfirmDialog
        open={confirmDiscard}
        title={t('addUnsavedTitle')}
        message={t('addUnsavedBody')}
        confirmLabel={t('addDiscard')}
        cancelLabel={t('actionCancel')}
        onConfirm={() => {
          setConfirmDiscard(false);
          onClose();
        }}
        onCancel={() => setConfirmDiscard(false)}
      />
    </>,
    document.body,
  );
}
