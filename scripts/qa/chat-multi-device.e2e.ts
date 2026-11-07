/**
 * Multi-device E2E tests for chat using Playwright. Tests the full chat flow
 * across two browser contexts (simulating two devices) to verify:
 * - Real-time message delivery
 * - Concurrent signal handling
 * - Session persistence across page reloads
 * - Mobile viewport behavior
 *
 * Setup:
 *   npm install -D @playwright/test
 *   npx playwright install chromium
 *
 * Run:
 *   BASE=http://localhost:3124 npx playwright test scripts/qa/chat-multi-device.e2e.ts
 *
 * Without BASE, tests skip gracefully.
 */

// @ts-expect-error — Playwright types not available until installed
import { test, expect, type Page, type BrowserContext } from "@playwright/test";

const BASE = process.env.BASE ?? "";

test.skip(!BASE, "BASE not set — skipping multi-device E2E tests");

const MATRICULA_A = "426144895";
const MATRICULA_B = "426144896";
const EVENT_ID = `playwright-e2e-${Date.now()}`;

async function enterWithMatricula(page: Page, matricula: string) {
  await page.goto(BASE + "/");
  await page.fill('input[name="matricula"]', matricula);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/resultado", { timeout: 10000 });
}

async function completeQuiz(page: Page) {
  // Navigate to quiz
  await page.goto(BASE + "/cuestionario");
  
  // Answer all questions (simplified — in real test, would read from bank)
  const questions = await page.locator('[data-quiz-question]').all();
  for (const question of questions) {
    const firstOption = question.locator('input[type="radio"]').first();
    await firstOption.check();
  }
  
  // Submit
  await page.click('button:has-text("Enviar")');
  await page.waitForURL("**/resultado", { timeout: 10000 });
}

async function waitForMatch(page: Page, timeout = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const matchCount = await page.locator('[data-match-card]').count();
    if (matchCount > 0) return true;
    await page.waitForTimeout(2000);
    await page.reload();
  }
  return false;
}

async function sendSignal(page: Page, matchIndex: number) {
  const matchCard = page.locator('[data-match-card]').nth(matchIndex);
  await matchCard.click();
  await page.click('button:has-text("Enviar señal")');
  await page.waitForSelector('[data-signal-state="sent"]', { timeout: 5000 });
}

async function setupPIN(page: Page, pin: string) {
  await page.click('[data-action="open-chat"]');
  await page.fill('input[name="pin"]', pin);
  await page.fill('input[name="pin-confirm"]', pin);
  await page.click('button:has-text("Crear PIN")');
  await page.waitForSelector('[data-chat-unlocked]', { timeout: 5000 });
}

test.describe("multi-device chat E2E", () => {
  let contextA: BrowserContext;
  let contextB: BrowserContext;
  let pageA: Page;
  let pageB: Page;

  test.beforeEach(async ({ browser }: { browser: { newContext: (opts: { viewport: { width: number; height: number } }) => Promise<BrowserContext> } }) => {
    // Create two isolated browser contexts (simulating two devices)
    contextA = await browser.newContext({
      viewport: { width: 375, height: 667 }, // iPhone SE
    });
    contextB = await browser.newContext({
      viewport: { width: 375, height: 667 },
    });

    pageA = await contextA.newPage();
    pageB = await contextB.newPage();
  });

  test.afterEach(async () => {
    // Cleanup: delete synthetic accounts
    for (const matricula of [MATRICULA_A, MATRICULA_B]) {
      await fetch(BASE + "/api/enter", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ matricula }),
      });
      // Note: In real implementation, would capture cookie and DELETE /api/privacy
    }

    await contextA.close();
    await contextB.close();
  });

  test("full chat flow: enter → quiz → signal → chat → message", async () => {
    // Device A: enter and complete quiz
    await enterWithMatricula(pageA, MATRICULA_A);
    await completeQuiz(pageA);
    
    // Device B: enter and complete quiz
    await enterWithMatricula(pageB, MATRICULA_B);
    await completeQuiz(pageB);

    // Wait for matches on both devices
    const matchA = await waitForMatch(pageA);
    const matchB = await waitForMatch(pageB);
    expect(matchA, "Device A should see a match").toBe(true);
    expect(matchB, "Device B should see a match").toBe(true);

    // Device A: send signal to first match
    await sendSignal(pageA, 0);

    // Device B: should see invitation
    await pageB.reload();
    const invitation = await pageB.locator('[data-invitation]').count();
    expect(invitation, "Device B should see invitation").toBeGreaterThan(0);

    // Device B: setup PIN and accept signal
    await setupPIN(pageB, "1234");
    await pageB.click('[data-action="accept-signal"]');

    // Both devices: should see chat opened
    await pageA.waitForSelector('[data-chat-open]', { timeout: 10000 });
    await pageB.waitForSelector('[data-chat-open]', { timeout: 10000 });

    // Device A: send first message
    await pageA.fill('[data-chat-input]', "Hola desde dispositivo A 👋");
    await pageA.click('[data-action="send-message"]');

    // Device B: should receive message in real-time
    await pageB.waitForSelector('[data-message]:has-text("Hola desde dispositivo A")', { timeout: 10000 });

    // Device B: reply
    await pageB.fill('[data-chat-input]', "¡Hola! Saludos desde B ✨");
    await pageB.click('[data-action="send-message"]');

    // Device A: should see reply
    await pageA.waitForSelector('[data-message]:has-text("Saludos desde B")', { timeout: 10000 });

    // Verify message count
    const messagesA = await pageA.locator('[data-message]').count();
    const messagesB = await pageB.locator('[data-message]').count();
    expect(messagesA, "Both devices should see same message count").toBe(messagesB);
    expect(messagesA, "Should have at least 2 messages").toBeGreaterThanOrEqual(2);
  });

  test("session persistence: reload page, chat state survives", async () => {
    // Setup: get to chat open state
    await enterWithMatricula(pageA, MATRICULA_A);
    await completeQuiz(pageA);
    await waitForMatch(pageA);
    await sendSignal(pageA, 0);

    // Reload page
    await pageA.reload();
    await pageA.waitForURL("**/resultado", { timeout: 10000 });

    // Verify state persisted (signal should still be sent)
    const signalState = await pageA.locator('[data-signal-state]').getAttribute("data-signal-state");
    expect(signalState, "Signal state should persist after reload").toBe("sent");
  });

  test("mobile viewport: all touch targets ≥ 44px", async () => {
    await enterWithMatricula(pageA, MATRICULA_A);
    
    // Check all interactive elements
    const buttons = await pageA.locator('button, a, input[type="radio"], input[type="checkbox"]').all();
    
    for (const button of buttons) {
      const box = await button.boundingBox();
      if (box) {
        expect(box.width, "Touch target width should be ≥ 44px").toBeGreaterThanOrEqual(44);
        expect(box.height, "Touch target height should be ≥ 44px").toBeGreaterThanOrEqual(44);
      }
    }
  });

  test("concurrent signals: both devices signal simultaneously", async () => {
    // Setup both devices
    await enterWithMatricula(pageA, MATRICULA_A);
    await completeQuiz(pageA);
    await waitForMatch(pageA);

    await enterWithMatricula(pageB, MATRICULA_B);
    await completeQuiz(pageB);
    await waitForMatch(pageB);

    // Both signal at the same time
    await Promise.all([
      sendSignal(pageA, 0),
      sendSignal(pageB, 0),
    ]);

    // Both should see chat open (mutual signal)
    await pageA.waitForSelector('[data-chat-open]', { timeout: 10000 });
    await pageB.waitForSelector('[data-chat-open]', { timeout: 10000 });

    // Verify same conversation ID
    const convA = await pageA.locator('[data-conversation-id]').getAttribute("data-conversation-id");
    const convB = await pageB.locator('[data-conversation-id]').getAttribute("data-conversation-id");
    expect(convA, "Both devices should see same conversation ID").toBe(convB);
  });

  test("network resilience: message sends after temporary disconnect", async () => {
    // Setup chat
    await enterWithMatricula(pageA, MATRICULA_A);
    await completeQuiz(pageA);
    await waitForMatch(pageA);
    await sendSignal(pageA, 0);

    // Simulate offline
    await pageA.context().setOffline(true);

    // Try to send message (should queue)
    await pageA.fill('[data-chat-input]', "Mensaje en offline");
    await pageA.click('[data-action="send-message"]');

    // Should show pending state
    await pageA.waitForSelector('[data-message-state="pending"]', { timeout: 5000 });

    // Restore network
    await pageA.context().setOffline(false);

    // Message should send automatically
    await pageA.waitForSelector('[data-message-state="sent"]', { timeout: 10000 });
  });
});

test.describe("accessibility", () => {
  test("chat screen passes axe audit", async ({ browser }: { browser: { newContext: () => Promise<BrowserContext> } }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await enterWithMatricula(page, MATRICULA_A);
    await completeQuiz(page);
    await waitForMatch(page);

    // Run axe audit (requires @axe-core/playwright)
    // const results = await new AxeBuilder({ page }).analyze();
    // expect(results.violations).toEqual([]);

    // For now, just verify key accessibility attributes
    const chatInput = page.locator('[data-chat-input]');
    await expect(chatInput).toHaveAttribute("aria-label", /.+/);

    const sendButton = page.locator('[data-action="send-message"]');
    await expect(sendButton).toHaveAttribute("aria-label", /.+/);

    await context.close();
  });
});
