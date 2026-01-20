import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from '@playwright/test';

const SCREENSHOTS_DIR = join(process.cwd(), 'screenshots');

// Ensure screenshots directory exists
mkdirSync(SCREENSHOTS_DIR, { recursive: true });

test.describe('Three-Column Layout Screenshots', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to app
    await page.goto('http://localhost:5173');
    // Wait for initial load
    await page.waitForLoadState('networkidle');
  });

  test('1. Sidebar with search icon', async ({ page }) => {
    // Wait for sidebar to be visible
    await page.waitForSelector('h2:has-text("Plans")', { timeout: 10000 });

    // Take screenshot of just the sidebar
    const sidebar = page
      .locator('aside, [role="complementary"], .flex.flex-col.h-full.bg-surface')
      .first();
    await sidebar.screenshot({
      path: join(SCREENSHOTS_DIR, '1-sidebar-with-search-icon.png'),
    });
  });

  test('2. Inbox view (empty)', async ({ page }) => {
    // Navigate to inbox
    await page.goto('http://localhost:5173/inbox');
    await page.waitForLoadState('networkidle');

    // Wait for inbox zero message or inbox content
    await page.waitForSelector('text=Inbox', { timeout: 10000 });

    // Take full page screenshot
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, '2-inbox-empty.png'),
      fullPage: true,
    });
  });

  test('3. Inbox view with items selected', async ({ page }) => {
    // This test assumes there are plans in the inbox
    // If inbox is empty, this will show the empty state
    await page.goto('http://localhost:5173/inbox');
    await page.waitForLoadState('networkidle');

    // Try to click the first plan if it exists
    const firstPlan = page.locator('[role="option"]').first();
    const planExists = (await firstPlan.count()) > 0;

    if (planExists) {
      await firstPlan.click();
      // Wait for detail panel to load
      await page.waitForTimeout(1000);
    }

    await page.screenshot({
      path: join(SCREENSHOTS_DIR, '3-inbox-with-selection.png'),
      fullPage: true,
    });
  });

  test('4. Board view', async ({ page }) => {
    await page.goto('http://localhost:5173/board');
    await page.waitForLoadState('networkidle');

    // Wait for board columns to render
    await page.waitForSelector('text=Draft', { timeout: 10000 });

    await page.screenshot({
      path: join(SCREENSHOTS_DIR, '4-board-view.png'),
      fullPage: true,
    });
  });

  test('5. Archive view', async ({ page }) => {
    await page.goto('http://localhost:5173/archive');
    await page.waitForLoadState('networkidle');

    // Wait for archive header
    await page.waitForSelector('text=Archive', { timeout: 10000 });

    await page.screenshot({
      path: join(SCREENSHOTS_DIR, '5-archive-view.png'),
      fullPage: true,
    });
  });

  test('6. Search results', async ({ page }) => {
    await page.goto('http://localhost:5173/search');
    await page.waitForLoadState('networkidle');

    // Wait for search page to load
    await page.waitForSelector('text=Search', { timeout: 10000 });

    // Type a search query if there's a search input
    const searchInput = page.locator('input[placeholder*="Search"]').first();
    const inputExists = (await searchInput.count()) > 0;

    if (inputExists) {
      await searchInput.fill('test');
      await page.waitForTimeout(500);
    }

    await page.screenshot({
      path: join(SCREENSHOTS_DIR, '6-search-results.png'),
      fullPage: true,
    });
  });

  test('7. Search with selection', async ({ page }) => {
    await page.goto('http://localhost:5173/search');
    await page.waitForLoadState('networkidle');

    // Type a search query
    const searchInput = page.locator('input[placeholder*="Search"]').first();
    const inputExists = (await searchInput.count()) > 0;

    if (inputExists) {
      await searchInput.fill('test');
      await page.waitForTimeout(500);

      // Click first result if it exists
      const firstResult = page.locator('[role="option"]').first();
      const resultExists = (await firstResult.count()) > 0;

      if (resultExists) {
        await firstResult.click();
        await page.waitForTimeout(1000);
      }
    }

    await page.screenshot({
      path: join(SCREENSHOTS_DIR, '7-search-with-selection.png'),
      fullPage: true,
    });
  });
});
