import { expect, test } from './support/test';

test('an administrator creates a user and deletes it again', async ({ page }) => {
  await page.goto('/admin/users');

  await page.getByRole('button', { name: 'Create user' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill('Managed E2E');
  await dialog.getByLabel('Email address').fill('managed-e2e@melody.test');
  await dialog.getByLabel('Password', { exact: true }).fill('managed-e2e-password');
  // An unconfirmed password is one typo away from an account nobody can sign in to.
  await expect(dialog.getByRole('button', { name: 'Create', exact: true })).toBeDisabled();
  await dialog.getByLabel('Confirm password').fill('managed-e2e-password');
  await dialog.getByRole('button', { name: 'Create', exact: true }).click();

  await expect(page.getByText('Managed E2E has been created')).toBeVisible();
  const row = page.getByRole('row', { name: /managed-e2e@melody\.test/ });
  await expect(row).toBeVisible();

  // The suite shares one server and one database, so the account is handed
  // back through the same screens rather than left behind for the next test.
  await row.getByRole('button', { name: 'Delete' }).click();
  const confirm = page.getByRole('dialog');
  await expect(confirm.getByText('Delete Managed E2E?')).toBeVisible();
  await confirm.getByRole('button', { name: 'Delete' }).click();

  await expect(page.getByText('Managed E2E has been deleted')).toBeVisible();
  await expect(row).toHaveCount(0);
});
