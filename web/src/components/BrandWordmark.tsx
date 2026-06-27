interface BrandWordmarkProps {
  text: string;
  className?: string;
}

const FONT = '"Syne", "Inter", system-ui, sans-serif';

/** Stacked SVG wordmark — chevron A lockup + display type (not plain body text). */
export function BrandWordmark({ text, className = '' }: BrandWordmarkProps) {
  if (!text) return null;

  const lower = text.toLowerCase();
  const isAusgegeben = lower === 'ausgegeben';

  if (isAusgegeben) {
    return (
      <svg
        className={`brand-wordmark brand-wordmark--stacked ${className}`.trim()}
        viewBox="0 0 148 52"
        width="148"
        height="52"
        aria-hidden
        role="img"
      >
        <defs>
          <linearGradient id="bw-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#6EE7B7" />
            <stop offset="45%" stopColor="#34D399" />
            <stop offset="100%" stopColor="#059669" />
          </linearGradient>
          <linearGradient id="bw-shimmer" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0" />
            <stop offset="45%" stopColor="#FFFFFF" stopOpacity="0.55" />
            <stop offset="55%" stopColor="#FFFFFF" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
            <animateTransform
              attributeName="gradientTransform"
              type="translate"
              values="-1 0; 1.4 0;-1 0"
              dur="5.5s"
              repeatCount="indefinite"
            />
          </linearGradient>
        </defs>

        <path
          className="brand-wordmark__arc"
          d="M2 46 Q74 38 146 46"
          fill="none"
          stroke="url(#bw-grad)"
          strokeWidth="1"
          strokeLinecap="round"
          opacity="0.35"
          pathLength="1"
        />

        <text
          x="0"
          y="22"
          fontFamily={FONT}
          fontSize="20"
          fontWeight="800"
          letterSpacing="-0.05em"
        >
          <tspan fill="url(#bw-grad)">A</tspan>
          <tspan fill="#FAFAFA">us</tspan>
        </text>

        <text
          className="brand-wordmark__sub"
          x="0"
          y="44"
          fontFamily={FONT}
          fontSize="13.5"
          fontWeight="500"
          letterSpacing="0.22em"
          fill="#71717A"
          stroke="#3F3F46"
          strokeWidth="0.35"
          paintOrder="stroke fill"
        >
          gegeben
        </text>

        <rect
          className="brand-wordmark__shine"
          x="-40"
          y="28"
          width="40"
          height="18"
          fill="url(#bw-shimmer)"
          opacity="0.35"
        />

        <line
          className="brand-wordmark__rule"
          x1="0"
          y1="49"
          x2="148"
          y2="49"
          stroke="url(#bw-grad)"
          strokeWidth="1.5"
          strokeLinecap="round"
          pathLength="1"
        />
      </svg>
    );
  }

  const rest = text.slice(1);
  const width = Math.min(180, 44 + rest.length * 8.5);

  return (
    <svg
      className={`brand-wordmark brand-wordmark--inline ${className}`.trim()}
      viewBox={`0 0 ${width} 44`}
      width={width}
      height="44"
      aria-hidden
      role="img"
    >
      <defs>
        <linearGradient id="bw-grad-inline" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#34D399" />
          <stop offset="100%" stopColor="#059669" />
        </linearGradient>
      </defs>

      <text
        x="0"
        y="26"
        fontFamily={FONT}
        fontSize="17"
        fontWeight="800"
        letterSpacing="-0.03em"
      >
        <tspan fill="url(#bw-grad-inline)">{text[0]}</tspan>
        <tspan fill="#F4F4F5">{rest}</tspan>
      </text>

      <line
        className="brand-wordmark__rule"
        x1="0"
        y1="38"
        x2={width}
        y2="38"
        stroke="url(#bw-grad-inline)"
        strokeWidth="1.5"
        strokeLinecap="round"
        pathLength="1"
      />
    </svg>
  );
}
