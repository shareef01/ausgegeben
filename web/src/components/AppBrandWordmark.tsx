import { useId } from 'react';

interface AppBrandWordmarkProps {
  /** Rendered height in px; width scales with aspect ratio. */
  height?: number;
  className?: string;
}

/**
 * SVG wordmark for the header. Sized to sit beside the 40px mark
 * with stronger type, tighter tracking, and a clearer emerald accent.
 */
export function AppBrandWordmark({ height = 30, className = '' }: AppBrandWordmarkProps) {
  const id = useId().replace(/:/g, '');
  const vbW = 196;
  const vbH = 36;
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
          <stop offset="0%" stopColor="color-mix(in srgb, var(--color-income) 70%, white)" />
          <stop offset="55%" stopColor="var(--color-income)" />
          <stop offset="100%" stopColor="var(--color-income-light, var(--color-income))" />
        </linearGradient>
      </defs>

      <text
        x="0"
        y="24"
        fill="currentColor"
        fontFamily="var(--font-family), Inter, system-ui, sans-serif"
        fontSize="24"
        fontWeight="800"
        letterSpacing="-0.045em"
        style={{ fontFeatureSettings: '"kern" 1, "liga" 1' }}
      >
        ausgegeben
      </text>

      {/* Stronger brand underline — reads as part of the lockup */}
      <rect x="1" y="30" width="34" height="3.5" rx="1.75" fill={`url(#wm-${id})`} />
      <path
        d="M40 31.75h14"
        stroke={`url(#wm-${id})`}
        strokeWidth="3.5"
        strokeLinecap="round"
        opacity="0.4"
      />
    </svg>
  );
}
