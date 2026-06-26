import { getFirebaseFirestore } from '@/services/firebase';
import { useAuthStore } from '@/services/authStore';
import { usePreferencesStore } from '@/services/preferencesStore';

export function isCloudSyncActive(): boolean {
  const { user } = useAuthStore.getState();
  const { storageMode } = usePreferencesStore.getState();
  return Boolean(user && storageMode === 'cloud' && getFirebaseFirestore());
}
