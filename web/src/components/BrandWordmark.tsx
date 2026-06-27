interface BrandWordmarkProps {
  text: string;
  className?: string;
}

const FONT = '"Syne", "Inter", system-ui, sans-serif';

/** Stacked SVG wordmark — display type beside the app icon (icon unchanged). */
export function BrandWordmark({ text, className = '' }: BrandWordmarkProps) {
  if (!text) return null;

  const lower = text.toLowerCase();
  const isAusgegeben = lower === 'ausgegeben';

  if (isAusgegeben) {
    return (
      <svg
        className={`brand-wordmark brand-wordmark--stacked ${className}`.trim()}
        viewBox="0 0 156 62"
        width="156"
        aria-hidden
        role="img"
        overflow="visible"
      >
        <defs>
          <linearGradient id="bw-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#6EE7B7" />
            <stop offset="50%" stopColor="#34D399" />
            <stop offset="100%" stopColor="#059669" />
          </linearGradient>
        </defs>

        <text
          x="0"
          y="24"
          fontFamily={FONT}
          fontSize="20"
          fontWeight="800"
          letterSpacing="-0.05em"
        >
          <tspan className="brand-wordmark__accent" fill="url(#bw-grad)">
            A
          </tspan>
          <tspan fill="#FAFAFA">us</tspan>
        </text>

        <text
          className="brand-wordmark__sub"
          x="14"
          y="44"
          fontFamily={FONT}
          fontSize="13"
          fontWeight="500"
          letterSpacing="0.18em"
          fill="#A1A1AA"
        >
          gegeben
        </text>

        <line
          className="brand-wordmark__rule"
          x1="0"
          y1="56"
          x2="156"
          y2="56"
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
      viewBox={`0 0 ${width} 48`}
      width={width}
      aria-hidden
      role="img"
      overflow="visible"
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
        y1="42"
        x2={width}
        y2="42"
        stroke="url(#bw-grad-inline)"
        strokeWidth="1.5"
        strokeLinecap="round"
        pathLength="1"
      />
    </svg>
  );
}
