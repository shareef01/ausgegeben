import { getFirebaseFirestore } from '@/services/firebase';
import { useAuthStore } from '@/services/authStore';

export function isCloudSyncActive(): boolean {
  const { user } = useAuthStore.getState();
  return Boolean(user && getFirebaseFirestore());
}
