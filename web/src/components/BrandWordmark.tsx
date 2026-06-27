interface BrandWordmarkProps {
  text: string;
  className?: string;
}

/** SVG wordmark with animated accent rule — pairs with AppBrandIcon. */
export function BrandWordmark({ text, className = '' }: BrandWordmarkProps) {
  if (!text) return null;

  const rest = text.slice(1);
  const width = Math.min(168, 38 + rest.length * 7.2);

  return (
    <svg
      className={`brand-wordmark ${className}`.trim()}
      viewBox={`0 0 ${width} 36`}
      width={width}
      height="36"
      aria-hidden
      role="img"
    >
      <defs>
        <linearGradient id="brand-wordmark-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#34D399" />
          <stop offset="100%" stopColor="#059669" />
        </linearGradient>
      </defs>

      <text
        x="0"
        y="22"
        fontFamily="Inter, system-ui, -apple-system, sans-serif"
        fontSize="15"
        fontWeight="600"
        letterSpacing="-0.03em"
      >
        <tspan fill="url(#brand-wordmark-grad)">{text[0]}</tspan>
        <tspan fill="#F4F4F5">{rest}</tspan>
      </text>

      <line
        className="brand-wordmark__rule"
        x1="0"
        y1="31"
        x2={width}
        y2="31"
        stroke="url(#brand-wordmark-grad)"
        strokeWidth="1.5"
        strokeLinecap="round"
        pathLength="1"
      />
    </svg>
  );
}
