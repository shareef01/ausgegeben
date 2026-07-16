import { useId } from 'react';

interface AppBrandWordmarkProps {
  /** Rendered height in px; width scales with aspect ratio. */
  height?: number;
  className?: string;
}

/**
 * SVG wordmark for the header. Uses designed typography (not a DOM text node)
 * so tracking, baseline, and the emerald accent bar stay pixel-stable.
 */
export function AppBrandWordmark({ height = 22, className = '' }: AppBrandWordmarkProps) {
  const id = useId().replace(/:/g, '');
  const vbW = 154;
  const vbH = 28;
  const width = Math.round((vbW / vbH) * height);

  return (
    <svg
      className={className}
      width={width}
      height={height}
      viewBox={`0 0 ${vbW} ${vbH}`}
      fill="none"
      aria-hidden
      role="img"
    >
      <defs>
        <linearGradient id={`wm-${id}`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#34D399" />
          <stop offset="100%" stopColor="#059669" />
        </linearGradient>
        <linearGradient id={`wm-fill-${id}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="currentColor" stopOpacity="1" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.88" />
        </linearGradient>
      </defs>

      {/* Optical baseline guide — keeps glyph weight consistent across DPRs */}
      <text
        x="0"
        y="19"
        fill={`url(#wm-fill-${id})`}
        fontFamily="var(--font-family), Inter, system-ui, sans-serif"
        fontSize="18"
        fontWeight="800"
        letterSpacing="-0.055em"
        style={{ fontFeatureSettings: '"kern" 1, "liga" 1' }}
      >
        ausgegeben
      </text>

      {/* Emerald accent bar — brand signal under the leading letters */}
      <rect x="0.5" y="24" width="22" height="2.5" rx="1.25" fill={`url(#wm-${id})`} />

      {/* Soft trailing tick aligned with the mark’s geometry */}
      <path
        d="M26 25.25h8"
        stroke={`url(#wm-${id})`}
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.35"
      />
    </svg>
  );
}
