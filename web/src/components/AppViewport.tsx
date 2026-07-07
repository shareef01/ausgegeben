import { type ReactNode, useEffect } from 'react';

interface AppViewportProps {
  children: ReactNode;
  /** Auth, onboarding, and boot screens scroll the page on desktop instead of the in-card shell. */
  scroll?: boolean;
  className?: string;
}

export function AppViewport({ children, scroll = false, className }: AppViewportProps) {
  useEffect(() => {
    document.body.classList.toggle('body--shell-scroll', scroll);
    return () => document.body.classList.remove('body--shell-scroll');
  }, [scroll]);

  const classes = ['app-viewport', scroll ? 'app-viewport--scroll' : '', className].filter(Boolean).join(' ');

  return <div className={classes}>{children}</div>;
}
