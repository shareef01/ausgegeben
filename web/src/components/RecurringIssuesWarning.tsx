import { useTranslation } from '@/i18n';
import { useAuthStore } from '@/services/authStore';
import { useRecurringStore } from '@/services/recurringStore';

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
 * UID (the store already drops responses from a previous account) and offers no repair control.
 */
export function RecurringIssuesWarning() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const owner = useRecurringStore((s) => s.owner);
  const quarantined = useRecurringStore((s) => s.quarantined);
  const issues = useRecurringStore((s) => s.issues);
  const templates = recurringWarningTemplates(user?.uid, owner, quarantined, issues);
  if (templates === 0) return null;
  return (
    <div className="recurring-warning" role="alert" data-testid="recurring-issues-warning">
      <p className="recurring-warning__text">{t('recurringIssuesWarning', { count: String(templates) })}</p>
    </div>
  );
}
