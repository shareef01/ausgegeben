import { beforeEach } from 'vitest';
import { usePreferencesStore } from '@/services/preferencesStore';

beforeEach(() => {
  usePreferencesStore.setState({ locale: 'en' });
});
