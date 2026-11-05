import { Suspense, lazy, useEffect, useState } from 'react';
import { useTranslation } from '@/i18n';
import { useAuthStore } from '@/services/authStore';
import { useRecurringStore } from '@/services/recurringStore';

// Loaded on demand: the warning is in the app shell, the panel only matters once someone taps Review.
const RecurringPanel = lazy(() => import('./RecurringManager').then((m) => ({ default: m.RecurringPanel })));

/** Affected-template count for the quarantine warning; 0 means "show nothing". */
export function recurringWarningTemplates(
  userUid: string | undefined,
  owner: string | null,
  quarantined: boolean,
  issues: ReadonlyArray<{ templateId: string }>,
): number {
  if (!userUid || owner !== userUid || !quarantined || issues.length === 0) return 0;
  return new Set(issues.map((i) => i.templateId)).size;
}

/**
 * Persistent, non-destructive quarantine warning, rendered by the app shell so it is visible
 * on every tab: a quarantined template means totals may be missing scheduled transactions,
 * which someone on the Record or Insights tab needs to know. It is scoped to the signed-in
 * UID (the store already drops responses from a previous account). "Review" opens the
 * recurring panel, where each affected item names its problem and offers the fix.
 */
export function RecurringIssuesWarning() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const owner = useRecurringStore((s) => s.owner);
  const quarantined = useRecurringStore((s) => s.quarantined);
  const issues = useRecurringStore((s) => s.issues);
  const templates = recurringWarningTemplates(user?.uid, owner, quarantined, issues);
  const [reviewing, setReviewing] = useState(false);
  useEffect(() => setReviewing(false), [user?.uid]);
  if (templates === 0 && !reviewing) return null;
  return (
    <>
      {templates > 0 && (
        <div className="recurring-warning" role="alert" data-testid="recurring-issues-warning">
          <p className="recurring-warning__text">{t('recurringIssuesWarning', { count: String(templates) })}</p>
          <button type="button" className="recurring-warning__review" onClick={() => setReviewing(true)}>{t('recurringIssuesReview')}</button>
        </div>
      )}
      {/* Stays open after the last issue is fixed, so the person sees the result. */}
      {reviewing && user && <Suspense fallback={null}><RecurringPanel key={user.uid} owner={user.uid} close={() => setReviewing(false)} /></Suspense>}
    </>
  );
}
