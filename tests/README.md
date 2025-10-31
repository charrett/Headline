# Pay-per-Article E2E Tests

Playwright tests for the pay-per-article purchase flow.

## Setup

1. **Update test configuration:**
   Edit `tests/test-config.js` with your test article details:
   - Update `testArticle.slug` to your actual test article slug
   - Ensure Ghost is running on `http://localhost:2368`
   - Ensure API server is running on `http://localhost:4000`
   - Ensure Stripe webhook listener is running

2. **Install dependencies:**
   ```bash
   npm install
   ```

## Running Tests

```bash
# Run all tests
npm run test:e2e

# Run with UI mode (recommended for debugging)
npm run test:e2e:ui

# Run in debug mode
npm run test:e2e:debug

# Run specific test
npx playwright test tests/anonymous-purchase.spec.js
```

## Test Scenarios

### 1. Anonymous User Purchase (anonymous-purchase.spec.js)
Tests that an anonymous (not signed in) user can:
- View paywall on paid article
- Click "Buy for $5"
- Complete Stripe checkout
- Return to article with success message
- See Ghost signin portal open automatically
- Request magic link to complete signin

**Expected Flow:**
1. User visits paid article → sees paywall
2. Clicks "Buy for $5" → redirects to Stripe
3. Enters email + payment details → completes purchase
4. Returns to article → success message shows
5. Ghost signin portal opens automatically
6. User enters email → requests magic link
7. (In production: User clicks magic link → signed in → sees article)

### 2. Free Member Purchase (coming soon)
Tests that a free Ghost member can purchase article access.

### 3. Paid Member (coming soon)
Tests that paid subscribers don't see paywall.

## Test Data

All test configuration is in `tests/test-config.js`:
- Ghost URLs
- API URLs  
- Test article details
- Stripe test card
- Test user emails

Update this file before running tests.

## Troubleshooting

**Test fails at Stripe checkout:**
- Verify Stripe test mode is enabled
- Check that API server is running
- Ensure webhook listener is active

**Ghost portal doesn't open:**
- Check Ghost members are enabled
- Verify Ghost portal is configured
- Check browser console for errors

**Success message doesn't appear:**
- Verify redirect URL in Stripe checkout creation
- Check that `?purchase=success` query param is present
- Verify paywall.js is loaded correctly
