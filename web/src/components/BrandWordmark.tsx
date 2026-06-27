interface BrandWordmarkProps {
  text: string;
  className?: string;
}

/** Stacked brand wordmark — HTML type avoids SVG descender clipping. */
export function BrandWordmark({ text, className = '' }: BrandWordmarkProps) {
  if (!text) return null;

  const lower = text.toLowerCase();
  const isAusgegeben = lower === 'ausgegeben';

  if (isAusgegeben) {
    return (
      <div className={`brand-wordmark brand-wordmark--stacked ${className}`.trim()} aria-hidden>
        <p className="brand-wordmark__line brand-wordmark__line--primary">
          <span className="brand-wordmark__accent">A</span>
          <span>us</span>
        </p>
        <p className="brand-wordmark__line brand-wordmark__line--sub">gegeben</p>
        <span className="brand-wordmark__rule" aria-hidden />
      </div>
    );
  }

  const rest = text.slice(1);

  return (
    <div className={`brand-wordmark brand-wordmark--inline ${className}`.trim()} aria-hidden>
      <p className="brand-wordmark__line brand-wordmark__line--primary">
        <span className="brand-wordmark__accent">{text[0]}</span>
        <span>{rest}</span>
      </p>
      <span className="brand-wordmark__rule" aria-hidden />
    </div>
  );
}
