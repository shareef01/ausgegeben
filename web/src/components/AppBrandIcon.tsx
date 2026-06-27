interface AppBrandIconProps {
  size?: number;
  className?: string;
}

/** Vector app mark — crisp at any DPI, matches launcher artwork. */
export function AppBrandIcon({ size = 56, className = '' }: AppBrandIconProps) {
  return (
    <svg
      className={`app-brand-icon ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 512 512"
      aria-hidden
      role="img"
    >
      <rect width="512" height="512" rx="112" fill="#0C0C0E" />
      <rect x="56" y="56" width="400" height="400" rx="88" fill="#157A3A" />
      <text
        x="256"
        y="318"
        textAnchor="middle"
        fontSize="220"
        fill="#FFFFFF"
        fontFamily="Inter, system-ui, -apple-system, sans-serif"
        fontWeight="700"
      >
        A
      </text>
    </svg>
  );
}
