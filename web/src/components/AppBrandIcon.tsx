import { useId } from 'react';

interface AppBrandIconProps {
  size?: number;
  className?: string;
}

export function AppBrandIcon({ size = 64, className = '' }: AppBrandIconProps) {
  const id = useId().replace(/:/g, '');

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
      <defs>
        <linearGradient id={`logo-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--color-income)" />
          <stop offset="100%" stopColor="var(--color-income-light, var(--color-income))" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" rx="20" fill="color-mix(in srgb, var(--color-accent) 10%, transparent)" stroke="var(--color-accent)" strokeOpacity="0.15" strokeWidth="1.5" />
      <path fill={`url(#logo-${id})`} d="M50 22 L74 76 L62 76 L50 56 L38 76 L26 76 Z M39 62 L61 62 L61 69 L39 69 Z" />
    </svg>
  );
}
