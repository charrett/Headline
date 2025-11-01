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

1. **Security**: Full article HTML exposed in browser network requests
2. **Performance**: Extra API call on every page load for content injection
3. **SEO**: JavaScript-injected content not indexable
4. **Caching**: Bypasses Ghost's native caching system
5. **Fragility**: Depends on client-side JavaScript execution

## Recommended Production Approach: Server-Side Rendering

### Option 2: Secure Server-Side Content Delivery

Instead of injecting content via JavaScript, serve a server-rendered page for purchased articles.

#### Architecture

```
User purchases article
    ↓
Stripe webhook creates purchase record
    ↓
User returns to article with ?purchase=success
    ↓
Redirect to: /api/article-access/{postId}?token={jwt}
    ↓
Server verifies purchase + generates page with full content
    ↓
User sees complete article (server-rendered HTML)
```

#### Implementation Steps

##### 1. Create Article Access Endpoint

**New API Route**: `/api/article-access/:postId`

```javascript
// src/routes/article-access.js
router.get('/article-access/:postId', async (req, res) => {
  const { postId } = req.params;
  const token = req.query.token; // JWT with member email
  
  try {
    // Verify JWT token
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    const memberEmail = decoded.email;
    
    // Check if member purchased this article
    const hasAccess = await db.checkArticleAccess(postId, memberEmail);
    
    if (!hasAccess) {
      return res.status(403).send('Access denied');
    }
    
    // Fetch full article from Ghost Admin API
    const post = await ghostAdmin.getPost(postId, { formats: 'html' });
    
    // Render article page with full content
    res.render('article-access', {
      post,
      memberEmail,
      expiresAt: decoded.exp
    });
    
  } catch (error) {
    console.error('Article access error:', error);
    res.status(500).send('Error loading article');
  }
});
```

##### 2. Create Article Template

**New Template**: `views/article-access.hbs`

Server-rendered page that mimics Ghost's post template but with full content:

```handlebars
<!DOCTYPE html>
<html>
<head>
  <title>{{post.title}} - Article Access</title>
  <link rel="stylesheet" href="{{ghostUrl}}/assets/built/screen.css">
</head>
<body>
  <article class="gh-article">
    <header>
      <h1>{{post.title}}</h1>
    </header>
    
    <div class="gh-content">
      {{{post.html}}}
    </div>
    
    <footer>
      <p>You have lifetime access to this article.</p>
      <a href="{{ghostUrl}}">Back to site</a>
    </footer>
  </article>
</body>
</html>
```

##### 3. Update Purchase Flow

**Modified ppa.js**:

```javascript
// After successful purchase
if (window.location.search.includes('purchase=success')) {
  const postId = article.dataset.postId;
  const sessionId = new URLSearchParams(window.location.search).get('session_id');
  
  // Exchange session for access token
  fetch(`${API_URL}/create-access-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ postId, sessionId })
  })
  .then(res => res.json())
  .then(data => {
    // Redirect to server-rendered article page
    window.location.href = `${API_URL}/article-access/${postId}?token=${data.token}`;
  });
}
```

##### 4. Issue Short-Lived Access Tokens

**New API Endpoint**: `/api/create-access-token`

```javascript
router.post('/create-access-token', async (req, res) => {
  const { postId, sessionId } = req.body;
  
  // Verify Stripe session
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  
  if (session.payment_status !== 'paid') {
    return res.status(403).json({ error: 'Payment not completed' });
  }
  
  // Create JWT token (expires in 24 hours)
  const token = jwt.sign(
    { 
      postId,
      email: session.customer_email,
      exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60)
    },
    process.env.ACCESS_TOKEN_SECRET
  );
  
  res.json({ token });
});
```

#### Advantages Over Current Approach

✅ **Secure**: Content never exposed in browser network logs  
✅ **SEO-Friendly**: Actual HTML page (crawlable by search engines)  
✅ **Performance**: Server-side rendering with caching potential  
✅ **Per-Article Control**: Access specific to purchased article  
✅ **Works Without JS**: Doesn't rely on client-side JavaScript  
✅ **Token Expiry**: Can implement time-limited access if needed  
✅ **Offline Reading**: Could generate PDF from server-rendered page

#### Migration Path

1. Keep current JavaScript approach for MVP/testing
2. Implement server-side rendering alongside (non-breaking)
3. A/B test both approaches
4. Switch production traffic to server-side version
5. Remove client-side injection code

## Alternative Options Considered

### Option 1: Upgrade Member to Paid Tier
- **Pro**: Uses Ghost's native access control
- **Con**: Grants access to ALL content, not just purchased article
- **Verdict**: Not suitable for pay-per-article model

### Option 3: Encrypted Content Storage
- **Pro**: Full control over content delivery
- **Con**: Requires duplicating Ghost's content in separate database
- **Verdict**: Too complex for initial implementation

### Option 4: JWT-Based Content Proxy
- **Pro**: More flexible than current approach
- **Con**: Still requires API call on every page load
- **Verdict**: Similar to Option 2 but more complex

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

- [ ] Test purchase flow with real Stripe account
- [ ] Verify access tokens expire correctly
- [ ] Test article access page rendering
- [ ] Confirm database migrations work on PostgreSQL
- [ ] Load test API server under traffic
- [ ] Verify CORS settings for production domain
- [ ] Test error handling (payment failed, invalid token, etc.)
- [ ] Check mobile responsiveness of access page
- [ ] Verify analytics tracking works
- [ ] Test with different Ghost themes (if applicable)

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
**Next Steps**: Implement server-side rendering endpoint  
**Timeline**: 1-2 days development + 1 day testing
