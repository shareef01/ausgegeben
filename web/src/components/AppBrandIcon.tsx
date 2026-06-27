import { BRAND_MARK_PATH } from '@/brand/markPath';

interface AppBrandIconProps {
  size?: number;
  className?: string;
  /** Subtle glow + gradient drift on the mark */
  animated?: boolean;
}

/** Minimal flow-mark — matches /icons/icon.svg and generated favicons. */
export function AppBrandIcon({ size = 56, className = '', animated = false }: AppBrandIconProps) {
  const uid = `brand-${size}`;
  const gradId = `${uid}-grad`;
  const glowId = `${uid}-glow`;

  return (
    <svg
      className={`app-brand-icon ${animated ? 'app-brand-icon--live' : ''} ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 512 512"
      aria-hidden
      role="img"
    >
      <defs>
        <linearGradient id={gradId} x1="128" y1="88" x2="392" y2="420" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="var(--color-accent)" />
          <stop offset="100%" stopColor="var(--color-income)" />
        </linearGradient>
        <filter id={glowId} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="12" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <rect width="512" height="512" rx="108" fill="var(--color-background)" />

      {animated ? (
        <>
          <circle
            className="app-brand-icon__ring app-brand-icon__ring--outer"
            cx="256"
            cy="256"
            r="218"
            fill="none"
            stroke={`url(#${gradId})`}
            strokeWidth="3"
            opacity="0.22"
          />
          <circle
            className="app-brand-icon__ring app-brand-icon__ring--inner"
            cx="256"
            cy="256"
            r="188"
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="1.5"
            opacity="0.14"
          />
          <path
            className="app-brand-icon__glow"
            d={BRAND_MARK_PATH}
            fill={`url(#${gradId})`}
            filter={`url(#${glowId})`}
            opacity="0.45"
          />
          <circle className="app-brand-icon__spark" cx="256" cy="118" r="10" fill="var(--color-accent)" opacity="0.9" />
          <path
            className="app-brand-icon__flow"
            d="M256 140 Q280 200 256 260 Q232 320 256 380"
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="4"
            strokeLinecap="round"
            opacity="0.35"
          />
        </>
      ) : null}

      <path className="app-brand-icon__shape" fill={`url(#${gradId})`} d={BRAND_MARK_PATH} />
    </svg>
  );
}
