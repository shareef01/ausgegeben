import { AppBrandIcon } from '@/components/AppBrandIcon';

interface SideNavBrandProps {
  appName: string;
}

export function SideNavBrand({ appName }: SideNavBrandProps) {
  return (
    <div className="side-nav__brand brand-lockup">
      <AppBrandIcon size={44} animated className="brand-lockup__mark" />
      <span className="brand-lockup__name">{appName.toLowerCase()}</span>
    </div>
  );
}
