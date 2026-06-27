import { AppBrandIcon } from '@/components/AppBrandIcon';
import { BrandInitial } from '@/components/BrandInitial';

interface SideNavBrandProps {
  appName: string;
}

export function SideNavBrand({ appName }: SideNavBrandProps) {
  const initial = appName[0] ?? '';

  return (
    <div className="side-nav__brand brand-lockup" aria-label={appName}>
      <AppBrandIcon size={38} animated className="brand-lockup__mark" />
      <BrandInitial letter={initial} />
    </div>
  );
}
