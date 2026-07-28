import { CategoryLucideIcon } from '@/components/CategoryLucideIcon';
import type { ComponentType, ReactNode } from 'react';
import type { LucideProps } from 'lucide-react';
import { useTranslation } from '@/i18n';
import { formatAmount } from '@/utils/currency';
import { useCssProps } from '@/utils/cssVars';

/**
 * Brand-aligned title word — first letter in income green (like “aus”),
 * remainder in foreground. Always lowercase. Rendered as one text node so
 * letter-spacing / kerning stay continuous (no “r ecord” gap).
 */
export function SignatureText({
  text,
  as: Tag = 'span',
  className = '',
}: {
  text: string;
  as?: 'span' | 'h1' | 'h2' | 'p';
  className?: string;
}) {
  if (!text) return null;
  return (
    <Tag className={`signature-text ${className}`.trim()}>
      {text.toLowerCase()}
    </Tag>
  );
}

/** Screen heading with nav-matching icon + signature wordmark. */
export function PageTitle({
  text,
  icon: Icon,
  className = '',
}: {
  text: string;
  icon: ComponentType<LucideProps>;
  className?: string;
}) {
  return (
    <div className={`page-title ${className}`.trim()}>
      <h1 className="page-title__text">
        <span className="page-title__icon" aria-hidden>
          <Icon width={22} height={22} strokeWidth={2.25} />
        </span>
        <SignatureText text={text} />
      </h1>
    </div>
  );
}

export function MoneyText({ amount, currency, className = 'money--body' }: { amount: number; currency: string; className?: string }) {
  const { locale } = useTranslation();
  const formatted = formatAmount(amount, currency, true, locale);
  return <span className={`money tabular-nums ${className}`}>{formatted}</span>;
}

export function EmptyState({ title, subtitle, hint, action }: { title: string; subtitle: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="empty-state flex flex-col items-center text-center py-12 px-4">
      <div className="empty-state__icon mb-6" aria-hidden>
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M8 10h8M8 14h5" />
        </svg>
      </div>
      <h3 className="text-lg font-semibold mb-2 tracking-tight text-on-background">{title}</h3>
      <p className="text-sm text-on-surface-variant max-w-xs leading-relaxed">{subtitle}</p>
      {hint ? <p className="empty-state__hint text-xs text-on-surface-variant mt-3">{hint}</p> : null}
      {action ? <div className="empty-state__action mt-6">{action}</div> : null}
    </div>
  );
}

export function LoadingListSkeleton({ rows = 5 }: { rows?: number }) {
  const { t } = useTranslation();
  return (
    <div
      className="skeleton-list flex flex-col gap-0 rounded-2xl overflow-hidden border border-[color-mix(in_srgb,var(--color-outline)_55%,transparent)] bg-[color-mix(in_srgb,var(--color-surface)_80%,transparent)] backdrop-blur-sm"
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">{t('loading')}</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton-row flex items-center gap-4 p-5 border-b border-[color-mix(in_srgb,var(--color-outline)_40%,transparent)] last:border-b-0" aria-hidden>
          <div className="skeleton skeleton--circle w-10 h-10 rounded-full bg-[color-mix(in_srgb,var(--color-on-surface)_6%,transparent)] animate-pulse shrink-0" />
          <div className="skeleton skeleton--lines flex-1 flex flex-col gap-2.5 min-w-0">
            <div className="skeleton skeleton--line h-3.5 w-32 rounded-full bg-[color-mix(in_srgb,var(--color-on-surface)_8%,transparent)] animate-pulse" />
            <div className="skeleton skeleton--line skeleton--line-short h-2.5 w-20 rounded-full bg-[color-mix(in_srgb,var(--color-on-surface)_6%,transparent)] animate-pulse" />
          </div>
          <div className="skeleton skeleton--amount h-4 w-20 rounded-full bg-[color-mix(in_srgb,var(--color-on-surface)_8%,transparent)] animate-pulse shrink-0" />
        </div>
      ))}
    </div>
  );
}

export function CategoryIconTile({ iconName, color, size = 36 }: { iconName: string; color: string; size?: number }) {
  const ref = useCssProps<HTMLDivElement>({
    '--tile-size': `${size}px`,
    '--tile-color': color,
  });
  return (
    <div
      ref={ref}
      className="category-icon-tile transition-all duration-200 active:scale-90 hover:brightness-110"
    >
      <CategoryLucideIcon iconName={iconName} width={size * 0.55} height={size * 0.55} />
    </div>
  );
}
