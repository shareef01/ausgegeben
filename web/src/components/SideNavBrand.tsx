import { AppBrandIcon } from '@/components/AppBrandIcon';

interface SideNavBrandProps {
  appName: string;
}

export function SideNavBrand({ appName }: SideNavBrandProps) {
  return (
    <div className="side-nav__brand">
      <div className="brand-hub">
        <AppBrandIcon size={40} className="brand-hub__mark" />
        <h1 className="brand-hub__title">{appName.toLowerCase()}</h1>
      </div>
    </div>
  );
}
