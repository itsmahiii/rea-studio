import { test, expect, _electron as electron } from '@playwright/test';
import path from 'path';
import fs from 'fs';

test('Targets Pane: Add Target, Electron Detection, Readiness Checklist, and Investigation Flow', async () => {
  const screenshotsDir =
    'C:/Users/itsma/.gemini/antigravity-ide/brain/197714f3-cee5-40b6-9ecc-66a079d4909f/screenshots';
  fs.mkdirSync(screenshotsDir, { recursive: true });

  const tempUserDataDir = path.join(import.meta.dirname, '../../.tmp-targets-test-profile');
  fs.mkdirSync(tempUserDataDir, { recursive: true });
  fs.writeFileSync(
    path.join(tempUserDataDir, 'rea_settings.json'),
    JSON.stringify({ hasCompletedOnboarding: true, hasAcceptedLegal: true })
  );

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

  // 1. Verify Targets Pane is rendered
  const targetsPane = page.locator('[data-testid="targets-pane"]');
  await expect(targetsPane).toBeVisible();
  await expect(page.locator('text=Add Target')).toBeVisible();
  await expect(page.locator('text=Drag & drop target here')).toBeVisible();

  // 2. Simulate dropping current directory (which is an Electron app project)
  const projectDir = path.resolve(import.meta.dirname, '../../');
  await page.evaluate((dir) => {
    const dropZone = document.querySelector('[data-testid="targets-pane"] .border-dashed');
    if (dropZone) {
      const dropEvent = new Event('drop', { bubbles: true, cancelable: true });
      Object.defineProperty(dropEvent, 'dataTransfer', {
        value: {
          files: [{ path: dir, name: 'REA Studio' }],
        },
      });
      dropZone.dispatchEvent(dropEvent);
    }
  }, projectDir);

  // 3. Verify Detected Type Badge shows "JavaScript/Electron"
  const typeBadge = page.locator('[data-testid="target-type-badge"]');
  await expect(typeBadge).toBeVisible();
  await expect(typeBadge).toHaveText('JavaScript/Electron');

  // 4. Verify Pre-Flight Readiness Checklist
  await expect(page.locator('text=Pre-Flight Readiness')).toBeVisible();
  await expect(page.locator('text=Node.js Runtime')).toBeVisible();
  await expect(page.locator('text=Process Table Inspection')).toBeVisible();
  await expect(page.locator('text=Static JavaScript & AST Engine')).toBeVisible();

  // Save screenshot of the active target with readiness checklist
  await page.screenshot({ path: path.join(screenshotsDir, 'targets-1-electron-app.png') });

  // 5. Test Type Override to Native Binary
  const overrideSelect = page.locator('[data-testid="type-override-select"]');
  await overrideSelect.selectOption('native_pe');

  // Verify Provider Selector appears for native binary
  const providerSelect = page.locator('[data-testid="provider-select"]');
  await expect(providerSelect).toBeVisible();
  await expect(page.getByText('Decompiler Provider', { exact: true })).toBeVisible();

  // Select Ghidra provider
  await providerSelect.selectOption('ghidra');

  // Save screenshot of native provider selector
  await page.screenshot({ path: path.join(screenshotsDir, 'targets-2-native-provider.png') });

  // Switch back to Electron
  await overrideSelect.selectOption('javascript_electron');
  await expect(typeBadge).toHaveText('JavaScript/Electron');

  // 6. Click "Start Investigation"
  const startBtn = page.locator('[data-testid="start-investigation-btn"]');
  await expect(startBtn).toBeVisible();
  await startBtn.click();

  // Verify chat window opens with context
  await expect(page.locator('text=Initialized session for target')).toBeVisible();
  await expect(page.locator('text=Map the main/preload/renderer boundaries')).toBeVisible();

  // Save screenshot of session started
  await page.screenshot({ path: path.join(screenshotsDir, 'targets-3-investigation-started.png') });

  await electronApp.close();
});
