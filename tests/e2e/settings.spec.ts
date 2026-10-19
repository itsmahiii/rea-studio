import { test, expect, _electron as electron } from '@playwright/test';
import path from 'path';
import fs from 'fs';

test('Onboarding Wizard and Settings Modal E2E Flow', async () => {
  const screenshotsDir =
    'C:/Users/itsma/.gemini/antigravity-ide/brain/197714f3-cee5-40b6-9ecc-66a079d4909f/screenshots';
  fs.mkdirSync(screenshotsDir, { recursive: true });

  const tempUserDataDir = path.join(import.meta.dirname, '../../.tmp-settings-test-profile');
  fs.mkdirSync(tempUserDataDir, { recursive: true });

  // Clean any previous test settings to force first-run onboarding
  const settingsFile = path.join(tempUserDataDir, 'rea_settings.json');
  if (fs.existsSync(settingsFile)) {
    fs.unlinkSync(settingsFile);
  }

  const electronApp = await electron.launch({
    args: [
      path.join(import.meta.dirname, '../../dist-electron/index.js'),
      `--user-data-dir=${tempUserDataDir}`,
    ],
    env: {
      ...process.env,
      NODE_ENV: 'production',
    },
  });

  const page = await electronApp.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await page.setViewportSize({ width: 1280, height: 800 });

  // 1. Verify First-Run Wizard is displayed on clean launch
  const wizard = page.locator('[data-testid="first-run-wizard"]');
  await expect(wizard).toBeVisible({ timeout: 10000 });
  await expect(page.locator('text=Welcome to REA Studio')).toBeVisible();
  await expect(page.locator('text=Important Legal & Authorization Notice')).toBeVisible();

  // Continue button must be disabled until legal checkbox is confirmed
  const nextBtn = page.locator('[data-testid="wizard-next-btn"]');
  await expect(nextBtn).toBeDisabled();

  // Check the legal acceptance checkbox
  const legalCheckbox = page.locator('[data-testid="legal-checkbox"]');
  await legalCheckbox.click();
  await expect(nextBtn).toBeEnabled();

  // Advance to Step 2: Model & API Key
  await nextBtn.click();
  await expect(page.locator('text=1. Model Selection')).toBeVisible();
  await expect(page.locator('text=Claude 3.7 Sonnet')).toBeVisible();

  // Advance to Step 3: Runtime & Tool Availability
  await nextBtn.click();
  await expect(page.getByText('Node.js Runtime', { exact: true })).toBeVisible();
  await expect(page.locator('text=REA CLI & MCP Engine')).toBeVisible();

  // Advance to Step 4: Native Analysis Provider
  await nextBtn.click();
  await expect(page.locator('text=Default Native Analysis Provider')).toBeVisible();
  await expect(page.locator('text=Auto-detect Provider')).toBeVisible();

  // Click Complete Setup & Start Analysis
  const finishBtn = page.locator('[data-testid="wizard-finish-btn"]');
  await finishBtn.click();

  // Verify wizard dismisses
  await expect(wizard).not.toBeVisible();

  // 2. Open Settings Modal via header button
  const openSettingsBtn = page.locator('[data-testid="open-settings-btn"]');
  await expect(openSettingsBtn).toBeVisible();
  await openSettingsBtn.click();

  const settingsModal = page.locator('[data-testid="settings-modal"]');
  await expect(settingsModal).toBeVisible();
  await expect(page.locator('text=REA Studio Settings')).toBeVisible();

  // Verify REA Engine tab
  const reaTab = page.locator('[data-testid="tab-rea"]');
  await reaTab.click();
  await expect(page.locator('text=REA Command Path Override')).toBeVisible();
  await expect(page.locator('[data-testid="check-updates-btn"]')).toBeVisible();

  // Verify Privacy tab
  const privacyTab = page.locator('[data-testid="tab-privacy"]');
  await privacyTab.click();
  await expect(page.locator('text=1. Analysis Runs 100% Locally')).toBeVisible();
  await expect(page.locator('text=4. Zero Telemetry & Tracking')).toBeVisible();

  // Verify General tab
  const generalTab = page.locator('[data-testid="tab-general"]');
  await generalTab.click();
  await expect(page.locator('text=Application Theme')).toBeVisible();
  await expect(page.locator('text=Application Data Location')).toBeVisible();
  await expect(page.locator('[data-testid="clear-all-data-btn"]')).toBeVisible();

  // Close Settings Modal
  const closeBtn = page.locator('text=Close');
  await closeBtn.click();
  await expect(settingsModal).not.toBeVisible();

  await electronApp.close();
});
