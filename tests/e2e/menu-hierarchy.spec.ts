import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('studenthub-consent', JSON.stringify({ analytics: false, marketing: false }));
    localStorage.setItem('studenthub-tutorial-state', JSON.stringify({ tutorialVersion: 3, introConfirmed: true, status: 'completed', lastCompletedStep: null }));
    localStorage.setItem('studenthub-preference-v4', JSON.stringify({ version: 4, cityId: 'brno', completed: true }));
  });
});

test('hierarchie, celé texty, oba motivy a funkční informační odkazy', async ({ page }, info) => {
  await page.goto('/brno/odpocinek');
  const mobile = info.project.name !== 'desktop-1440';
  async function openMenu() {
    if (mobile) await page.getByRole('button', { name: 'Otevřít nabídku' }).click();
    return mobile ? page.getByRole('dialog', { name: 'Mobilní nabídka' }) : page.locator('.desktop-sidebar');
  }
  let menu = await openMenu();
  const utility = menu.locator('.sidebar-utility:visible');
  await expect(utility).toHaveCount(1);
  await expect(utility.locator('.sidebar-actions button')).toHaveCount(2);
  await expect(utility.getByRole('button', { name: 'Pozvat spolužáka' })).toHaveClass(/button-primary/);
  await expect(utility.getByRole('button', { name: 'Nainstalovat aplikaci' })).toHaveClass(/button-secondary/);
  await expect(utility.locator('.sidebar-helpers')).toHaveText('Změnit městoNávod');
  await expect(utility.locator('.sidebar-information')).toHaveText('O projektuKontaktAdministrace');
  await expect(menu).not.toContainText('Nezávislý projekt');
  for (const theme of ['light', 'dark']) {
    await page.evaluate(value => document.documentElement.dataset.theme = value, theme);
    const boxes = await utility.locator('button, a').evaluateAll(elements => elements.map(el => {
      const rect = el.getBoundingClientRect();
      return { height: rect.height, clipped: el.scrollWidth > el.clientWidth + 1, ellipsis: getComputedStyle(el).textOverflow === 'ellipsis' };
    }));
    expect(boxes.every(box => box.height >= 44 && !box.clipped && !box.ellipsis)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: `artifacts/menu-hierarchy/${info.project.name}-${theme}.png` });
  }
  await expect(utility.getByRole('link', { name: 'Změnit město' })).toHaveAttribute('href', '/');
  await expect(utility.getByRole('button', { name: 'Návod' })).toHaveCount(1);
  for (const [label, path] of [['O projektu', '/o-projektu'], ['Kontakt', '/kontakt'], ['Administrace', '/admin']]) {
    const link = menu.getByRole('link', { name: label, exact: true });
    await expect(link).toHaveCount(1);
    await expect(link).toHaveAttribute('href', path);
    await link.click();
    await expect(page).toHaveURL(new RegExp(path));
    if (mobile) await expect(page.getByRole('dialog', { name: 'Mobilní nabídka' })).not.toBeVisible();
    await page.goto('/brno/odpocinek');
    menu = await openMenu();
  }
});

test('instalace: skutečná událost, nainstalovaný stav a návod bez nabídky', async ({ page }, info) => {
  await page.goto('/brno/odpocinek');
  const mobile = info.project.name !== 'desktop-1440';
  if (mobile) await page.getByRole('button', { name: 'Otevřít nabídku' }).click();
  await page.locator('.sidebar-utility:visible').getByRole('button', { name: 'Nainstalovat aplikaci' }).click();
  const guide = page.getByRole('dialog').filter({ hasText: 'Nainstalovat StudentHub' });
  await expect(guide).toBeVisible();
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt');
    Object.assign(event, { prompt: async () => { document.documentElement.dataset.installPrompted = 'true'; }, userChoice: Promise.resolve({ outcome: 'accepted' }) });
    window.dispatchEvent(event);
  });
  if (mobile) await page.getByRole('button', { name: 'Otevřít nabídku' }).click();
  await page.locator('.sidebar-utility:visible').getByRole('button', { name: 'Nainstalovat aplikaci' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-install-prompted', 'true');
  if (mobile) await page.getByRole('button', { name: 'Otevřít nabídku' }).click();
  const installed = page.locator('.sidebar-utility:visible').getByRole('button', { name: 'Aplikace je nainstalovaná' });
  await expect(installed).toBeDisabled();
  await expect(installed).toHaveText('Aplikace je nainstalovaná');
});

test('pomocné odkazy spustí návod a výběr města', async ({ page }, info) => {
  await page.goto('/brno/odpocinek');
  const mobile = info.project.name !== 'desktop-1440';
  if (mobile) await page.getByRole('button', { name: 'Otevřít nabídku' }).click();
  await page.locator('.sidebar-utility:visible').getByRole('button', { name: 'Návod', exact: true }).click();
  await expect(page.getByTestId('guided-tutorial')).toBeVisible();
  await expect(page.getByTestId('guided-tutorial')).toHaveAttribute('aria-busy', 'false');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('guided-tutorial')).not.toBeVisible();
  if (mobile) await page.getByRole('button', { name: 'Otevřít nabídku' }).click();
  await page.locator('.sidebar-utility:visible').getByRole('link', { name: 'Změnit město' }).click();
  await expect(page).toHaveURL(/\/$/);
  if (mobile) await expect(page.getByRole('dialog', { name: 'Mobilní nabídka' })).not.toBeVisible();
});
