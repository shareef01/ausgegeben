interface AppBrandIconProps {
  size?: number;
  className?: string;
}

/** Minimal geometric "A" brand mark. */
export function AppBrandIcon({ size = 64, className = '' }: AppBrandIconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      aria-hidden
      role="img"
    >
      <rect width="100" height="100" rx="22" fill="#0C0C0E" />
      <path
        fill="#10B981"
        d="M50 16 L74 82 L64 82 L50 56 L36 82 L26 82 Z
           M38 62 L62 62 L62 70 L38 70 Z"
      />
    </svg>
  );
}
