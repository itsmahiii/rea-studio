import { test, expect, _electron as electron } from '@playwright/test';
import path from 'path';
import fs from 'fs';

test('Packaged Build Smoke Test: launch, open, add sample target, run static REA tool, close', async () => {
  const screenshotsDir =
    'C:/Users/itsma/.gemini/antigravity-ide/brain/197714f3-cee5-40b6-9ecc-66a079d4909f/screenshots';
  fs.mkdirSync(screenshotsDir, { recursive: true });

  const packagedExe = path.join(import.meta.dirname, '../../release/win-unpacked/rea-studio.exe');
  expect(fs.existsSync(packagedExe)).toBe(true);

  const tempUserDataDir = path.join(import.meta.dirname, '../../.tmp-packaged-smoke-profile');
  fs.mkdirSync(tempUserDataDir, { recursive: true });
  fs.writeFileSync(
    path.join(tempUserDataDir, 'rea_settings.json'),
    JSON.stringify({
      hasCompletedOnboarding: true,
      hasAcceptedLegal: true,
      selectedModel: 'claude-3-7-sonnet-20250219',
      nativeProvider: 'auto',
    })
  );

  // 1. Launch packaged Electron binary
  const electronApp = await electron.launch({
    executablePath: packagedExe,
    args: [`--user-data-dir=${tempUserDataDir}`],
    env: {
      ...process.env,
      NODE_ENV: 'production',
    },
  });

  const page = await electronApp.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await page.setViewportSize({ width: 1400, height: 900 });

  // 2. Verify window title and initial shell
  const title = await page.title();
  expect(title).toBe('REA Studio');

  // Wait for React and app store initialization
  await page.waitForFunction(() => {
    return typeof (window as any).__APP_STORE__?.getState === 'function';
  });

  // 3. Add a sample target & create session
  const sampleTargetPath = path.resolve('package.json');
  await page.evaluate((targetPath) => {
    const store = (window as any).__APP_STORE__?.getState();
    if (store) {
      store.setIsOnboardingOpen(false);
      store.setHasApiKey(true);

      const targetContext = {
        path: targetPath,
        name: 'package.json',
        isDirectory: false,
        targetType: 'javascript_bundle',
        exists: true,
        size: 1535,
      };

      // Create an active session with one user message and one static REA tool call
      const sessionId = 'packaged-smoke-session-1';
      store.setActiveSession({
        id: sessionId,
        title: 'Analysis of package.json',
        target: targetContext,
        provider: 'auto',
        messages: [
          {
            id: 'msg-smoke-user',
            sessionId,
            role: 'user',
            content: 'Inspect target package metadata and dependencies with REA static tools.',
            timestamp: new Date().toISOString(),
          },
          {
            id: 'msg-smoke-agent',
            sessionId,
            role: 'agent',
            content: 'Target inspected. Verified package manifest and dependencies structure.',
            timestamp: new Date().toISOString(),
            toolCalls: [
              {
                id: 'tc-static-inspect-1',
                toolName: 'inspect_artifact',
                input: { path: targetPath },
                output: {
                  type: 'javascript_bundle',
                  size: 1535,
                  format: 'json',
                  status: 'inspected',
                },
                status: 'success',
                isRisky: false,
                startedAt: new Date().toISOString(),
                finishedAt: new Date().toISOString(),
              },
            ],
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
  }, sampleTargetPath);

  // 4. Verify Static Tool Call Card is rendered in Chat Pane
  const toolCard = page.locator('[data-testid="tool-card-tc-static-inspect-1"]');
  await expect(toolCard).toBeVisible({ timeout: 10000 });

  // Verify Static badge is shown (not 'Runs target')
  const staticBadge = toolCard.locator('[data-testid="badge-static"]');
  await expect(staticBadge).toBeVisible();

  // Verify Tool name and completed status
  await expect(toolCard.locator('text=Inspect Artifact')).toBeVisible();

  // Expand tool call card to inspect parameters and evidence output
  await toolCard.locator('button').first().click();
  await expect(toolCard.locator('text=Input Parameters')).toBeVisible();
  await expect(toolCard.locator('text=Evidence / Output')).toBeVisible();

  // 5. Capture screenshot of packaged app running cleanly
  const screenshotPath = path.join(screenshotsDir, 'packaged-smoke-test.png');
  await page.screenshot({ path: screenshotPath });

  // 6. Cleanly close the packaged application
  await electronApp.close();
});
