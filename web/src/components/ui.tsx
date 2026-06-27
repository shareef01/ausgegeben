import type { ReactNode } from 'react';

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
  return (
    <Tag className={`signature-text ${className}`.trim()}>
      <span className="signature-text__accent">{text[0]}</span>
      {text.slice(1)}
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
  return (
    <header className="screen-title-bar">
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

export function MoneyText({ amount, currency, className = 'money--body', color }: { amount: number; currency: string; className?: string; color?: string }) {
  const formatted = new Intl.NumberFormat(currency === 'EUR' ? 'de-DE' : 'en-US', { style: 'currency', currency }).format(amount);
  return <span className={className} style={color ? { color } : undefined}>{formatted}</span>;
}

export function EmptyState({ title, subtitle, action }: { title: string; subtitle: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <div className="empty-state__icon" aria-hidden>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="4" width="18" height="16" rx="2" /><path d="M8 10h8M8 14h5" />
        </svg>
      </div>
      <h3>{title}</h3>
      <p>{subtitle}</p>
      {action ? <div className="empty-state__action">{action}</div> : null}
    </div>
  );
}

export function LoadingListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="skeleton-list card" style={{ margin: '8px 16px' }}>
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

export function SignatureNavLabel({ label }: { label: string }) {
  return <SignatureText text={label} className="signature-text--nav" />;
}

export function categoryIcon(iconName: string): string {
  const map: Record<string, string> = {
    shopping_cart: '🛒', shopping_bag: '🛍️', restaurant: '🍽️', car: '🚗', bolt: '⚡',
    subscriptions: '📱', credit_card: '💳', work: '💼', undo: '↩️', swap_horiz: '⇄',
  };
  return map[iconName] ?? '•';
}
