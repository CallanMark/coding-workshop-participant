import { expect, test } from '@playwright/test';
import {
  expectNoSidewaysScroll, pick, signIn, signOut, unique,
} from './helpers';

// One incident's whole life, across four people, in the real app:
// Eve reports a network problem → Morgan (Workplace Technology manager) assigns Tina →
// Tina starts and resolves it → Eve rates the work → Sam, another employee, can't open it.
test('an incident goes from report to rating, and only the right people can see it', async ({ page }, testInfo) => {
  const title = unique(testInfo, 'Wi-Fi drops at desk');

  await test.step('Eve reports it, picking the place by name', async () => {
    await signIn(page, 'eve@acme.inc');
    await page.goto('/incidents/new');
    await page.getByLabel('Title').fill(title);
    await page.getByLabel('Description').fill('Drops every few minutes since this morning.');
    await pick(page, /Category/, /Network/);
    await pick(page, /Building/, 'HQ Tower');
    await pick(page, /Floor/, 'Floor 1');
    await pick(page, /Seat/, '1-02');
    await expectNoSidewaysScroll(page);
    await page.getByRole('button', { name: 'Report incident' }).click();
    await expect(page.getByText(`Incident "${title}" was reported.`)).toBeVisible();
    await signOut(page);
  });

  let incidentUrl;
  await test.step('Morgan finds it in the team queue and assigns Tina', async () => {
    await signIn(page, 'morgan@acme.inc');
    await page.goto(`/incidents?q=${encodeURIComponent(title)}`);
    await page.getByRole('link', { name: title }).first().click();
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    incidentUrl = page.url();
    await page.getByRole('button', { name: 'Assign', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await pick(page, 'Engineer', /Tina Tech/);
    await dialog.getByRole('button', { name: 'Assign' }).click();
    await expect(page.getByText('Assigned', { exact: true })).toBeVisible();
    await signOut(page);
  });

  await test.step('Tina starts work and resolves it', async () => {
    await signIn(page, 'tina@acme.inc');
    await page.goto(incidentUrl);
    await page.getByRole('button', { name: 'Start work' }).click();
    await expect(page.getByText('Moved to In progress')).toBeVisible();
    await page.getByRole('button', { name: 'Resolve' }).click();
    await expect(page.getByText('Moved to Resolved')).toBeVisible();
    // Tina must never see the reporter's private rating card.
    await expect(page.getByRole('region', { name: 'Private feedback' })).toHaveCount(0);
    await signOut(page);
  });

  await test.step('Eve sees it resolved and rates the work', async () => {
    await signIn(page, 'eve@acme.inc');
    await page.goto(incidentUrl);
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    // Reporters can't change the status themselves.
    await expect(page.getByRole('button', { name: 'Close' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Give feedback' }).click();
    await page.locator('label', { hasText: '5 Stars' }).click(); // the stars are labels over hidden radios
    await page.getByRole('button', { name: 'Save feedback' }).click();
    await expect(page.getByRole('img', { name: 'Rated 5 out of 5' })).toBeVisible();
    await expectNoSidewaysScroll(page);
    await signOut(page);
  });

  await test.step('Sam, another employee, gets "not found"', async () => {
    await signIn(page, 'sam@acme.inc');
    await page.goto(incidentUrl);
    await expect(page.getByText('Incident not found.')).toBeVisible();
  });
});
