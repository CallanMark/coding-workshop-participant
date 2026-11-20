import { expect } from '@playwright/test';

/** The demo accounts' password: Password123! locally; set E2E_PASSWORD for anywhere else (never commit it). */
export const PASSWORD = process.env.E2E_PASSWORD || 'Password123!';

/** A value unique to this run and screen size, so runs and projects never collide. */
export const unique = (testInfo, label) => `${label} ${testInfo.project.name} ${Date.now()}`;

/** Sign in through the real form and wait to leave the sign-in page. */
export async function signIn(page, email, password = PASSWORD) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}

/** On phones and tablets the links live behind the menu button: open it if it's there. */
async function openMenuIfPhone(page) {
  if (await page.getByRole('region', { name: 'Menu' }).isVisible()) return; // already open
  const menu = page.getByRole('button', { name: 'Open menu' });
  if (await menu.isVisible()) {
    await menu.click();
    await expect(page.getByRole('region', { name: 'Menu' })).toBeVisible();
  }
}

/** The main navigation: the top bar's links, or the phone menu's (opened first). */
export async function mainNav(page) {
  await openMenuIfPhone(page);
  return page.getByRole('navigation', { name: /^(Main|Menu links)$/ });
}

/** Sign out from the top bar (or the phone menu). */
export async function signOut(page) {
  await openMenuIfPhone(page);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
}

/** Pick an option in an MUI select by its label, once it's enabled (options load from the server). */
export async function pick(page, label, option) {
  const select = page.getByRole('combobox', { name: label });
  await expect(select).not.toHaveAttribute('aria-disabled', 'true');
  await select.click();
  await page.getByRole('listbox').getByRole('option', { name: option }).click();
  await expect(page.getByRole('listbox')).toBeHidden();
}

/** Fail if the page is wider than the screen (a sideways scroll bar on phones). */
export async function expectNoSidewaysScroll(page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'page is wider than the screen').toBeLessThanOrEqual(0);
}
