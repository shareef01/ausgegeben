import type { ReactNode } from 'react';

interface ScreenTitleProps {
  title: string;
  subtitle?: string;
}

export function ScreenTitle({ title, subtitle }: ScreenTitleProps) {
  if (!title) return null;
  const first = title[0];
  const rest = title.slice(1);
  return (
    <header>
      <h1 className="screen-title">
        <span className="screen-title__accent">{first}</span>
        {rest}
      </h1>
      {subtitle ? <p style={{ padding: '0 16px', color: 'var(--color-on-surface-variant)', marginTop: -8 }}>{subtitle}</p> : null}
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
      <h3>{title}</h3>
      <p>{subtitle}</p>
      {action}
    </div>
  );
}

export function SignatureNavLabel({ label }: { label: string }) {
  return (
    <span>
      <span style={{ color: 'var(--color-accent)', fontWeight: 700 }}>{label[0]}</span>
      {label.slice(1)}
    </span>
  );
}

export function categoryIcon(iconName: string): string {
  const map: Record<string, string> = {
    shopping_cart: '🛒', shopping_bag: '🛍️', restaurant: '🍽️', car: '🚗', bolt: '⚡',
    subscriptions: '📱', credit_card: '💳', work: '💼', undo: '↩️', swap_horiz: '⇄',
  };
  return map[iconName] ?? '•';
}
