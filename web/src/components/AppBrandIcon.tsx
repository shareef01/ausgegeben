interface AppBrandIconProps {
  size?: number;
  className?: string;
}

/** Official app mark — matches favicon / launcher artwork. */
export function AppBrandIcon({ size = 56, className = '' }: AppBrandIconProps) {
  return (
    <img
      src="/icons/icon-192.png"
      srcSet="/icons/icon-192.png 1x, /icons/icon-512.png 2x"
      width={size}
      height={size}
      alt=""
      aria-hidden
      className={`app-brand-icon ${className}`.trim()}
      draggable={false}
    />
  );
}
