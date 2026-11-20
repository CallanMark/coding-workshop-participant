import { expect, test } from '@playwright/test';
import { expectNoSidewaysScroll, signIn } from './helpers';

// Every role's main pages load, show their heading, and fit the screen at each size.
// A full-page screenshot of each is saved with the results, for checking the layout by eye.
// FIRST_INCIDENT opens the first incident in the user's own list (ids differ in what each role may see).
const FIRST_INCIDENT = 'first-incident';
const TOURS = {
  'eve@acme.inc': ['/incidents/mine', '/incidents', '/incidents/new'],
  'tina@acme.inc': ['/dashboard', '/dashboard/engineers/5', '/incidents/mine', FIRST_INCIDENT],
  'morgan@acme.inc': ['/dashboard', '/incidents'],
  'admin@acme.inc': ['/dashboard', '/admin/engineers', '/admin/facilities'],
};

test('the sign-in and register pages fit the screen', async ({ page }, testInfo) => {
  for (const path of ['/login', '/register']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expectNoSidewaysScroll(page);
    await page.screenshot({ path: testInfo.outputPath(`${path.slice(1)}.png`), fullPage: true });
  }
});

for (const [email, paths] of Object.entries(TOURS)) {
  test(`${email.split('@')[0]}'s pages load and fit the screen`, async ({ page }, testInfo) => {
    await signIn(page, email);
    for (const path of paths) {
      if (path === FIRST_INCIDENT) {
        await page.goto('/incidents');
        await page.locator('main a[href^="/incidents/"]:not([href$="/new"]):not([href$="/mine"])').first().click();
        await expect(page).toHaveURL(/\/incidents\/\d+$/);
      } else {
        await page.goto(path);
      }
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      await expect(page.getByRole('progressbar')).toHaveCount(0); // finished loading
      await expect(page.getByText('Something went wrong')).toHaveCount(0);
      await expectNoSidewaysScroll(page);
      // The top bar stays one compact row at every size (on phones the links are in the menu).
      expect((await page.getByRole('banner').boundingBox()).height).toBeLessThanOrEqual(80);
      const name = `${email.split('@')[0]}${path.replaceAll('/', '-')}.png`;
      await page.screenshot({ path: testInfo.outputPath(name), fullPage: true });
    }
  });
}
