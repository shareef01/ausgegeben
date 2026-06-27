interface BrandInitialProps {
  letter: string;
  className?: string;
}

/** Small first-letter accent beside the app icon in the sidebar. */
export function BrandInitial({ letter, className = '' }: BrandInitialProps) {
  if (!letter) return null;

  return (
    <span className={`brand-initial ${className}`.trim()} aria-hidden>
      {letter.toUpperCase()}
    </span>
  );
}
