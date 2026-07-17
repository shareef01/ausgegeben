interface AppBrandWordmarkProps {
  className?: string;
}

/**
 * Clean header wordmark — brand syllable “aus” in income green,
 * rest in foreground. No decorative underline.
 */
export function AppBrandWordmark({ className = '' }: AppBrandWordmarkProps) {
  return (
    <span className={`app-brand-wordmark ${className}`.trim()}>
      <span className="app-brand-wordmark__aus">aus</span>
      <span className="app-brand-wordmark__rest">gegeben</span>
    </span>
  );
}
