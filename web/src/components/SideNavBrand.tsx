import { AppBrandIcon } from '@/components/AppBrandIcon';

interface SideNavBrandProps {
  appName: string;
}

export function SideNavBrand({ appName }: SideNavBrandProps) {
  return (
    <div className="side-nav__brand brand-shell">
      <div className="brand-shell__card">
        <AppBrandIcon size={40} className="brand-shell__mark" />
        <p className="brand-shell__name">{appName.toLowerCase()}</p>
      </div>
    </div>
  );
}
