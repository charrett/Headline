const { test, expect } = require('@playwright/test');
const config = require('./test-config');
const { signinViaImpersonation, signinAsMember, isSignedIn } = require('./test-helpers');

// Ensure config.ghost.url is defined
if (!config.ghost) {
  config.ghost = {};
}
if (!config.ghost.url) {
  config.ghost.url = process.env.GHOST_URL || 'http://localhost:2368';
}

// Use impersonation if GHOST_ADMIN_API_KEY is set, otherwise fall back to magic link
const signin = async (page, email) => {
  // Ensure test shortcut flag is set for pages loaded after signin so the widget
  // can optionally skip network access checks during local UI/state tests.
  try {
    await page.addInitScript(() => { window.__QC_TEST_SKIP_ACCESS = true; });
  } catch (e) {
    // ignore if addInitScript is not available for some reason
  }

  if (process.env.GHOST_ADMIN_API_KEY || config.ghost?.adminApiKey) {
    return signinViaImpersonation(page, email);
  }
  return signinAsMember(page, email);
};

// All available personas
const PERSONAS = {
  QUALITY_COACH: { id: 'QUALITY_COACH', label: 'Quality Coach' },
  ENGINEERING_MANAGER: { id: 'ENGINEERING_MANAGER', label: 'Engineering Manager' },
  DELIVERY_LEAD: { id: 'DELIVERY_LEAD', label: 'Delivery Lead' },
  CEO_EXECUTIVE: { id: 'CEO_EXECUTIVE', label: 'CEO/Executive' },
  SOFTWARE_ENGINEER: { id: 'SOFTWARE_ENGINEER', label: 'Software Engineer' },
  TEST_LEAD: { id: 'TEST_LEAD', label: 'Test Lead' },
  OTHER: { id: 'OTHER', label: 'Other' }
};

test.describe('Persona Switching - State Machine Tests', () => {
  
  // Get member email from config - using correct key path
  const memberEmail = config.users?.paidMember?.email || 'me@annemariecharrett.com';
  
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err));

    // Ensure test shortcut flag is present before any page loads so the widget
    // will short-circuit access checks during local UI/state tests.
    try {
      await page.addInitScript(() => { window.__QC_TEST_SKIP_ACCESS = true; });
    } catch (e) {
      // ignore if not supported
    }

    // Instrument localStorage writes for debugging persistence races.
    // This wraps `localStorage.setItem` to capture timestamped entries and stack traces
    // into `window.__qc_storage_log` and emits console logs (captured in Playwright traces).
    try {
      await page.addInitScript(() => {
        (function() {
          try {
            if (!window.localStorage) return;
            if (window.__qc_storage_wrapped) return;
            const orig = window.localStorage.setItem.bind(window.localStorage);
            window.__qc_storage_log = window.__qc_storage_log || [];
            window.localStorage.setItem = function(k, v) {
              try {
                const entry = { ts: Date.now(), key: k, value: String(v) };
                // capture a stack trace for who invoked the write
                try { entry.stack = (new Error()).stack; } catch (e) { entry.stack = null; }
                orig(k, v);
                window.__qc_storage_log.push(entry);
                try { console.log('QC-STORE-WRITE', entry.key, entry.value); } catch (e) {}
              } catch (e) {
                try { orig(k, v); } catch (e2) {}
              }
            };

            window.addEventListener('storage', (ev) => {
              try {
                window.__qc_storage_log = window.__qc_storage_log || [];
                window.__qc_storage_log.push({ ts: Date.now(), event: 'storage', key: ev.key, oldValue: ev.oldValue, newValue: ev.newValue });
                try { console.log('QC-STORE-EVENT', ev.key, ev.newValue); } catch (e) {}
              } catch (e) {}
            });

            window.__qc_storage_wrapped = true;
          } catch (e) {}
        })();
      });
    } catch (e) {
      // ignore if addInitScript is not available
    }

    // Optionally stub persona correction API for deterministic tests.
    // Set environment variable `PLAYWRIGHT_STUB_PERSONA_CORRECT=1` when running tests
    // to enable this route stub which returns a 200 success for /api/v1/persona/correct.
    if (process.env.PLAYWRIGHT_STUB_PERSONA_CORRECT) {
      try {
        await page.route('**/api/v1/persona/correct', async (route) => {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ status: 'success' })
          });
        });
      } catch (e) {
        // route may not be available in some environments; ignore failures
      }
    }
    // Clear localStorage before each test to ensure clean state
    await page.goto(config.ghost.url);
    await page.evaluate(() => {
      localStorage.removeItem('qc_persona_choice');
      localStorage.removeItem('qc_persona_confirmed');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 1: Initial State Tests
  // ═══════════════════════════════════════════════════════════════════════════

  test('initial state: persona badge is hidden when no persona detected', async ({ page }) => {
    await signin(page, memberEmail);
    await page.goto(config.ghost.url);
    
    // Open chat widget
    const chatButton = page.locator('#qc-chat-button');
    await expect(chatButton).toBeVisible();
    await chatButton.click();
    
    // Verify persona badge is initially hidden
    const personaBadge = page.locator('#qc-persona-badge');
    await expect(personaBadge).toBeHidden();
  });

  test('restored state: persona badge shows when localStorage has saved persona', async ({ page }) => {
    // Pre-set localStorage with a saved persona
    await page.goto(config.ghost.url);
    await page.evaluate(() => {
      localStorage.setItem('qc_persona_choice', 'ENGINEERING_MANAGER');
      localStorage.setItem('qc_persona_confirmed', 'true');
    });
    
    await signin(page, memberEmail);
    await page.goto(config.ghost.url);
    
    // Open chat widget
    const chatButton = page.locator('#qc-chat-button');
    await chatButton.click();
    
    // Verify persona badge is visible with correct label
    const personaBadge = page.locator('#qc-persona-badge');
    await expect(personaBadge).toBeVisible();
    
    const personaLabel = page.locator('#qc-persona-label');
    await expect(personaLabel).toHaveText('Engineering Manager');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 2: Individual Persona Selection Tests
  // ═══════════════════════════════════════════════════════════════════════════

  for (const [personaKey, persona] of Object.entries(PERSONAS)) {
    test(`can select persona: ${persona.label}`, async ({ page }) => {
      // Pre-set a persona so badge is visible
      await page.goto(config.ghost.url);
      await page.evaluate(() => {
        localStorage.setItem('qc_persona_choice', 'QUALITY_COACH');
        localStorage.setItem('qc_persona_confirmed', 'true');
      });
      
      await signin(page, memberEmail);
      await page.goto(config.ghost.url);
      
      // Open chat widget
      const chatButton = page.locator('#qc-chat-button');
      await chatButton.click();
      
      // Click persona badge to open dropdown
      const personaButton = page.locator('#qc-persona-button');
      await expect(personaButton).toBeVisible();
      await personaButton.click();
      
      // Verify dropdown is visible
      const personaDropdown = page.locator('#qc-persona-dropdown');
      await expect(personaDropdown).toBeVisible();
      
      // Select the persona
      const personaOption = page.locator(`[data-persona="${personaKey}"]`);
      await expect(personaOption).toBeVisible();
      await personaOption.click();
      
      // Verify label updated
      const personaLabel = page.locator('#qc-persona-label');
      await expect(personaLabel).toHaveText(persona.label);
      
      // Verify localStorage updated
      const savedPersona = await page.evaluate(() => localStorage.getItem('qc_persona_choice'));
      expect(savedPersona).toBe(personaKey);
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 3: Persona Switching State Transitions
  // ═══════════════════════════════════════════════════════════════════════════

  test('switch: Quality Coach → Engineering Manager', async ({ page }) => {
    await testPersonaSwitch(page, 'QUALITY_COACH', 'ENGINEERING_MANAGER');
  });

  test('switch: Engineering Manager → CEO/Executive', async ({ page }) => {
    await testPersonaSwitch(page, 'ENGINEERING_MANAGER', 'CEO_EXECUTIVE');
  });

  test('switch: CEO/Executive → Software Engineer', async ({ page }) => {
    await testPersonaSwitch(page, 'CEO_EXECUTIVE', 'SOFTWARE_ENGINEER');
  });

  test('switch: Software Engineer → Test Lead', async ({ page }) => {
    await testPersonaSwitch(page, 'SOFTWARE_ENGINEER', 'TEST_LEAD');
  });

  test('switch: Test Lead → Delivery Lead', async ({ page }) => {
    await testPersonaSwitch(page, 'TEST_LEAD', 'DELIVERY_LEAD');
  });

  test('switch: Delivery Lead → Other', async ({ page }) => {
    await testPersonaSwitch(page, 'DELIVERY_LEAD', 'OTHER');
  });

  test('switch: Other → Quality Coach (full circle)', async ({ page }) => {
    await testPersonaSwitch(page, 'OTHER', 'QUALITY_COACH');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 4: Dropdown UI Tests
  // ═══════════════════════════════════════════════════════════════════════════

  test('dropdown: opens on badge click', async ({ page }) => {
    await setupPersonaState(page, 'QUALITY_COACH');
    
    const personaButton = page.locator('#qc-persona-button');
    await personaButton.click();
    
    const personaDropdown = page.locator('#qc-persona-dropdown');
    await expect(personaDropdown).toBeVisible();
  });

  test('dropdown: closes on close button click', async ({ page }) => {
    await setupPersonaState(page, 'QUALITY_COACH');
    
    const personaButton = page.locator('#qc-persona-button');
    await personaButton.click();
    
    const personaDropdown = page.locator('#qc-persona-dropdown');
    await expect(personaDropdown).toBeVisible();
    
    const closeButton = page.locator('#qc-persona-close');
    await closeButton.click();
    
    await expect(personaDropdown).toBeHidden();
  });

  test('dropdown: closes after selecting a persona', async ({ page }) => {
    await setupPersonaState(page, 'QUALITY_COACH');
    
    const personaButton = page.locator('#qc-persona-button');
    await personaButton.click();
    
    const personaDropdown = page.locator('#qc-persona-dropdown');
    await expect(personaDropdown).toBeVisible();
    
    const engineerOption = page.locator('[data-persona="SOFTWARE_ENGINEER"]');
    await engineerOption.click();
    
    // Dropdown should close after selection
    await expect(personaDropdown).toBeHidden();
  });

  test('dropdown: shows all 7 persona options', async ({ page }) => {
    await setupPersonaState(page, 'QUALITY_COACH');
    
    const personaButton = page.locator('#qc-persona-button');
    await personaButton.click();
    
    // Verify all personas are present
    for (const [personaKey, persona] of Object.entries(PERSONAS)) {
      const option = page.locator(`[data-persona="${personaKey}"]`);
      await expect(option).toBeVisible();
      await expect(option).toHaveText(persona.label);
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 5: Persistence Tests
  // ═══════════════════════════════════════════════════════════════════════════

  test('persistence: persona survives page reload', async ({ page }) => {
    await setupPersonaState(page, 'DELIVERY_LEAD');
    
    // Verify initial state
    const personaLabel = page.locator('#qc-persona-label');
    await expect(personaLabel).toHaveText('Delivery Lead');
    
    // Reload page
    await page.reload();
    
    // Open chat again
    const chatButton = page.locator('#qc-chat-button');
    await chatButton.click();
    
    // Verify persona persisted
    await expect(personaLabel).toHaveText('Delivery Lead');
  });

  test('persistence: localStorage contains correct keys after selection', async ({ page }) => {
    await setupPersonaState(page, 'CEO_EXECUTIVE');
    
    // Select a different persona
    const personaButton = page.locator('#qc-persona-button');
    await personaButton.click();
    
    const testLeadOption = page.locator('[data-persona="TEST_LEAD"]');
    await testLeadOption.click();
    
    // Verify localStorage
    const storageState = await page.evaluate(() => ({
      choice: localStorage.getItem('qc_persona_choice'),
      confirmed: localStorage.getItem('qc_persona_confirmed')
    }));
    
    expect(storageState.choice).toBe('TEST_LEAD');
    expect(storageState.confirmed).toBe('true');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 6: Edge Cases
  // ═══════════════════════════════════════════════════════════════════════════

  test('edge case: selecting same persona does nothing', async ({ page }) => {
    await setupPersonaState(page, 'QUALITY_COACH');
    
    const personaButton = page.locator('#qc-persona-button');
    await personaButton.click();
    
    // Select the same persona
    const samePersona = page.locator('[data-persona="QUALITY_COACH"]');
    await samePersona.click();
    
    // Label should remain unchanged
    const personaLabel = page.locator('#qc-persona-label');
    await expect(personaLabel).toHaveText('Quality Coach');
  });

  test('edge case: rapid switching between personas', async ({ page }) => {
    await setupPersonaState(page, 'QUALITY_COACH');
    
    const personaButton = page.locator('#qc-persona-button');
    const personaLabel = page.locator('#qc-persona-label');
    
    // Rapid fire persona changes
    const switches = [
      'ENGINEERING_MANAGER',
      'CEO_EXECUTIVE', 
      'SOFTWARE_ENGINEER',
      'TEST_LEAD'
    ];
    
    for (const personaId of switches) {
      await personaButton.click();
      await page.locator(`[data-persona="${personaId}"]`).click();
      // Small delay to allow state update
      await page.waitForTimeout(100);
    }
    
    // Final state should be TEST_LEAD
    await expect(personaLabel).toHaveText('Test Lead');
    
    const savedPersona = await page.evaluate(() => localStorage.getItem('qc_persona_choice'));
    expect(savedPersona).toBe('TEST_LEAD');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 7: API Integration Tests
  // ═══════════════════════════════════════════════════════════════════════════

  test('api: persona correction sends POST to /api/v1/persona/correct', async ({ page }) => {
    await setupPersonaState(page, 'QUALITY_COACH');
    
    // Intercept the API call
    let apiCallMade = false;
    let requestPayload = null;
    
    await page.route('**/api/v1/persona/correct', async (route) => {
      apiCallMade = true;
      requestPayload = route.request().postDataJSON();
      
      // Return success response
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'success' })
      });
    });
    
    // Switch persona
    const personaButton = page.locator('#qc-persona-button');
    await personaButton.click();
    
    const engineerOption = page.locator('[data-persona="SOFTWARE_ENGINEER"]');
    await engineerOption.click();
    
    // Wait for API call
    await page.waitForTimeout(500);
    
    // Verify API was called
    expect(apiCallMade).toBe(true);
    
    // Verify payload structure
    expect(requestPayload).toHaveProperty('corrected_persona', 'SOFTWARE_ENGINEER');
    expect(requestPayload).toHaveProperty('original_persona', 'QUALITY_COACH');
    expect(requestPayload).toHaveProperty('correction_reason', 'user_selected');
  });

  test('api: success toast is shown after persona correction', async ({ page }) => {
    await setupPersonaState(page, 'QUALITY_COACH');
    
    // Mock successful API response
    await page.route('**/api/v1/persona/correct', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'success' })
      });
    });
    
    // Switch persona
    const personaButton = page.locator('#qc-persona-button');
    await personaButton.click();
    
    const deliveryOption = page.locator('[data-persona="DELIVERY_LEAD"]');
    await deliveryOption.click();
    
    // Verify toast message appears
    const accessMessage = page.locator('#qc-access-message');
    await expect(accessMessage).toContainText('Persona updated to Delivery Lead');
  });

  test('api: UI remains updated even if API call fails', async ({ page }) => {
    await setupPersonaState(page, 'QUALITY_COACH');
    
    // Mock failed API response
    await page.route('**/api/v1/persona/correct', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal server error' })
      });
    });
    
    // Switch persona
    const personaButton = page.locator('#qc-persona-button');
    await personaButton.click();
    
    const ceoOption = page.locator('[data-persona="CEO_EXECUTIVE"]');
    await ceoOption.click();
    
    // UI should still be updated (optimistic update)
    const personaLabel = page.locator('#qc-persona-label');
    await expect(personaLabel).toHaveText('CEO/Executive');
    
    // localStorage should still be updated
    const savedPersona = await page.evaluate(() => localStorage.getItem('qc_persona_choice'));
    expect(savedPersona).toBe('CEO_EXECUTIVE');
  });

  test('api: gtag analytics event is fired on successful correction', async ({ page }) => {
    await setupPersonaState(page, 'QUALITY_COACH');
    
    // Track gtag calls
    let gtagCalled = false;
    let gtagEventName = null;
    let gtagEventParams = null;
    
    await page.evaluate(() => {
      window.gtagCalls = [];
      window.gtag = function(command, eventName, params) {
        window.gtagCalls.push({ command, eventName, params });
      };
    });
    
    // Mock successful API response
    await page.route('**/api/v1/persona/correct', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'success' })
      });
    });
    
    // Switch persona
    const personaButton = page.locator('#qc-persona-button');
    await personaButton.click();
    
    const testLeadOption = page.locator('[data-persona="TEST_LEAD"]');
    await testLeadOption.click();
    
    // Wait for API and analytics
    await page.waitForTimeout(500);
    
    // Check gtag was called
    const gtagCalls = await page.evaluate(() => window.gtagCalls);
    const personaEvent = gtagCalls.find(call => call.eventName === 'persona_corrected');
    
    expect(personaEvent).toBeDefined();
    expect(personaEvent.params.from).toBe('QUALITY_COACH');
    expect(personaEvent.params.to).toBe('TEST_LEAD');
    expect(personaEvent.params.reason).toBe('user_selected');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 8: Additional Edge Cases
  // ═══════════════════════════════════════════════════════════════════════════

  test('edge case: clicking outside dropdown closes it', async ({ page }) => {
    await setupPersonaState(page, 'QUALITY_COACH');
    
    // Open dropdown
    const personaButton = page.locator('#qc-persona-button');
    await personaButton.click();
    
    const personaDropdown = page.locator('#qc-persona-dropdown');
    await expect(personaDropdown).toBeVisible();
    
    // Click outside (on the chat messages area)
    const messagesArea = page.locator('#qc-messages');
    await messagesArea.click();
    
    // Dropdown should close
    await expect(personaDropdown).toBeHidden();
  });

  test('edge case: keyboard escape closes dropdown', async ({ page }) => {
    // NOTE: Currently Escape closes the entire chat window, not just the dropdown.
    // This test documents expected behavior if we add dropdown-specific Escape handling.
    // For now, we test that Escape at least closes the dropdown (by closing the chat).
    await setupPersonaState(page, 'QUALITY_COACH');
    
    // Open dropdown
    const personaButton = page.locator('#qc-persona-button');
    await personaButton.click();
    
    const personaDropdown = page.locator('#qc-persona-dropdown');
    await expect(personaDropdown).toBeVisible();
    
    // Press Escape - this will close the chat window (and thus hide dropdown)
    await page.keyboard.press('Escape');
    
    // Dropdown should not be visible (chat window closed)
    await expect(personaDropdown).not.toBeVisible();
  });

});

// ═══════════════════════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Setup page with a pre-selected persona state
 */
async function setupPersonaState(page, personaId) {
  await page.goto(config.ghost.url);
  await page.evaluate((id) => {
    localStorage.setItem('qc_persona_choice', id);
    localStorage.setItem('qc_persona_confirmed', 'true');
  }, personaId);
  
  const email = config.users?.paidMember?.email || 'me@annemariecharrett.com';
  await signin(page, email);
  await page.goto(config.ghost.url);
  
  // Open chat widget
  const chatButton = page.locator('#qc-chat-button');
  // Wait until the chat button is enabled (not loading) before clicking
  try {
    await expect(chatButton).toBeEnabled({ timeout: 10000 });
  } catch (e) {
    console.log('DEBUG: QualityCoachClient type:', await page.evaluate(() => typeof QualityCoachClient));
    console.log('DEBUG: Page content snippet:', (await page.content()).slice(-5000));
    throw e;
  }
  await chatButton.click();

  // Wait for persona badge to be visible
  const personaBadge = page.locator('#qc-persona-badge');
  await expect(personaBadge).toBeVisible();
}

/**
 * Test switching from one persona to another
 */
async function testPersonaSwitch(page, fromPersonaId, toPersonaId) {
  // Ensure the persona correction API is stubbed for this test when requested.
  if (process.env.PLAYWRIGHT_STUB_PERSONA_CORRECT) {
    try {
      await page.route('**/api/v1/persona/correct', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'success' })
        });
      });
    } catch (e) {
      // ignore route errors
    }
  }

  await setupPersonaState(page, fromPersonaId);
  
  const fromLabel = PERSONAS[fromPersonaId].label;
  const toLabel = PERSONAS[toPersonaId].label;
  
  // Verify starting state
  const personaLabel = page.locator('#qc-persona-label');
  await expect(personaLabel).toHaveText(fromLabel);
  
  // Open dropdown
  const personaButton = page.locator('#qc-persona-button');
  await personaButton.click();
  
  // Select new persona
  const toOption = page.locator(`[data-persona="${toPersonaId}"]`);
  await toOption.click();

  // DEBUG: log localStorage immediately after click to help diagnose persistence timing
  const dbgNow = await page.evaluate(() => ({
    persona: localStorage.getItem('qc_persona_choice'),
    confirmed: localStorage.getItem('qc_persona_confirmed')
  }));
  console.log('DEBUG localStorage after click:', dbgNow);
  
  // Verify new state
  await expect(personaLabel).toHaveText(toLabel);
  
  // Verify localStorage updated
  // Wait for the app to persist the new persona into localStorage (stability)
  await page.waitForFunction((id) => localStorage.getItem('qc_persona_choice') === id, toPersonaId, { timeout: 5000 });
  const savedPersona = await page.evaluate(() => localStorage.getItem('qc_persona_choice'));
  expect(savedPersona).toBe(toPersonaId);
}
