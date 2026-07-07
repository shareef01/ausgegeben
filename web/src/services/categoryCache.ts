import type { Category } from '@/models/types';
import { expenseRepository } from '@/repositories/expenseRepository';

let categories: Category[] = [];
let loaded = false;
let inflight: Promise<Category[]> | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

export function getCachedCategories(): Category[] {
  return categories;
}

export function isCategoryCacheReady(): boolean {
  return loaded && categories.length > 0;
}

export function setCategoryCache(next: Category[]): void {
  categories = next;
  loaded = next.length > 0;
}

export function invalidateCategoryCache(): void {
  categories = [];
  loaded = false;
  inflight = null;
}

export async function preloadCategories(): Promise<Category[]> {
  if (loaded && categories.length > 0) return categories;
  if (inflight) return inflight;
  inflight = expenseRepository.getAllCategories()
    .then((cats) => {
      categories = cats;
      loaded = cats.length > 0;
      inflight = null;
      return cats;
    })
    .catch((error) => {
      inflight = null;
      throw error;
    });
  return inflight;
}

export async function refreshCategoryCache(): Promise<Category[]> {
  const cats = await expenseRepository.getAllCategories();
  setCategoryCache(cats);
  return cats;
}

if (typeof window !== 'undefined') {
  window.addEventListener('ausgegeben:data-changed', () => {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      void refreshCategoryCache().catch(() => {});
    }, 80);
  });
}
