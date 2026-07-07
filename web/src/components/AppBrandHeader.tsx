import { AppBrandIcon } from '@/components/AppBrandIcon';

interface AppBrandHeaderProps {
  appName: string;
}

export function AppBrandHeader({ appName }: AppBrandHeaderProps) {
  return (
    <div className="app-brand-header">
      <div className="brand-hub brand-hub--compact">
        <AppBrandIcon size={36} className="brand-hub__mark app-brand-icon--live" />
        <h1 className="brand-hub__title">{appName.toLowerCase()}</h1>
      </div>
    </div>
  );
}
