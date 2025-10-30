# Pay-Per-Article Theme Installation Guide

## Files Created

### 1. `partials/paywall.hbs`
The main paywall component with Ghost-native styling.

**Features:**
- ✅ Uses Ghost's CSS variables and classes
- ✅ Responsive design
- ✅ Two CTAs: Subscribe ($20/year) and Buy Article ($5)
- ✅ Success banner after purchase
- ✅ "Already purchased? Sign in" link
- ✅ Loading states
- ✅ Inline JavaScript for payment flow

### 2. `custom-paid-article.hbs`
Custom post template for paid articles.

**Features:**
- ✅ Shows preview (first 150 words) for non-paying visitors
- ✅ Fade effect on preview content
- ✅ Includes paywall partial
- ✅ Full content hidden until access verified
- ✅ Badge for paid subscribers
- ✅ Supports Ghost's native `visibility="paid"` setting

---

## Installation Steps

### Step 1: Build and Upload Theme

```bash
cd /Users/annemarie/Documents/temp/GitHub/Headline
yarn zip
```

Upload the generated `dist/headline.zip` to:
**Ghost Admin → Settings → Design → Upload theme**

---

### Step 2: Configure API URL

Add this to **Ghost Admin → Settings → Code Injection → Site Header**:

```html
<script>
  // Pay-per-article API configuration
  window.PAYWALL_API_URL = 'https://your-api-domain.com/api';
  
  // For local development:
  // window.PAYWALL_API_URL = 'http://localhost:4000/api';
</script>
```

Replace `https://your-api-domain.com/api` with your actual API URL.

---

### Step 3: Apply Template to Articles

For each article you want to paywall:

1. Edit the post in Ghost Admin
2. Click **Settings** (gear icon)
3. Under **Template**, select **"Paid Article"**
4. Set **Visibility** to **"Paid members only"**
5. **Update** the post

---

### Step 4: Test the Flow

#### Test Purchase:
1. Visit a paywalled article (not logged in)
2. Click **"Buy This Article — $5"**
3. Complete payment in Stripe (use test card: `4242 4242 4242 4242`)
4. Verify you're redirected back with full content

#### Test Success Banner:
- Should show: "✓ Purchase complete! You now have lifetime access..."
- Should have "Sign in" link

#### Test Return Visit:
1. Clear cookies/open incognito
2. Visit same article
3. Click **"Already purchased? Sign in"**
4. Enter email → receive magic link
5. Click magic link → see full content

---

## Customization

### Change Colors

The paywall uses Ghost's accent color. To customize:

**Ghost Admin → Settings → Design → Brand → Accent color**

### Change Pricing

Edit `partials/paywall.hbs`:

```html
<!-- Line ~45 -->
Subscribe for $20/year — Unlimited Access

<!-- Line ~62 -->
Buy This Article — $5
```

**Important:** Also update backend API pricing in:
`article-tips-api/src/routes/checkout.js`

```javascript
const ARTICLE_PRICE = 500; // $5.00 in cents
```

### Change Preview Length

Edit `custom-paid-article.hbs`:

```handlebars
<!-- Line ~23 -->
{{content words="150"}}
```

Change `150` to desired word count.

### Disable Fade Effect

Edit `custom-paid-article.hbs`, remove:

```html
<div class="gh-content-fade"></div>
```

---

## Styling Options

### Use Different Accent Color for Paywall

Add custom CSS to **Settings → Code Injection → Site Header**:

```html
<style>
.gh-paywall-card {
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%) !important;
}
</style>
```

### Change Button Styles

```html
<style>
.gh-btn-primary {
  background: #10b981 !important;
  color: #fff !important;
}

.gh-btn-outline {
  border-color: #10b981 !important;
  color: #10b981 !important;
}
</style>
```

---

## Troubleshooting

### Paywall not showing:
- ✓ Check article has **visibility="paid"**
- ✓ Check template is set to **"Paid Article"**
- ✓ Verify you're not logged in as paid member

### "Buy Article" button doesn't work:
- ✓ Check `window.PAYWALL_API_URL` is set correctly
- ✓ Check browser console for errors
- ✓ Verify API is running and accessible
- ✓ Check CORS settings in API allow your Ghost domain

### After payment, content doesn't show:
- ✓ Check URL has `?purchase=success&session_id=...`
- ✓ Check browser console for API errors
- ✓ Verify webhook processed payment (check API logs)
- ✓ Confirm session_id is valid in Stripe dashboard

### API CORS Error:
Update `.env` in article-tips-api:

```bash
ALLOWED_ORIGINS=https://your-ghost-site.com
```

---

## Template Hierarchy

Ghost will use templates in this order:

1. `custom-paid-article.hbs` (if set in post settings)
2. `post.hbs` (default for all posts)
3. `page.hbs` (for pages)
4. `index.hbs` (fallback)

---

## Development Tips

### Local Testing:

```bash
# Terminal 1: Start API
cd article-tips-api
npm run dev

# Terminal 2: Start Ghost
cd ghost/lghost
ghost start

# Terminal 3: Watch theme changes
cd Headline
yarn dev
```

### Live Reload:

The theme includes gulp livereload. Keep `yarn dev` running and your browser will auto-refresh on changes.

---

## Production Checklist

- [ ] Build theme: `yarn zip`
- [ ] Upload to Ghost
- [ ] Set `PAYWALL_API_URL` in code injection
- [ ] Apply "Paid Article" template to posts
- [ ] Set articles to `visibility="paid"`
- [ ] Test purchase flow with real Stripe account
- [ ] Verify webhook is receiving events
- [ ] Test on mobile devices
- [ ] Check accessibility (keyboard navigation)
- [ ] Test with screen reader

---

## Browser Support

- ✅ Chrome/Edge 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Mobile Safari/Chrome

Requires JavaScript enabled.

---

## Support

For issues with:
- **Theme/Frontend:** Check browser console, verify template applied
- **API/Backend:** Check API logs, verify environment variables
- **Payments:** Check Stripe dashboard, verify webhook endpoint
- **Ghost:** Check Ghost admin logs

---

**Version:** 1.0.0  
**Last Updated:** October 30, 2025
