const { test, expect } = require('@playwright/test');
const config = require('./test-config');
const { signinAsMember, isSignedIn, deleteMemberFromDatabase, getMagicLinkTokenFromDatabase } = require('./test-helpers');

// Ensure config.ghost.url is defined
if (!config.ghost) {
  config.ghost = {};
}
if (!config.ghost.url) {
  config.ghost.url = process.env.GHOST_URL || 'http://localhost:2368';
}

test.describe('Pay-per-article: Anonymous user purchase flow', () => {
  
  // Cleanup only if test fails
  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      console.log('\n🧹 Test failed - cleaning up test member from Ghost database');
      try {
        await deleteMemberFromDatabase(config.users.anonymous.email);
        console.log(`   ✓ Deleted member: ${config.users.anonymous.email}`);
      } catch (err) {
        console.log(`   ⚠ Cleanup failed: ${err.message}`);
      }
    }
  });
  
  test('anonymous user can purchase article and access after signin', async ({ page }) => {
    // Step 0: Initialize Ghost session by visiting homepage first
    console.log('Step 0: Initialize browser session with Ghost');
    await page.goto(config.ghost.url);
    await page.waitForTimeout(500);
    
    // Step 1: Navigate to paid article (not signed in)
    console.log('Step 1: Navigate to paid article as anonymous user');
    await page.goto(config.testArticle.url);
    
    // Step 2: Verify paywall is visible
    console.log('Step 2: Verify paywall is displayed');
    const paywall = page.locator('.gh-post-upgrade-cta');
    await expect(paywall).toBeVisible();
    
    const buyButton = page.locator('#buy-article-btn');
    await expect(buyButton).toBeVisible();
    await expect(buyButton).toContainText('$5');
    
    // Step 3: Click "Buy for $5" button
    console.log('Step 3: Click Buy Article button');
    await buyButton.click();
    
    // Step 4: Wait for Stripe checkout page
    console.log('Step 4: Wait for redirect to Stripe');
    await page.waitForURL(/checkout\.stripe\.com/, { timeout: 10000 });
    expect(page.url()).toContain('stripe.com');
    
    // Step 5: Fill in Stripe checkout form
    console.log('Step 5: Fill Stripe checkout form');
    
    // Wait for form to be ready
    await page.waitForSelector('input[name="email"]', { timeout: 5000 });
    
    // Fill email
    await page.fill('input[name="email"]', config.users.anonymous.email);
    
    // Fill card number
    await page.fill('input[placeholder*="1234"]', config.stripe.cardNumber);
    
    // Fill expiry
    await page.fill('input[placeholder*="MM"]', config.stripe.expiry);
    
    // Fill CVC
    await page.locator('input[placeholder="CVC"]').fill(config.stripe.cvc);
    
    // Fill cardholder name
    await page.fill('input[placeholder*="Full name"]', 'Test User');
    
    // Step 6: Submit payment
    console.log('Step 6: Submit Stripe payment');
    const submitButton = page.locator('button[type="submit"]').filter({ hasText: /Pay|Subscribe/ });
    await submitButton.click();
    
    // Step 7: Wait for redirect back to article with success
    console.log('Step 7: Wait for redirect back to article');
    await page.waitForURL(new RegExp(config.testArticle.slug), { timeout: 30000 });
    
    // Step 8: Verify success message appears
    console.log('Step 8: Verify purchase success message');
    const successOverlay = page.locator('.gh-purchase-success-overlay');
    await expect(successOverlay).toBeVisible({ timeout: 5000 });
    
    const successMessage = page.locator('.gh-purchase-success-message');
    await expect(successMessage).toContainText('Purchase Complete');
    await expect(successMessage).toContainText('sign in');
    
    // Step 9: Verify purchase success and portal opens
    console.log('Step 9: Verify Ghost signin portal opens automatically');
    // Wait for portal iframe to appear (has title="portal-popup")
    await page.waitForTimeout(2000); 
    
    const ghostPortalIframe = page.locator('iframe[title="portal-popup"]');
    await ghostPortalIframe.waitFor({ state: 'attached', timeout: 5000 });
    console.log('   ✓ Ghost portal opened');
    
    // Step 10: Fill in email in portal and request magic link
    console.log('Step 10: Fill in email in Ghost portal and request signin link');
    
    const portalFrame = page.frameLocator('iframe[title="portal-popup"]');
    
    // Wait for email input to be visible
    const emailInput = portalFrame.locator('input[name="email"]');
    await emailInput.waitFor({ state: 'visible', timeout: 5000 });
    
    // Fill in the email
    await emailInput.fill(config.users.anonymous.email);
    console.log(`   ✓ Filled email: ${config.users.anonymous.email}`);
    
    // Click the signin button
    const signinButton = portalFrame.locator('button[type="submit"]');
    await signinButton.click();
    console.log('   ✓ Clicked signin button');
    
    // Wait for "check your email" message
    await page.waitForTimeout(2000);
    
    // Step 11: Get magic link token from database and authenticate
    console.log('Step 11: Get magic link from database and authenticate');
    
    // Wait for token to be written to database
    await page.waitForTimeout(1000);
    
    // Debug: Check how many tokens exist for this email
    const sqlite3 = require('sqlite3');
    const dbPath = '/Users/annemarie/Documents/temp/GitHub/ghost/lghost/content/data/ghost-local.db';
    const tokenCount = await new Promise((resolve) => {
      const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, () => {
        db.get(
          `SELECT COUNT(*) as count FROM tokens WHERE json_extract(data, '$.email') = ?`,
          [config.users.anonymous.email],
          (err, row) => {
            db.close();
            resolve(row ? row.count : 0);
          }
        );
      });
    });
    console.log(`   Found ${tokenCount} magic link token(s) for ${config.users.anonymous.email}`);
    
    // Get the magic link token
    const token = await getMagicLinkTokenFromDatabase(config.users.anonymous.email);
    if (!token) {
      throw new Error(`No magic link token found for ${config.users.anonymous.email}`);
    }
    console.log('   ✓ Retrieved magic link token from database');
    
    // Navigate to Ghost's /members/ endpoint with the token (this is where Ghost processes magic links)
    // Include the article URL as the 'r' (redirect) parameter so Ghost redirects back after signin
    const signinUrl = new URL(`${config.ghost.url}/members/`);
    signinUrl.searchParams.set('token', token);
    signinUrl.searchParams.set('action', 'signin');
    signinUrl.searchParams.set('r', config.testArticle.url);
    
    console.log(`   Navigating to Ghost members endpoint: ${signinUrl.toString()}`);
    
    // Capture the response to see the actual headers including Set-Cookie
    const responsePromise = page.waitForResponse(response => 
      response.url().includes('/members/') && response.status() === 302
    );
    
    // Navigate to the magic link - Ghost will process it and redirect back to the article
    const gotoPromise = page.goto(signinUrl.toString(), { waitUntil: 'networkidle' });
    
    // Wait for both the response and the navigation to complete
    const [response] = await Promise.all([responsePromise, gotoPromise]);
    
    // Debug: Check the response headers
    const headers = response.headers();
    console.log(`   Response status: ${response.status()}`);
    console.log(`   Set-Cookie header present: ${!!headers['set-cookie']}`);
    if (headers['set-cookie']) {
      console.log(`   Set-Cookie header: ${headers['set-cookie']}`);
    }
    
    console.log(`   After signin, current URL: ${page.url()}`);
    
    // Wait a moment for any async cookie setting
    await page.waitForTimeout(2000);
    
    // Debug: Log ALL cookies with full details
    const allCookies = await page.context().cookies();
    console.log(`   Total cookies: ${allCookies.length}`);
    const membersCookie = allCookies.find(c => c.name === 'ghost-members-ssr');
    if (membersCookie) {
      console.log(`   ✓ Found ghost-members-ssr cookie!`);
      console.log(`   Cookie details:`, JSON.stringify(membersCookie, null, 2));
    } else {
      console.log(`   ❌ No ghost-members-ssr cookie found`);
      console.log(`   Cookie names: ${allCookies.map(c => c.name).join(', ')}`);
      // Log first few cookies with their domains
      allCookies.slice(0, 3).forEach(c => {
        console.log(`   - ${c.name}: domain=${c.domain}, path=${c.path}, httpOnly=${c.httpOnly}`);
      });
    }
    
    // Verify signed in
    const signedIn = await isSignedIn(page);
    console.log(`   Signed in check: ${signedIn}`);
    expect(signedIn).toBe(true);
    
    // Step 12: Verify we're back on the article page with full access
    console.log('Step 12: Verify on article page and user is signed in');
    
    // Should be on the article page after signin
    expect(page.url()).toContain(config.testArticle.slug);
    
    // Verify user is signed in
    const isUserSignedIn = await isSignedIn(page);
    expect(isUserSignedIn).toBe(true);
    
    // Step 15: Verify paywall is NOT visible (user has access)
    console.log('Step 13: Verify paywall is hidden and article content is accessible');
    const paywallAfterSignin = page.locator('.gh-post-upgrade-cta');
    await expect(paywallAfterSignin).not.toBeVisible();
    
    // Verify article content is visible
    const articleContent = page.locator('.gh-content');
    await expect(articleContent).toBeVisible();
    
    console.log('✅ Test completed successfully!');
    console.log('   ✓ Anonymous user purchased article for $5');
    console.log('   ✓ Stripe payment processed');
    console.log('   ✓ Redirected back to article');
    console.log('   ✓ Ghost member account created');  
    console.log('   ✓ Signin portal opened automatically');
    console.log('   ✓ Magic link email requested');
    console.log('   ✓ Member authenticated via magic link');
    console.log('   ✓ Paywall hidden after signin');
    console.log('   ✓ Full article content accessible');
    
    // Cleanup: Delete test member from Ghost database
    console.log('\n🧹 Cleanup: Deleting test member from Ghost database');
    try {
      await deleteMemberFromDatabase(config.users.anonymous.email);
      console.log(`   ✓ Deleted member: ${config.users.anonymous.email}`);
    } catch (err) {
      console.log(`   ⚠ Cleanup failed: ${err.message}`);
    }
  });
  
});
