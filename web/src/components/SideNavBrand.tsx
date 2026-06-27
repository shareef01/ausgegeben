import { AppBrandIcon } from '@/components/AppBrandIcon';
import { BrandWordmark } from '@/components/BrandWordmark';

interface SideNavBrandProps {
  appName: string;
}

export function SideNavBrand({ appName }: SideNavBrandProps) {
  return (
    <div className="side-nav__brand brand-lockup">
      <AppBrandIcon size={40} animated className="brand-lockup__mark" />
      <BrandWordmark text={appName} className="brand-lockup__wordmark" />
    </div>
  );
}
