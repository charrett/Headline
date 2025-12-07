const { test, expect } = require('@playwright/test');
const config = require('./test-config');
const { signinAsMember, isSignedIn } = require('./test-helpers');

// Ensure config.ghost.url is defined
if (!config.ghost) {
  config.ghost = {};
}
if (!config.ghost.url) {
  config.ghost.url = process.env.GHOST_URL || 'http://localhost:2368';
}

test.describe('Quality Coach Chatbot', () => {
  
  test('logged in member can see and open the chat widget', async ({ page }) => {
    // Step 1: Initialize Ghost session
    console.log('Step 1: Initialize browser session with Ghost');
    await page.goto(config.ghost.url);
    
    // Step 2: Sign in as a paid member (using test helper)
    // Note: You need a valid member in your local Ghost DB for this to work
    // or we need to create one. For now, assuming 'paid-member@example.com' exists
    // or we can use the config.users.paid if it exists.
    const memberEmail = config.users?.paid?.email || 'paid-member@example.com';
    console.log(`Step 2: Signing in as ${memberEmail}`);
    
    // We need to be on a page to sign in
    await signinAsMember(page, memberEmail);
    
    // Verify we are signed in
    const signedIn = await isSignedIn(page);
    expect(signedIn).toBeTruthy();
    
    // Step 3: Navigate to a page where the widget should appear
    // (It should appear on all pages for paid members)
    await page.goto(config.ghost.url);
    
    // Step 4: Verify the widget button is visible
    console.log('Step 4: Verify chat widget button is visible');
    const chatButton = page.locator('#qc-chat-button');
    await expect(chatButton).toBeVisible();
    
    // Step 5: Open the chat window
    console.log('Step 5: Open chat window');
    await chatButton.click();
    
    const chatWindow = page.locator('#qc-chat-window');
    await expect(chatWindow).toBeVisible();
    
    // Step 6: Verify welcome message
    const welcomeMessage = page.locator('.qc-welcome-message');
    await expect(welcomeMessage).toBeVisible();
    await expect(welcomeMessage).toContainText("Quality Coach Companion");
    
    // Step 7: Verify input area exists
    const input = page.locator('#qc-input');
    await expect(input).toBeVisible();
  });

  test('anonymous user cannot see the chat widget', async ({ page }) => {
    // Step 1: Go to homepage without signing in
    await page.goto(config.ghost.url);
    
    // Step 2: Verify widget is NOT visible
    const chatButton = page.locator('#qc-chat-button');
    await expect(chatButton).not.toBeVisible();
    
    // Step 3: Verify locked message might be present (if configured to show teaser)
    // or just ensure the widget isn't there.
    // Based on the hbs file: {{#if @member}} ... {{else}} <div class="qc-locked-message">...</div> {{/if}}
    // So we should see the locked message if we look for it, or at least NOT see the button.
    
    // If the widget is completely hidden for non-members (which is common), 
    // we just check for absence of button.
    // But the HBS shows an {{else}} block with .qc-locked-message.
    // However, that might be inside a container that is only rendered in certain contexts.
    // Let's check if the locked message is visible if we are on a post page?
    // For now, just verifying the button is absent is good enough.
  });
});
