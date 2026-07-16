interface AppBrandWordmarkProps {
  className?: string;
}

/**
 * Header wordmark lockup — HTML type for sharp rendering + optical
 * alignment beside the 40px brand mark. Green rule under “aus”
 * echoes the mark’s A accent.
 */
export function AppBrandWordmark({ className = '' }: AppBrandWordmarkProps) {
  return (
    <span className={`app-brand-wordmark ${className}`.trim()}>
      <span className="app-brand-wordmark__name">ausgegeben</span>
      <span className="app-brand-wordmark__rule" aria-hidden>
        <span className="app-brand-wordmark__rule-bar" />
        <span className="app-brand-wordmark__rule-fade" />
      </span>
    </span>
  );
}
