import { CategoryLucideIcon } from '@/components/CategoryLucideIcon';
import type { ReactNode } from 'react';
import { useTranslation } from '@/i18n';
import { formatAmount } from '@/utils/currency';

/** Two-tone first-letter accent — pixel-aligned baseline with the rest of the word. */
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
  const lowercaseText = text.toLowerCase();
  return (
    <Tag className={`signature-text leading-none flex items-baseline ${className}`.trim()}>
      <span className="signature-text__accent leading-none inline-block">{lowercaseText[0]}</span>
      <span className="leading-none">{lowercaseText.slice(1)}</span>
    </Tag>
  );
}

export function MoneyText({ amount, currency, className = 'money--body', color, style }: { amount: number; currency: string; className?: string; color?: string; style?: import('react').CSSProperties }) {
  const { locale } = useTranslation();
  const formatted = formatAmount(amount, currency, true, locale);
  return <span className={`money tabular-nums ${className}`} style={{ ...style, ...(color ? { color } : {}) }}>{formatted}</span>;
}

export function EmptyState({ title, subtitle, hint, action }: { title: string; subtitle: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="empty-state flex flex-col items-center text-center py-12 px-4">
      <div className="empty-state__icon mb-6" aria-hidden>
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" className="text-on-surface-variant opacity-50">
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
  return (
    <div className="skeleton-list flex flex-col gap-0 rounded-2xl overflow-hidden border border-white/[0.03] bg-[#121214]/50 backdrop-blur-sm">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton-row flex items-center gap-4 p-5 border-b border-white/[0.03] last:border-b-0">
          <div className="skeleton skeleton--circle w-10 h-10 rounded-full bg-white/[0.03] animate-pulse shrink-0" />
          <div className="skeleton skeleton--lines flex-1 flex flex-col gap-2.5 min-w-0">
            <div className="skeleton skeleton--line h-3.5 w-32 rounded-full bg-white/[0.04] animate-pulse" />
            <div className="skeleton skeleton--line skeleton--line-short h-2.5 w-20 rounded-full bg-white/[0.03] animate-pulse" />
          </div>
          <div className="skeleton skeleton--amount h-4 w-20 rounded-full bg-white/[0.04] animate-pulse shrink-0" />
        </div>
      ))}
    </div>
  );
}

export function CategoryIconTile({ iconName, color, size = 36 }: { iconName: string; color: string; size?: number }) {
  return (
    <div
      className="category-icon-tile transition-all duration-200 active:scale-90 hover:brightness-110"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        display: 'grid',
        placeItems: 'center',
        background: `color-mix(in srgb, ${color} 14%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 24%, transparent)`,
        color: color,
        boxShadow: `0 4px 12px color-mix(in srgb, ${color} 8%, transparent)`
      }}
    >
      <CategoryLucideIcon iconName={iconName} width={size * 0.55} height={size * 0.55} />
    </div>
  );
}
