import { expect, test } from '@playwright/test';
import { en } from '../src/i18n/en';
import { createVerifiedUser, resetAuthEmulator, resetFirestoreEmulator, signIn } from './helpers';

test.beforeEach(async () => { await resetAuthEmulator(); await resetFirestoreEmulator(); });
test.use({ reducedMotion: 'no-preference' });

test('budget cards separate actual from upcoming spending', async ({ page }) => {
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  // The split exists only while the current month still has a future day. The parity
  // fixtures cover the boundary deterministically; this browser check needs a real date.
  test.skip(now.getDate() === lastDay, 'today is the last day of the month: no upcoming day remains');

  await createVerifiedUser('budget-split@example.com', 'correct horse battery staple');
  await signIn(page, 'budget-split@example.com', 'correct horse battery staple');

  const categoryName = await page.evaluate(async ({ year, month, day }) => {
    const repoPath = '/src/repositories/expenseRepository.ts';
    const budgetPath = '/src/services/categoryBudgets.ts';
    const prefsPath = '/src/services/preferencesStore.ts';
    const authPath = '/src/services/authStore.ts';
    const { expenseRepository: repo } = await import(/* @vite-ignore */ repoPath);
    const { categoryBudgetRepository: budgets } = await import(/* @vite-ignore */ budgetPath);
    const { usePreferencesStore } = await import(/* @vite-ignore */ prefsPath);
    const { useAuthStore } = await import(/* @vite-ignore */ authPath);
    await repo.ensureSeeded();
    const cat = (await repo.getAllCategories()).find(
      (c: { transactionType: string }) => c.transactionType === 'expense',
    );
    const today = new Date(year, month, day, 12);
    const upcoming = new Date(year, month, day + 1, 12);
    await repo.insertExpense({
      amount: 30,
      dateMillis: today.getTime(),
      categoryId: cat.id,
      note: 'actual spend',
      transactionType: 'expense',
    });
    await repo.insertExpense({
      amount: 20,
      dateMillis: upcoming.getTime(),
      categoryId: cat.id,
      note: 'planned spend',
      transactionType: 'expense',
    });
    await budgets.save(
      useAuthStore.getState().user.uid,
      { categoryId: cat.id, monthlyLimit: 40, warningThresholdPercent: 80, updatedAt: Date.now() },
      cat.id,
      null,
    );
    usePreferencesStore.getState().setMonthlyBudget(40);
    return cat.name;
  }, { year: now.getFullYear(), month: now.getMonth(), day: now.getDate() });

  // Record: the global bar stays actual-spend / budget and discloses the upcoming row.
  const budgetBar = page.locator('.budget-bar');
  await expect(budgetBar).toContainText('€30.00');
  await expect(budgetBar).toContainText('€40.00');
  const upcomingLine = budgetBar.locator('.budget-bar__upcoming');
  await expect(upcomingLine).toContainText(en.budgetUpcomingAnticipated.split('{')[0].trim());
  await expect(upcomingLine).toContainText('€20.00');
  await expect(upcomingLine).toContainText('€50.00');
  // Actual spend is within the limit, but the anticipated total is over: amber
  // "projected", not red "over".
  const projectedLine = budgetBar.locator('.budget-bar__projected');
  await expect(projectedLine).toContainText(en.budgetProjectedExceed.split('{')[0].trim());
  await expect(projectedLine).toContainText('€10.00');

  // Insights: the card labels the anticipated total and separates spent so far.
  await page.getByRole('button', { name: en.navInsights, exact: true }).click();
  const card = page.getByRole('region', { name: en.categoryBudgetTitle });
  await expect(card).toContainText(categoryName);
  await expect(card).toContainText(en.categoryBudgetAnticipated);
  await expect(card).toContainText(en.categoryBudgetProjected);
  await expect(card.locator('.category-budget-state--projected')).toBeVisible();
  await expect(card.getByRole('progressbar', { name: categoryName })).toHaveAttribute('data-state', 'projected');
  const split = card.locator('.category-budget-split');
  await expect(split).toContainText(en.categoryBudgetSpentToDate);
  await expect(split).toContainText('€30.00');
  await expect(split).toContainText(en.categoryBudgetUpcoming);
  await expect(split).toContainText('€20.00');
});

test('category budget management and current-month warning progress', async ({ page }) => {
  await createVerifiedUser('budgets@example.com', 'correct horse battery staple');
  await createVerifiedUser('budgets-b@example.com', 'correct horse battery staple');
  await signIn(page, 'budgets@example.com', 'correct horse battery staple');
  const name = await page.evaluate(async () => {
    const path = '/src/repositories/expenseRepository.ts';
    const { expenseRepository: repo } = await import(/* @vite-ignore */ path);
    await repo.ensureSeeded();
    const cat = (await repo.getAllCategories()).find((c: { transactionType: string }) => c.transactionType === 'expense');
    await repo.insertExpense({ amount: 80, dateMillis: Date.now(), categoryId: cat.id, note: 'Budget groceries', transactionType: 'expense' });
    return cat.name;
  });
  await page.evaluate(async () => {
    const repoPath = '/src/repositories/expenseRepository.ts';
    const budgetPath = '/src/services/categoryBudgets.ts';
    const { expenseRepository: repo } = await import(/* @vite-ignore */ repoPath);
    const { categoryBudgetRepository: budgets } = await import(/* @vite-ignore */ budgetPath);
    const originalRecords = repo.onRecordExpenses.bind(repo);
    const originalObserve = budgets.observe.bind(budgets);
    const metrics = { recordsCalls: 0, budgetCalls: 0, budgetActive: 0 };
    (window as unknown as { budgetMetrics: typeof metrics }).budgetMetrics = metrics;
    repo.onRecordExpenses = (...args: Parameters<typeof originalRecords>) => { metrics.recordsCalls++; return originalRecords(...args); };
    budgets.observe = (...args: Parameters<typeof originalObserve>) => {
      metrics.budgetCalls++; metrics.budgetActive++;
      const stop = originalObserve(...args);
      return () => { metrics.budgetActive--; stop(); };
    };
  });
  await page.getByRole('button', { name: en.navSettings, exact: true }).click();
  const manager = page.getByRole('region', { name: en.categoryBudgetTitle });
  // Pin the tab animation's final transform: fixed modals must remain viewport-bound.
  await page.locator('.tab-panel--active').evaluate(node => { (node as HTMLElement).style.animation = 'none'; (node as HTMLElement).style.transform = 'translate3d(0,0,0)'; });
  await page.getByRole('button', { name: en.settingsSignOut, exact: true }).click();
  const overlayBounds = await page.locator('.overlay--confirm').boundingBox();
  expect(Math.round(overlayBounds!.height)).toBe(page.viewportSize()!.height);
  await expect(page.getByRole('alertdialog').getByRole('button', { name: en.settingsSignOut })).toBeInViewport();
  await page.getByRole('alertdialog').getByRole('button', { name: en.actionCancel }).click();

  await manager.getByRole('button', { name, exact: true }).click();
  await manager.getByLabel(en.categoryBudgetLimit).fill('100.001');
  await expect(manager.getByRole('button', { name: en.actionSave, exact: true })).toBeDisabled();
  await manager.getByLabel(en.categoryBudgetLimit).fill('100');
  await manager.getByLabel(en.categoryBudgetThreshold).fill('90');
  await manager.getByRole('button', { name: en.actionSave, exact: true }).click();
  await expect(manager.getByLabel(en.categoryBudgetLimit)).toHaveCount(0);
  await expect(manager).toContainText('90%');
  await page.getByRole('button', { name: en.navInsights, exact: true }).click();
  const progress = page.getByRole('region', { name: en.categoryBudgetTitle });
  await expect(progress.getByRole('progressbar', { name })).toHaveAttribute('value', '80');
  await expect(progress).toContainText(en.categoryBudgetNormal);
  await expect(progress.getByRole('progressbar', { name })).toHaveAttribute('max', '100');
  const listenerBaseline = await page.evaluate(() => (window as unknown as { budgetMetrics: { recordsCalls: number; budgetCalls: number; budgetActive: number } }).budgetMetrics);
  expect(listenerBaseline.budgetActive).toBe(2);
  await page.getByRole('button', { name: en.navSettings, exact: true }).click();
  await manager.getByRole('button', { name: new RegExp(name) }).click();
  await manager.getByLabel(en.categoryBudgetThreshold).fill('80');
  await page.evaluate(async () => {
    const budgetPath='/src/services/categoryBudgets.ts', authPath='/src/services/authStore.ts';
    const {categoryBudgetRepository:repo}=await import(/* @vite-ignore */ budgetPath);
    const {useAuthStore}=await import(/* @vite-ignore */ authPath);
    const uid=useAuthStore.getState().user.uid, b=(await repo.getAll(uid))[0];
    await repo.save(uid,{...b,monthlyLimit:120},b.categoryId,b.updatedAt);
  });
  await manager.getByRole('button', { name: en.actionSave, exact: true }).click();
  await expect(manager.getByRole('alert')).toHaveText(en.categoryBudgetConflict);
  await manager.getByRole('button', { name: en.actionCancel, exact: true }).click();
  await manager.getByRole('button', { name: new RegExp(name) }).click();
  // Prefilled in the input format for the default EUR currency, like the global budget.
  await expect(manager.getByLabel(en.categoryBudgetLimit)).toHaveValue('120.00');
  await manager.getByLabel(en.categoryBudgetLimit).fill('100');
  await manager.getByLabel(en.categoryBudgetThreshold).fill('80');
  await manager.getByRole('button', { name: en.actionSave, exact: true }).click();
  await expect(manager.getByLabel(en.categoryBudgetLimit)).toHaveCount(0);
  await page.getByRole('button', { name: en.navInsights, exact: true }).click();
  await expect(progress).toContainText(en.categoryBudgetWarning);
  await page.getByRole('button', { name: en.navSettings, exact: true }).click();
  await manager.getByRole('button', { name: new RegExp(name) }).click();
  await manager.getByRole('button', { name: en.categoryBudgetRemove }).click();
  await expect(manager).toContainText(en.categoryBudgetEmpty);
  await page.getByRole('button', { name: en.navInsights, exact: true }).click();
  await expect(progress).toContainText(en.categoryBudgetEmpty);
  expect(await page.evaluate(() => (window as unknown as { budgetMetrics: unknown }).budgetMetrics)).toEqual(listenerBaseline);
  await progress.getByRole('button', { name: en.categoryBudgetTitle }).click();
  await expect(manager).toBeVisible();
  await manager.getByRole('button', { name, exact: true }).click();
  await manager.getByLabel(en.categoryBudgetLimit).fill('100');
  await manager.getByRole('button', { name: en.actionSave, exact: true }).click();
  await expect(manager.getByLabel(en.categoryBudgetLimit)).toHaveCount(0);
  await page.getByRole('button', { name: en.settingsSignOut, exact: true }).click();
  const signOutButton = page.getByRole('alertdialog').getByRole('button', { name: en.settingsSignOut });
  await expect(signOutButton).toBeInViewport();
  await signOutButton.click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { budgetMetrics: { budgetActive: number } }).budgetMetrics.budgetActive)).toBe(0);
  await page.locator('#auth-email').fill('budgets-b@example.com');
  await page.locator('#auth-password').fill('correct horse battery staple');
  await page.locator('form button[type="submit"]').click();
  await page.getByRole('button', { name: en.onboardingSkip }).click();
  await page.getByRole('button', { name: en.navInsights, exact: true }).click();
  await expect(progress).toContainText(en.categoryBudgetEmpty);
  await expect(progress.getByRole('progressbar')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (window as unknown as { budgetMetrics: { budgetActive: number } }).budgetMetrics.budgetActive)).toBe(1);
});
