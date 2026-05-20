import { expect, test } from '@playwright/test';

const adminUser = process.env.ADMIN_E2E_USERNAME || 'admin';
const adminPass = process.env.ADMIN_E2E_PASSWORD || 'admin123';

async function login(page) {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Admin Login' })).toBeVisible();

  await page.getByPlaceholder('Username').fill(adminUser);
  await page.getByPlaceholder('Password').fill(adminPass);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/dashboard');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
}

test.describe('Admin smoke suite', () => {
  test('login works', async ({ page }) => {
    await login(page);
  });

  test('bookings page loads', async ({ page }) => {
    await login(page);
    await page.goto('/bookings');
    await expect(page.getByRole('heading', { name: 'Bookings' })).toBeVisible();
    await expect(page.locator('.toolbar select').first()).toBeVisible();

    const rows = page.locator('table tbody tr');
    const count = await rows.count();
    if (count > 0) {
      await expect(rows.first()).toBeVisible();
    } else {
      await expect(page.getByText('No bookings found.')).toBeVisible();
    }
  });

  test('payments page loads', async ({ page }) => {
    await login(page);
    await page.goto('/payments');
    await expect(page.getByRole('heading', { name: 'Payments' })).toBeVisible();
    await expect(page.locator('.payments-toolbar select').first()).toBeVisible();

    const rows = page.locator('table tbody tr');
    const count = await rows.count();
    if (count > 0) {
      await expect(rows.first()).toBeVisible();
    } else {
      await expect(page.getByText('No payments found.')).toBeVisible();
    }
  });

  test('complaints page loads', async ({ page }) => {
    await login(page);
    await page.goto('/complaints');
    await expect(page.getByRole('heading', { name: 'Complaints' })).toBeVisible();
    await expect(page.locator('.toolbar select').first()).toBeVisible();

    const rows = page.locator('table tbody tr');
    const count = await rows.count();
    if (count > 0) {
      await expect(rows.first()).toBeVisible();
    } else {
      await expect(page.getByText('No complaints found.')).toBeVisible();
    }
  });
});
