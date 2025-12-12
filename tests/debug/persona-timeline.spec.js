const { test, expect } = require('@playwright/test');
const config = require('../test-config');
const { signinViaImpersonation, signinAsMember } = require('../test-helpers');

test('timeline: persona persistence', async ({ page }) => {
  // Ensure skip flag is present before any page loads
  try {
    await page.addInitScript(() => { window.__QC_TEST_SKIP_ACCESS = true; });
  } catch (e) {}

  const memberEmail = config.users?.paidMember?.email || 'me@annemariecharrett.com';

  // Pre-set a persona so dropdown + badge appear
  await page.goto(config.ghost.url);
  await page.evaluate(() => {
    localStorage.setItem('qc_persona_choice', 'SOFTWARE_ENGINEER');
    localStorage.setItem('qc_persona_confirmed', 'true');
  });

  // Sign in (impersonation preferred)
  if (process.env.GHOST_ADMIN_API_KEY || config.ghost?.adminApiKey) {
    try {
      await signinViaImpersonation(page, memberEmail);
    } catch (e) {
      await signinAsMember(page, memberEmail);
    }
  } else {
    await signinAsMember(page, memberEmail);
  }

  // Reload to ensure widget picks up cookies/localStorage
  await page.goto(config.ghost.url);

  // Open chat widget
  const chatButton = page.locator('#qc-chat-button');
  await expect(chatButton).toBeVisible({ timeout: 10000 });
  await expect(chatButton).toBeEnabled({ timeout: 10000 });
  await chatButton.click();

  // Ensure persona badge visible
  const personaBadge = page.locator('#qc-persona-badge');
  await personaBadge.waitFor({ state: 'visible', timeout: 5000 });

  // Open persona dropdown
  const personaButton = page.locator('#qc-persona-button');
  await personaButton.click();
  const toOption = page.locator('[data-persona="TEST_LEAD"]');
  await toOption.click();

  // Poll localStorage and persona label every 200ms for up to 10s
  const timeline = [];
  const maxIter = 50;
  for (let i = 0; i < maxIter; i++) {
    const snap = await page.evaluate(() => {
      return {
        time: Date.now(),
        label: document.getElementById('qc-persona-label')?.textContent || null,
        persona: localStorage.getItem('qc_persona_choice'),
        confirmed: localStorage.getItem('qc_persona_confirmed')
      };
    });
    timeline.push(snap);
    if (snap.persona === 'TEST_LEAD') break;
    await page.waitForTimeout(200);
  }

  console.log('PERSONA TIMELINE:');
  console.log(JSON.stringify(timeline, null, 2));
});
