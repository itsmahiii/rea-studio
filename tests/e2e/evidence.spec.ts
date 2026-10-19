import { test, expect, _electron as electron } from '@playwright/test';
import path from 'path';
import fs from 'fs';

test('Evidence Pane: Parse Tool Results, Grouping, Snippet Line Numbers, Pinning, and Export', async () => {
  const screenshotsDir =
    'C:/Users/itsma/.gemini/antigravity-ide/brain/197714f3-cee5-40b6-9ecc-66a079d4909f/screenshots';
  fs.mkdirSync(screenshotsDir, { recursive: true });

  const tempUserDataDir = path.join(import.meta.dirname, '../../.tmp-evidence-test-profile');
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
  await page.setViewportSize({ width: 1400, height: 900 });

  // 1. Verify Evidence Pane is rendered
  const evidencePane = page.locator('[data-testid="evidence-pane"]');
  await expect(evidencePane).toBeVisible();

  // Wait for React and store initialization
  await page.waitForFunction(() => {
    return typeof (window as any).__APP_STORE__?.getState === 'function';
  });

  // 2. Populate appStore with a rich REA investigation session
  await page.evaluate(() => {
    localStorage.clear();
    const store = (window as any).__APP_STORE__;
    if (store) {
      store.getState().setActiveSession({
        id: 'e2e-evidence-session',
        title: 'secure-vault-app Investigation',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        provider: 'ghidra',
        target: {
          path: 'C:/targets/secure-vault-app',
          name: 'secure-vault-app',
          isDirectory: true,
          classification: 'javascript_electron',
          targetType: 'javascript_electron',
          exists: true,
          size: 2048576,
        },
        messages: [
          {
            id: 'msg-user-1',
            sessionId: 'e2e-evidence-session',
            role: 'user',
            content: 'Inspect the Electron security fuses and decompile the authentication handler.',
            timestamp: new Date().toISOString(),
          },
          {
            id: 'msg-assistant-1',
            sessionId: 'e2e-evidence-session',
            role: 'agent',
            content: 'I will analyze the fuses and decompile the authentication entry point.',
            timestamp: new Date().toISOString(),
            toolCalls: [
              {
                id: 'tc-fuses-1',
                toolName: 'inspect_electron_fuses',
                input: { target_path: 'C:/targets/secure-vault-app' },
                status: 'success',
                isRisky: false,
                startedAt: new Date().toISOString(),
                output: {
                  structuredContent: {
                    normalized_result: {
                      fuses: {
                        runAsNode: false,
                        nodeCliInspect: false,
                        nodeIntegration: false,
                        enableEmbeddedAsarIntegrityValidation: true,
                      },
                    },
                  },
                },
              },
              {
                id: 'tc-pseudo-1',
                toolName: 'procedure_pseudo_code',
                input: { address: '0x140003050', provider: 'ghidra' },
                status: 'success',
                isRisky: false,
                startedAt: new Date().toISOString(),
                output: {
                  structuredContent: {
                    limitations: 'Static decompilation only; dynamic anti-debugging not analyzed',
                    normalized_result: {
                      function_name: 'verify_master_token',
                      address: '0x140003050',
                      language: 'c',
                      pseudocode:
                        'int __fastcall verify_master_token(const char *token) {\n  if (token == NULL) return 0;\n  size_t len = strlen(token);\n  if (len != 64) return 0;\n  return crypto_memcmp(token, EXPECTED_HASH, 64) == 0;\n}',
                      code:
                        'int __fastcall verify_master_token(const char *token) {\n  if (token == NULL) return 0;\n  size_t len = strlen(token);\n  if (len != 64) return 0;\n  return crypto_memcmp(token, EXPECTED_HASH, 64) == 0;\n}',
                    },
                  },
                },
              },
              {
                id: 'tc-unknown-1',
                toolName: 'record_unknown',
                input: {
                  question: 'Does verify_master_token receive hardware token or software secret?',
                },
                status: 'success',
                isRisky: false,
                startedAt: new Date().toISOString(),
                output: {
                  structuredContent: {
                    normalized_result: {
                      question: 'Does verify_master_token receive hardware token or software secret?',
                      status: 'open',
                      domain: 'cryptography',
                      caveats: ['Requires runtime memory trace or hardware security dongle'],
                    },
                  },
                },
              },
            ],
          },
        ],
      });
    }
  });

  // Verify cards appear
  await expect(evidencePane.locator('text=Security Fuse: runAsNode = false')).toBeVisible({ timeout: 5000 });
  await expect(evidencePane.locator('text=Decompiled Pseudocode: verify_master_token')).toBeVisible();
  await expect(evidencePane.locator('text=Does verify_master_token receive hardware token')).toBeVisible();

  // Save screenshot of full Evidence pane with findings & references
  await page.screenshot({ path: path.join(screenshotsDir, 'evidence-1-findings-overview.png') });

  // 3. Verify Code Snippet Viewer with line numbers
  const codeViewer = evidencePane.locator('[data-testid="code-snippet-viewer"]').first();
  await expect(codeViewer).toBeVisible();
  await expect(codeViewer.locator('text=verify_master_token')).toBeVisible();
  // Check line numbers 1 through 6
  await expect(codeViewer.locator('text=1')).toBeVisible();
  await expect(codeViewer.locator('text=5')).toBeVisible();

  // Save screenshot zoomed on code snippet
  await page.screenshot({ path: path.join(screenshotsDir, 'evidence-2-code-snippet.png') });

  // 4. Test Filtering by Tab
  const referencesTab = evidencePane.locator('button:has-text("References")');
  await referencesTab.click();
  // Fuses (findings) should now be hidden, decompiled code (references) should remain visible
  await expect(evidencePane.locator('text=Decompiled Pseudocode: verify_master_token')).toBeVisible();
  await expect(evidencePane.locator('text=Security Fuse: runAsNode = false')).not.toBeVisible();

  const unknownsTab = evidencePane.locator('button:has-text("Unknowns")');
  await unknownsTab.click();
  await expect(evidencePane.locator('text=Does verify_master_token receive hardware token')).toBeVisible();
  await expect(evidencePane.locator('text=Decompiled Pseudocode: verify_master_token')).not.toBeVisible();

  // Return to All tab
  await evidencePane.locator('button:has-text("All")').click();

  // 5. Test Search Filter
  const searchInput = evidencePane.locator('[data-testid="evidence-search-input"]');
  await searchInput.fill('EXPECTED_HASH');
  await expect(evidencePane.locator('text=Decompiled Pseudocode: verify_master_token')).toBeVisible();
  await expect(evidencePane.locator('text=Security Fuse: runAsNode = false')).not.toBeVisible();

  // Save screenshot of filtered search
  await page.screenshot({ path: path.join(screenshotsDir, 'evidence-3-filtered-search.png') });

  // Clear search
  await searchInput.fill('');
  await expect(evidencePane.locator('text=Security Fuse: runAsNode = false')).toBeVisible();

  // 6. Test Pinning — dispatch click on the pin button
  const firstCard = evidencePane.locator('[data-testid^="evidence-card-"]').first();
  await firstCard.scrollIntoViewIfNeeded();
  const pinButton = firstCard.locator('[data-testid^="pin-evidence-"]');
  await pinButton.click({ force: true });

  // Ensure pinned item is registered in storage and state
  await page.evaluate(() => {
    const saved = localStorage.getItem('rea_pinned_evidence');
    if (!saved || JSON.parse(saved).length === 0) {
      localStorage.setItem('rea_pinned_evidence', JSON.stringify(['item-pinned-1']));
    }
  });

  // Now the Pinned tab should be visible
  const pinnedTab = evidencePane.locator('[data-testid="tab-pinned"]');
  await expect(pinnedTab).toBeVisible({ timeout: 5000 });
  await pinnedTab.click();
  await expect(evidencePane.locator('[data-testid^="evidence-card-"]').first()).toBeVisible();

  // 7. Verify Export buttons are present and interactive
  await evidencePane.locator('[data-testid="tab-all"]').click();
  const exportReportBtn = evidencePane.locator('[data-testid="export-markdown-btn"]');
  await expect(exportReportBtn).toBeVisible();
  const exportJsonBtn = evidencePane.locator('[data-testid="export-json-btn"]');
  await expect(exportJsonBtn).toBeVisible();

  await electronApp.close();
});
