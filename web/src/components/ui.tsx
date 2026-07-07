import type { ReactNode } from 'react';
import { useStickyGlassHeader } from '@/hooks/useStickyGlassHeader';

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
    <Tag className={`signature-text ${className}`.trim()}>
      <span className="signature-text__accent">{lowercaseText[0]}</span>
      {lowercaseText.slice(1)}
    </Tag>
  );
}

interface ScreenTitleProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}

export function ScreenTitle({ title, subtitle, action }: ScreenTitleProps) {
  if (!title) return null;
  const { ref, scrolled } = useStickyGlassHeader();

  return (
    <header ref={ref} className={`screen-title-bar ${scrolled ? 'screen-title-bar--glass' : ''}`}>
      <div className="screen-title-bar__text">
        <h1 className="screen-title">
          <SignatureText text={title} />
        </h1>
        {subtitle ? <p className="screen-title__subtitle">{subtitle}</p> : null}
      </div>
      {action ? <div className="screen-title-bar__action">{action}</div> : null}
    </header>
  );
}

export function MoneyText({
  amount,
  currency,
  className = 'money--body',
  color,
  style,
  animateChanges = false,
}: {
  amount: number;
  currency: string;
  className?: string;
  color?: string;
  style?: import('react').CSSProperties;
  animateChanges?: boolean;
}) {
  const formatted = new Intl.NumberFormat(currency === 'EUR' ? 'de-DE' : 'en-US', { style: 'currency', currency }).format(amount);
  const animateClass = animateChanges ? ' money--animate' : '';
  return (
    <span
      key={animateChanges ? formatted : undefined}
      className={`${className}${animateClass}`}
      style={{ ...style, ...(color ? { color } : {}) }}
    >
      {formatted}
    </span>
  );
}

export function EmptyState({
  title,
  subtitle,
  hint,
  action,
  icon,
}: {
  title: string;
  subtitle: string;
  hint?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="empty-state chart-reveal-in">
      <div className="empty-state__icon" aria-hidden>
        {icon ?? (
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="4" width="18" height="16" rx="2" /><path d="M8 10h8M8 14h5" />
          </svg>
        )}
      </div>
      <h3 className="empty-state__title">{title}</h3>
      <p className="empty-state__subtitle">{subtitle}</p>
      {hint ? <p className="empty-state__hint">{hint}</p> : null}
      {action ? <div className="empty-state__action">{action}</div> : null}
    </div>
  );
}

export function LoadingListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="skeleton-list card insights-glass-island chart-reveal-in">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton-row">
          <div className="skeleton skeleton--circle" />
          <div className="skeleton skeleton--lines">
            <div className="skeleton skeleton--line" />
            <div className="skeleton skeleton--line skeleton--line-short" />
          </div>
          <div className="skeleton skeleton--amount" />
        </div>
      ))}
    </div>
  );
}

export function LoadingGlassSpinner({ label }: { label?: string }) {
  return (
    <div className="loading-glass-spinner" role="status" aria-live="polite">
      <div className="loading-glass-spinner__ring" aria-hidden>
        <span className="receipt-preview__spinner loading-glass-spinner__spinner" />
      </div>
      {label ? <p className="loading-glass-spinner__label">{label}</p> : null}
    </div>
  );
}

export function categoryIcon(iconName: string): string {
  const map: Record<string, string> = {
    shopping_cart: '🛒', shopping_bag: '🛍️', restaurant: '🍽️', car: '🚗', bolt: '⚡',
    subscriptions: '📱', credit_card: '💳', work: '💼', undo: '↩️', swap_horiz: '⇄',
  };
  return map[iconName] ?? '•';
}
