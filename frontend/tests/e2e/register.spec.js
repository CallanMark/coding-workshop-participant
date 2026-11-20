import { expect, test } from '@playwright/test';
import {
  expectNoSidewaysScroll, mainNav, signIn, signOut,
} from './helpers';

test.describe('registering as an employee', () => {
  test('a new employee signs up, lands on their incidents and can sign in again', async ({ page }, testInfo) => {
    const email = `e2e.${testInfo.project.name}.${Date.now()}@acme.inc`;
    const password = 'Welcome-2-ACME';

    await page.goto('/login');
    await page.getByRole('link', { name: 'Create an account' }).click();
    await expect(page.getByRole('heading', { name: 'Create an account' })).toBeVisible();
    await expectNoSidewaysScroll(page);

    await page.getByLabel('Full name').fill('Erin Endtoend');
    await page.getByLabel('Work email').fill(email);
    await page.getByLabel('Password', { exact: false }).first().fill(password);
    await page.getByLabel('Confirm password').fill(password);
    await page.getByRole('button', { name: 'Create account' }).click();

    // Signed in as an employee: their own incidents, and no staff-only pages in the menu.
    await expect(page).toHaveURL(/\/incidents\/mine$/);
    await expect(page.getByText('Reported by or assigned to Erin Endtoend.')).toBeVisible();
    const nav = await mainNav(page);
    await expect(nav.getByRole('link', { name: 'My incidents' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Dashboard' })).toHaveCount(0);

    await signOut(page);
    await signIn(page, email, password);
    await expect(page).toHaveURL(/\/incidents\/mine$/);
  });

  test('only @acme.inc emails, and an email can only be used once', async ({ page }) => {
    await page.goto('/register');
    await page.getByLabel('Full name').fill('Eve Again');
    await page.getByLabel('Work email').fill('eve@gmail.com');
    await page.getByLabel('Password', { exact: false }).first().fill('Password123!');
    await page.getByLabel('Confirm password').fill('Password123!');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByText('Use your @acme.inc email address')).toBeVisible();

    await page.getByLabel('Work email').fill('eve@acme.inc'); // a seeded account
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByText('An account with this email already exists')).toBeVisible();
    await expect(page).toHaveURL(/\/register$/);
  });
});
