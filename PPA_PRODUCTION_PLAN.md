# Pay-Per-Article Production Implementation Plan

## Current Status (Nov 1, 2025)

### Working MVP Implementation
The current `ppa-simplified` branch has a working local implementation:

**Frontend (Theme)**:
- `assets/js/lib/ppa.js` - Simplified PPA JavaScript (180 lines)
- `assets/css/screen.css` - Paywall styling using Ghost accent color
- `post.hbs` - Data attributes for post metadata
- `gulpfile.js` - Fixed with ordered-read-streams for proper JS loading

**Backend (API Server)**:
- Stripe checkout session creation
- Webhook handling for payment processing
- SQLite database for purchase tracking
- Ghost Admin API integration for member verification

**What Works**:
✅ Free members see orange paywall with two buttons:
  - "Buy this article for $5" (PPA option)
  - "Upgrade to subscription" (full membership)
✅ Stripe checkout flow completes successfully
✅ Purchase records stored in database
✅ Access verification via API
✅ Content injection after purchase (JavaScript-based)

### Known Issues with Current Approach

1. **Security**: Full article HTML exposed in browser network requests (verification response includes content)
2. **Content Sharing**: Easy to copy HTML from network logs and share without payment
3. **No Token Expiry**: Access verification returns content directly without time-limited tokens
4. **SEO**: JavaScript-injected content not indexable by search engines
5. **Performance**: Content delivery not rate-limited (potential for abuse)
6. **Legal Compliance**: Missing required policies and terms
   - No Privacy Policy (required for payment/data collection)
   - No Terms of Service (purchase terms, refunds, access rights)
   - No Cookie Policy (if using analytics)
   - GDPR compliance requirements (EU users - consent, data deletion rights)
   - Stripe Terms of Service compliance
   - Tax collection/remittance (varies by jurisdiction)

## Recommended Production Approach: Token-Based Content Delivery

### Secure Two-Step Content Access

Instead of returning full article HTML in the verification response, use a two-step process with short-lived tokens.

#### Architecture

```
User purchases article
    ↓
Stripe webhook creates purchase record in database
    ↓
User returns to article with ?purchase=success&session_id=xxx
    ↓
Step 1: Theme calls /api/verify-access (returns accessToken, NOT content)
    ↓
Step 2: Theme calls /api/get-content/:postId with accessToken
    ↓
Server validates token, returns HTML (token consumed/expires)
    ↓
Theme injects content into page (within Ghost's styling)
```

#### Implementation Steps

##### 1. Update Access Verification Endpoint

**Modified `/api/verify-access` endpoint** - Remove `includeContent` parameter:

```javascript
// src/routes/access.js
router.post('/verify-access', async (req, res) => {
  const { postId, memberEmail, sessionId } = req.body;
  
  // Verify access via session or member lookup
  const hasAccess = await verifyAccess(postId, memberEmail, sessionId);
  
  if (hasAccess) {
    // Generate short-lived access token (15 minutes)
    const { token, expiresAt } = generateAccessToken(postId, memberEmail, 0.01); // 0.01 days = ~15 min
    
    return res.json({ 
      hasAccess: true,
      accessToken: token,
      expiresAt: expiresAt
    });
  }
  
  res.json({ hasAccess: false });
});
```

##### 2. Create Secure Content Delivery Endpoint

**New API Route**: `/api/get-content/:postId`

```javascript
// src/routes/access.js
router.get('/get-content/:postId', async (req, res) => {
  const { postId } = req.params;
  const token = req.query.token || req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }
  
  try {
    // Verify HMAC token
    const verified = verifyAccessToken(token);
    
    if (!verified.valid) {
      return res.status(403).json({ error: 'Invalid or expired token', reason: verified.reason });
    }
    
    // Ensure token matches requested post
    if (verified.postId !== postId) {
      return res.status(403).json({ error: 'Token not valid for this article' });
    }
    
    // Double-check database for purchase record
    const hasAccess = await db.checkArticleAccess(postId, verified.memberId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'No purchase record found' });
    }
    
    // Fetch full article content from Ghost Admin API
    const postContent = await ghostAdmin.getPostContent(postId);
    
    if (!postContent) {
      return res.status(404).json({ error: 'Article not found' });
    }
    
    // Log access for analytics/audit
    console.log(`✓ Content delivered for post ${postId}, member ${verified.memberId}`);
    
    res.json({ 
      html: postContent.html,
      title: postContent.title
    });
    
  } catch (error) {
    console.error('Content delivery error:', error);
    res.status(500).json({ error: 'Failed to retrieve content' });
  }
});
```

##### 3. Update Theme JavaScript

**Modified `ppa.js`** - Two-step content fetching:

```javascript
// After successful purchase verification
async function loadPurchasedContent(postId, sessionId) {
  try {
    // Step 1: Verify access and get token
    const verifyResponse = await fetch(`${API_URL}/verify-access`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postId, sessionId })
    });
    
    const { hasAccess, accessToken } = await verifyResponse.json();
    
    if (!hasAccess || !accessToken) {
      showError('Purchase verification failed');
      return;
    }
    
    // Step 2: Fetch content with token
    const contentResponse = await fetch(`${API_URL}/get-content/${postId}?token=${accessToken}`);
    
    if (!contentResponse.ok) {
      showError('Failed to load article content');
      return;
    }
    
    const { html } = await contentResponse.json();
    
    // Inject into page
    injectContent(html);
    
  } catch (error) {
    console.error('Error loading content:', error);
    showError('Failed to load article');
  }
}
```

##### 4. Add Rate Limiting to Content Endpoint

**Enhanced security** - Prevent token sharing/abuse:

```javascript
// src/server.js
const contentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: IS_LOCAL ? 50 : 5, // Max 5 content requests per 15 min in production
  message: 'Too many content requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false
});

app.use('/api/get-content', contentLimiter);
```

#### Advantages Over Current Approach

✅ **Secure**: Content not in verification response (separate secure endpoint)  
✅ **Token-Based**: Short-lived tokens prevent unauthorized sharing  
✅ **Rate Limited**: Prevents abuse and scraping  
✅ **Audit Trail**: Log every content access for analytics  
✅ **Simple**: No template engine needed - stays within Ghost theme  
✅ **Existing Infrastructure**: Uses current HMAC token system  
✅ **Graceful Expiry**: Tokens expire in 15 minutes (can re-verify if needed)

#### Migration Path

1. Implement new `/get-content` endpoint in API server
2. Update `/verify-access` to return tokens instead of content
3. Update theme JavaScript to use two-step process
4. Test locally with token expiry scenarios
5. Deploy to production
6. Monitor rate limiting logs for abuse patterns

## Alternative Options Considered

### Option 1: Return Content in Verification Response (Current Local Implementation)

- **Pro**: Simple, single API call
- **Con**: Full article HTML exposed in browser network logs (security risk)
- **Con**: Easy to copy/share content without paying
- **Verdict**: Not suitable for production

### Option 2: Server-Side Rendered Page (Template Engine Approach)

- **Pro**: Content never exposed in network logs
- **Pro**: SEO-friendly (server-rendered HTML)
- **Con**: Requires template engine (Handlebars, EJS, etc.)
- **Con**: Duplicates Ghost's theme styling
- **Con**: Separate page outside Ghost (user experience fragmentation)
- **Verdict**: Too complex, doesn't leverage Ghost's existing theme

### Option 3: Upgrade Member to Paid Tier

- **Pro**: Uses Ghost's native access control
- **Con**: Grants access to ALL content, not just purchased article
- **Verdict**: Not suitable for pay-per-article model

### Option 4: Encrypted Content Storage

- **Pro**: Full control over content delivery
- **Con**: Requires duplicating Ghost's content in separate database
- **Verdict**: Too complex for initial implementation

## Configuration Changes for Production

### Environment Variables

```bash
# Production .env for API server
NODE_ENV=production
GHOST_URL=https://annemariecharrett.com
GHOST_ADMIN_API_URL=https://charrett.ghost.io
GHOST_ADMIN_API_KEY=<production_key>
DATABASE_URL=postgresql://... # Use PostgreSQL in production
ACCESS_TOKEN_SECRET=<strong_random_secret>
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

### Theme Configuration

Update `assets/js/lib/ppa.js`:

```javascript
const API_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:4000/api'
  : 'https://ppa.fly.dev/api'; // Production API URL
```

## Testing Checklist

Before deploying to production:

**Technical Testing:**

- [ ] Test purchase flow with real Stripe account
- [ ] Verify access tokens expire correctly (15 min default)
- [ ] Test two-step content fetching (verify-access → get-content)
- [ ] Confirm expired tokens are rejected properly
- [ ] Test rate limiting on content endpoint (5 requests/15 min)
- [ ] Verify token can't be reused across different articles
- [ ] Confirm database migrations work on PostgreSQL
- [ ] Load test API server under traffic
- [ ] Verify CORS settings for production domain
- [ ] Test error handling (payment failed, invalid token, expired token, etc.)
- [ ] Check mobile responsiveness of content injection
- [ ] Verify analytics/audit logging works
- [ ] Test with JavaScript disabled (graceful degradation)
- [ ] Verify content not visible in network logs during verification

**Legal & Compliance:**

- [ ] Privacy Policy created and published (link in footer)
- [ ] Terms of Service created and published (link in footer)
- [ ] Cookie Policy if using analytics/tracking
- [ ] Privacy Policy linked in checkout flow (Stripe requirement)
- [ ] GDPR compliance: Cookie consent banner (if serving EU)
- [ ] GDPR compliance: Data deletion/export mechanism
- [ ] Refund policy clearly stated
- [ ] Email receipt includes T&C links
- [ ] Tax calculation implemented (if required in your jurisdiction)
- [ ] Business registered for tax collection (if required)

## Deployment Steps

1. Deploy API server to Fly.io with production config
2. Upload theme to production Ghost
3. Create production Stripe webhook
4. Update DNS/environment variables
5. Test with real payment (small amount)
6. Monitor error logs for 24 hours
7. Announce feature to users

## Future Enhancements

- [ ] Email receipt with access link
- [ ] Download PDF of purchased article
- [ ] Access history dashboard for users
- [ ] Analytics on popular paid articles
- [ ] Bundled pricing (buy 3 articles for $10)
- [ ] Gift article to someone else
- [ ] Time-limited access (expires after 30 days)
- [ ] Refund handling via Stripe

---

**Status**: Ready for production implementation  
**Next Steps**: Implement token-based content delivery endpoints  
**Timeline**: 1 day development + 1 day testing  
**Approach**: Two-step content access with short-lived HMAC tokens
