import type { JSX } from 'react';
import { useTranslation } from '@/i18n';
import { useStaleBuildStore } from '@/services/staleBuild';

/**
 * Shown in place of a screen whose code belongs to a build that is no longer deployed.
 * The reload into the new build is already scheduled (see staleBuild.ts); this only says
 * why the screen is empty and, while offline entries are still syncing, why it waits.
 */
export function StaleBuildNotice(): JSX.Element {
  const { t } = useTranslation();
  const waitingForWrites = useStaleBuildStore((s) => s.waitingForWrites);
  return (
    <div className="stale-build-notice" role="status" aria-live="polite">
      <p className="stale-build-notice__title">{t('appUpdateTitle')}</p>
      <p className="stale-build-notice__body">
        {waitingForWrites ? t('appUpdateWaitingForSync') : t('appUpdateReloading')}
      </p>
    </div>
  );
}

/** Module shape `React.lazy` expects, for use as a guarded import's fallback. */
export const staleBuildModule = { default: StaleBuildNotice };
