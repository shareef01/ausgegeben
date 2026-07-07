import { Share } from 'lucide-react';
import { SettingsBottomSheet } from '@/components/SettingsBottomSheet';
import { useTranslation } from '@/i18n';

interface IosInstallSheetProps {
  onClose: () => void;
}

export function IosInstallSheet({ onClose }: IosInstallSheetProps) {
  const { t } = useTranslation();

  return (
    <SettingsBottomSheet title={t('installIosTitle')} subtitle={t('installAppSub')} onClose={onClose}>
      <ol className="ios-install-steps">
        <li className="ios-install-steps__item">
          <span className="ios-install-steps__icon" aria-hidden>
            <Share size={18} />
          </span>
          <span>{t('installIosStep1')}</span>
        </li>
        <li className="ios-install-steps__item">{t('installIosStep2')}</li>
        <li className="ios-install-steps__item">{t('installIosStep3')}</li>
      </ol>
    </SettingsBottomSheet>
  );
}
