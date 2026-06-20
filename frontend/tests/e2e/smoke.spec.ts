import { test, expect } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL;

test.describe('smoke', () => {
  test.skip(!baseURL, 'PLAYWRIGHT_BASE_URL not set');

  test('loads terminal UI', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('kibo — sui testnet', { exact: false })).toBeVisible();
    await expect(page.locator('.terminal-root')).toBeVisible();
  });
});
