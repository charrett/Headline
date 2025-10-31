# Quick Test Setup

## Before running the test:

1. **Update test-config.js with your test article:**
   ```bash
   cd tests
   # Edit test-config.js and update testArticle.slug to your actual article
   ```

2. **Make sure all services are running:**
   ```bash
   # Terminal 1: Ghost
   cd /Users/annemarie/Documents/temp/GitHub/ghost/lghost
   ghost start
   
   # Terminal 2: API Server
   cd /Users/annemarie/Documents/temp/GitHub/article-tips-api
   npm start
   
   # Terminal 3: Stripe Webhook
   cd /Users/annemarie/Documents/temp/GitHub/article-tips-api
   stripe listen --forward-to localhost:4000/api/webhook/stripe
   ```

3. **Run the test:**
   ```bash
   npm run test:e2e
   ```

## What the test does:

1. ✅ Visits your paid article
2. ✅ Clicks "Buy for $5" 
3. ✅ Fills Stripe checkout with test card
4. ✅ Completes payment
5. ✅ Verifies success message appears
6. ✅ Verifies Ghost signin portal opens
7. ✅ Requests magic link

**Note:** The test stops at "check your email" - it doesn't click the magic link (that would require email access).
