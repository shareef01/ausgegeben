interface AppBrandIconProps {
  size?: number;
  className?: string;
}

/**
 * Flagship "Geometric Apex" Branding Icon.
 * Matches Android AppBrandIcon.kt and ic_launcher_foreground.xml
 */
export function AppBrandIcon({ size = 64, className = '' }: AppBrandIconProps) {
  const gradId = `apex-grad-${size}`;
  const glowId = `halo-glow-${size}`;

  return (
    <div className={`app-brand-icon-container app-brand-breathing ${className}`.trim()} style={{ width: size, height: size }}>
      <svg
        className="app-brand-icon-svg"
        width="100%"
        height="100%"
        viewBox="0 0 100 100"
        aria-hidden
        role="img"
      >
        <defs>
          <linearGradient id={gradId} x1="20" y1="20" x2="80" y2="90" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#6EE7B7" />
            <stop offset="50%" stopColor="#10B981" />
            <stop offset="100%" stopColor="#065F46" />
          </linearGradient>
          <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feColorMatrix type="matrix" values="0 0 0 0 0.0627451   0 0 0 0 0.72549   0 0 0 0 0.505882  0 0 0 0.4 0" />
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Outer Halo */}
        <circle cx="50" cy="50" r="45" fill="#10B981" fillOpacity="0.18" filter={`url(#${glowId})`} />

        {/* Obsidian Base */}
        <rect x="10" y="10" width="80" height="80" rx="25.6" fill="#0D0D10" />

        {/* Specular Border */}
        <rect
          x="10" y="10" width="80" height="80" rx="25.6"
          fill="none"
          stroke="white"
          strokeOpacity="0.15"
          strokeWidth="0.8"
        />

        {/* Geometric Apex Mark */}
        {/* Normalized from ic_launcher_foreground.xml: M54,20 L82,88 L64,88 L54,56 L44,88 L26,88 Z */}
        <path
          d="M50 22 L72 82 L60 82 L50 56 L40 82 L28 82 Z"
          fill={`url(#${gradId})`}
        />

        {/* Apex Spark */}
        <circle cx="50" cy="24" r="2.5" fill="white" />
      </svg>
    </div>
  );
}
