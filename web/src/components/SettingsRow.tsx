import type { ComponentType, SVGProps } from 'react';
import { IconChevronRight } from '@/components/Icons';

// A Settings list row. Moved out of SettingsView.tsx unchanged so the backup section
// (SettingsBackup.tsx) can use it without the two view files importing each other.
export type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;
export type IconTint = 'accent' | 'income' | 'expense' | 'neutral';

export function SettingsRow({
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
