import { useEffect, useState } from 'react';
import { useAuthStore } from '@/services/authStore';
import { categoryBudgetRepository, type CategoryBudget } from '@/services/categoryBudgets';

export function useCategoryBudgets() {
  const uid = useAuthStore(s => s.user?.uid);
  const [state, setState] = useState<{ uid?: string; rows: CategoryBudget[]; incomplete: boolean; error: boolean }>({ rows: [], incomplete: true, error: false });
  useEffect(() => {
    setState({ uid, rows: [], incomplete: true, error: false });
    if (!uid) return;
    return categoryBudgetRepository.observe(uid, (rows, incomplete, error) => setState({ uid, rows, incomplete, error }));
  }, [uid]);
  return state.uid === uid ? state : { uid, rows: [], incomplete: true, error: false };
}
