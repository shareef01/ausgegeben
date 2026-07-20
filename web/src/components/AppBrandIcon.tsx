import { useId } from 'react';

interface AppBrandIconProps {
  size?: number;
  className?: string;
}

/** Geometric “A” mark — mirrors Android AppBrandIcon. */
export function AppBrandIcon({ size = 64, className = '' }: AppBrandIconProps) {
  const id = useId().replace(/:/g, '');

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid meet"
      fill="none"
      aria-hidden
      role="img"
    >
      <defs>
        <clipPath id={`plate-${id}`}>
          <rect width="100" height="100" rx="22" />
        </clipPath>
      </defs>
      <rect
        width="100"
        height="100"
        rx="22"
        fill="var(--color-surface-variant)"
        stroke="var(--surface-border)"
        strokeWidth="1"
      />
      <g clipPath={`url(#plate-${id})`}>
        {/* A letterform — same proportions as Android Canvas mark */}
        <path
          fill="var(--color-income)"
          d="M50 18 L79 82 H64.5 L50 48 L35.5 82 H21 Z"
        />
        <rect x="34" y="58" width="32" height="8" rx="1" fill="var(--color-income)" />
      </g>
    </svg>
  );
}
