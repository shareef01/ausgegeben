interface AppBrandIconProps {
  size?: number;
  className?: string;
}

const MARK_PATH = 'M256 96 392 416 304 416 256 264 208 416 120 416Z';

/** Minimal flow-mark — matches /icons/icon.svg and generated favicons. */
export function AppBrandIcon({ size = 56, className = '' }: AppBrandIconProps) {
  const gradId = `brand-mark-${size}`;

  return (
    <svg
      className={`app-brand-icon ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 512 512"
      aria-hidden
      role="img"
    >
      <defs>
        <linearGradient id={gradId} x1="128" y1="88" x2="392" y2="420" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#34D399" />
          <stop offset="100%" stopColor="#059669" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="108" fill="#000000" />
      <path fill={`url(#${gradId})`} d={MARK_PATH} />
    </svg>
  );
}
