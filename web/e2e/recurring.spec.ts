import {test,expect} from '@playwright/test';
import {en} from '../src/i18n/en';
import {createVerifiedUser,resetAuthEmulator,resetFirestoreEmulator,signIn} from './helpers';
test.beforeEach(async()=>{await resetAuthEmulator();await resetFirestoreEmulator();});
test('Settings recurring controls create, pause, edit and delete without removing records',async({page})=>{
 const email='recurring@example.com',password='correct horse battery staple';await createVerifiedUser(email,password);await signIn(page,email,password);
 await page.getByRole('button',{name:en.navSettings}).click();await page.getByRole('button',{name:en.recurringTitle,exact:true}).click();
 const dialog=page.getByRole('dialog',{name:en.recurringTitle});await expect(dialog).toBeVisible();await dialog.getByRole('button',{name:en.recurringNew}).click();
 await dialog.getByLabel(en.recurringAmount,{exact:true}).fill('15');await dialog.getByLabel(en.recurringNote,{exact:true}).fill('Recurring UI test');
 const start=await dialog.getByLabel(en.recurringStarts,{exact:true}).inputValue();
 await dialog.getByLabel(en.recurringCategory,{exact:true}).selectOption({label:'Subscriptions'});await dialog.getByRole('button',{name:en.actionSave,exact:true}).click();
 const row=dialog.locator('article').filter({hasText:'Recurring UI test'});await expect(row).toBeVisible();await dialog.getByRole('button',{name:en.recurringRefresh}).click();await expect(row).not.toContainText(start);await row.getByRole('button',{name:en.recurringPause,exact:true}).click();await expect(row).toContainText(en.recurringPaused);
 await row.getByRole('button',{name:en.recurringResume,exact:true}).click();await expect(row).toContainText(en.recurringActive);
 await row.getByRole('button',{name:en.recurringEdit,exact:true}).click();await dialog.getByLabel(en.recurringAmount,{exact:true}).fill('17');await dialog.getByRole('button',{name:en.actionSave,exact:true}).click();await expect(row).toContainText('17.00');
 await row.getByRole('button',{name:en.actionDelete,exact:true}).click();const confirm=page.getByRole('alertdialog',{name:en.recurringDelete});await expect(confirm).toBeVisible();await expect(confirm).toContainText(en.recurringDeleteMessage);
 await confirm.getByRole('button',{name:en.actionDelete,exact:true}).click();await expect(row).toHaveCount(0);await dialog.getByRole('button',{name:en.recurringClose}).click();await expect(dialog).toHaveCount(0);await page.getByRole('button',{name:en.navRecord,exact:true}).click();await expect(page.getByText('Recurring UI test',{exact:true})).toBeVisible();
});
test('keyboard escape closes the manager and restores launch-button focus',async({page})=>{const email='keyboard@example.com',password='correct horse battery staple';await createVerifiedUser(email,password);await signIn(page,email,password);await page.getByRole('button',{name:en.navSettings}).click();const launch=page.getByRole('button',{name:en.recurringTitle,exact:true});await launch.click();await expect(page.getByRole('dialog',{name:en.recurringTitle})).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('dialog',{name:en.recurringTitle})).toHaveCount(0);await expect(launch).toBeFocused();});
