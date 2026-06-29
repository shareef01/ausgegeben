import { AppBrandIcon } from '@/components/AppBrandIcon';

interface SideNavBrandProps {
  appName: string;
}

export function SideNavBrand({ appName }: SideNavBrandProps) {
  return (
    <div className="side-nav__brand brand-shell">
      <AppBrandIcon size={48} className="brand-shell__mark" />
      <h1 className="brand-shell__name">{appName.toLowerCase()}</h1>
      <p className="brand-shell__tagline">track spending</p>
    </div>
  );
}
