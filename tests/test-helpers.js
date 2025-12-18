// Helper functions for E2E tests
const config = require('./test-config');
const sqlite3 = require('sqlite3');
const { promisify } = require('util');

/**
 * Clear Ghost's rate limiting brute force table
 * This resets all rate limiting counters - based on Ghost's testing pattern
 * Call this before each test to prevent rate limiting issues
 */
async function clearRateLimitTable() {
  const dbPath = '/Users/annemarie/Documents/temp/GitHub/ghost/lghost/content/data/ghost-local.db';
  
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        reject(new Error(`Failed to open Ghost database: ${err.message}`));
        return;
      }

      // Truncate the brute table (rate limiting records)
      db.run(`DELETE FROM brute`, (err) => {
        db.close();
        if (err) {
          reject(new Error(`Failed to clear rate limit table: ${err.message}`));
        } else {
          console.log('   ✓ Rate limit table cleared');
          resolve();
        }
      });
    });
  });
}

/**
 * Delete a member from Ghost database (test cleanup)
 * @param {string} email - Member email address
 */
async function deleteMemberFromDatabase(email) {
  const dbPath = '/Users/annemarie/Documents/temp/GitHub/ghost/lghost/content/data/ghost-local.db';
  
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        reject(new Error(`Failed to open Ghost database: ${err.message}`));
        return;
      }

      // Delete member and related records
      db.serialize(() => {
        // Delete tokens for this member
        db.run(`DELETE FROM tokens WHERE json_extract(data, '$.email') = ?`, [email]);
        
        // Delete member subscriptions
        db.run(`DELETE FROM members_stripe_customers_subscriptions 
                WHERE customer_id IN (
                  SELECT customer_id FROM members_stripe_customers 
                  WHERE member_id IN (SELECT id FROM members WHERE email = ?)
                )`, [email]);
        
        // Delete member stripe customers
        db.run(`DELETE FROM members_stripe_customers 
                WHERE member_id IN (SELECT id FROM members WHERE email = ?)`, [email]);
        
        // Delete the member
        db.run(`DELETE FROM members WHERE email = ?`, [email], (err) => {
          db.close();
          if (err) {
            reject(new Error(`Failed to delete member: ${err.message}`));
          } else {
            resolve();
          }
        });
      });
    });
  });
}

/**
 * Get the most recent magic link token for a member directly from Ghost's database
 * This is test-only code and should NEVER be used in production
 * @param {string} email - Member email address
 * @returns {Promise<string|null>} - Magic link token or null if not found
 */
async function getMagicLinkTokenFromDatabase(email) {
  const dbPath = '/Users/annemarie/Documents/temp/GitHub/ghost/lghost/content/data/ghost-local.db';
  
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
      if (err) {
        reject(new Error(`Failed to open Ghost database: ${err.message}`));
        return;
      }

      // Query for the most recent token for this email
      // Note: During purchase, Ghost creates the member but might use 'signup' or 'signin' type
      // We'll get the most recent one regardless of type
      db.get(
        `SELECT token, data FROM tokens 
         WHERE json_extract(data, '$.email') = ? 
         ORDER BY created_at DESC 
         LIMIT 1`,
        [email],
        (err, row) => {
          db.close();
          
          if (err) {
            reject(new Error(`Database query failed: ${err.message}`));
            return;
          }
          
          if (row) {
            console.log(`   Token type: ${JSON.parse(row.data).type}`);
          }
          
          resolve(row ? row.token : null);
        }
      );
    });
  });
}

/**
 * Sign in as a Ghost member using magic link (Ghost's testing pattern)
 * This requests a magic link, extracts token from database, and navigates to it
 * Based on Ghost's own E2E test pattern from ghost/core/test/e2e-frontend/members.test.js
 * @param {Page} page - Playwright page object
 * @param {string} email - Member email address
 * @param {string} redirectUrl - Optional URL to redirect to after signin (defaults to current page)
 * @returns {Promise<boolean>} - True if signin successful
 */
async function signinAsMember(page, email, redirectUrl = null) {
  // Use current page URL as redirect if not specified
  const redirect = redirectUrl || page.url();
  
  console.log(`   Requesting magic link with redirect to: ${redirect}`);
  
  // Request a magic link via Ghost Members API using page.evaluate to ensure same context
  const apiResponse = await page.evaluate(async (data) => {
    const response = await fetch('/members/api/send-magic-link/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText
    };
  }, {
    email: email,
    emailType: 'signin',
    redirectUrl: redirect,
  });
  
  if (!apiResponse.ok) {
    throw new Error(`Failed to request magic link: ${apiResponse.status} ${apiResponse.statusText}`);
  }
  
  console.log(`   ✓ Magic link requested for ${email}`);
  
  // Wait for token to be written to database
  await page.waitForTimeout(1000);
  
  // Debug: Check member status in database
  const dbPath = '/Users/annemarie/Documents/temp/GitHub/ghost/lghost/content/data/ghost-local.db';
  const memberStatus = await new Promise((resolve) => {
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, () => {
      db.get(
        `SELECT status, name FROM members WHERE email = ?`,
        [email],
        (err, row) => {
          db.close();
          resolve(row || null);
        }
      );
    });
  });
  
  if (memberStatus) {
    console.log(`   Member status: ${memberStatus.status}, name: ${memberStatus.name || 'null'}`);
  }
  
  // Get the magic link token from database
  const token = await getMagicLinkTokenFromDatabase(email);
  
  if (!token) {
    throw new Error(`No magic link token found for ${email}`);
  }
  
  console.log(`   ✓ Magic link token retrieved from database`);
  
  // Navigate to the magic link URL with the redirect URL included
  // The magic link should redirect to the specified URL after authentication
  const signinUrl = new URL(redirect);
  signinUrl.searchParams.set('token', token);
  signinUrl.searchParams.set('action', 'signin');
  
  console.log(`   Navigating to: ${signinUrl.toString()}`);
  
  const response2 = await page.goto(signinUrl.toString(), {
    waitUntil: 'networkidle'
  });  console.log(`   Response status: ${response2.status()}`);
  
  // Check the response - Ghost should redirect with success parameter
  const currentUrl = page.url();
  console.log(`   Magic link redirect URL: ${currentUrl}`);
  
  // Ghost's pattern: Check if success=true appears in URL after redirect
  if (currentUrl.includes('success=false')) {
    throw new Error('Magic link signin failed - Ghost returned success=false');
  }
  
  // Even if URL doesn't show success=true (may redirect away), check for cookies
  // Ghost sets 'ghost-members-ssr' cookie on successful signin
  const cookies = await page.context().cookies();
  const memberCookie = cookies.find(cookie => cookie.name === 'ghost-members-ssr');
  
  console.log(`   Member cookie present: ${!!memberCookie}`);
  
  return !!memberCookie;
}

/**
 * Check if user is currently signed in to Ghost
 * @param {Page} page - Playwright page object
 * @returns {Promise<boolean>} - True if signed in
 */
async function isSignedIn(page) {
  const cookies = await page.context().cookies();
  // Ghost sets the cookie as 'ghost-members-ssr' (not 'members-ssr')
  return cookies.some(cookie => cookie.name === 'ghost-members-ssr');
}

module.exports = {
  clearRateLimitTable,
  deleteMemberFromDatabase,
  getMagicLinkTokenFromDatabase,
  signinAsMember,
  isSignedIn,
};
