# Legal Setup - Final Checklist

**Status:** Policies created, ready to publish

## What's Done

✅ Privacy Policy - Simple, conversational, includes Google Analytics  
✅ Terms of Service - Covers subscriptions + PPA  
✅ Cookie Policy - Lists essential + analytics cookies  
✅ All customized for AMH Solutions Pty Ltd, Sydney, Australia

## What You Need To Do

### 1. Publish Policies in Ghost (30 minutes)

**Create three pages:**

1. Go to Ghost Admin → Pages → New Page
2. Create:
   - **Privacy Policy** (slug: `/privacy`)
   - **Terms of Service** (slug: `/terms`)  
   - **Cookie Policy** (slug: `/cookies`)
3. Copy content from the .md files
4. Publish all three

### 2. Add Footer Links (15 minutes)

Edit your theme footer to link the policies.

**Option A: Via Ghost Admin** (if you have navigation settings)
- Go to Settings → Navigation → Secondary navigation
- Add links to `/privacy`, `/terms`, `/cookies`

**Option B: Edit theme** (in `default.hbs` or footer partial)

Find the footer section and add:

```handlebars
<nav class="gh-foot-menu">
    {{navigation type="secondary"}}
    <a href="{{@site.url}}/privacy">Privacy</a>
    <a href="{{@site.url}}/terms">Terms</a>
    <a href="{{@site.url}}/cookies">Cookies</a>
</nav>
```

### 3. Optional: Add Policy Link Near Checkout

In `assets/js/lib/ppa.js`, you could add a small disclaimer near the purchase button:

```javascript
// Add this when showing the paywall
const disclaimer = document.createElement('p');
disclaimer.style.fontSize = '12px';
disclaimer.style.color = '#666';
disclaimer.innerHTML = 'By purchasing, you agree to our <a href="/terms">Terms</a> and <a href="/privacy">Privacy Policy</a>.';
```

But honestly, having them in the footer is enough.

## That's It

You're good to go. The policies are:
- Simple and readable
- Cover all your current services (subscriptions + PPA)
- List all third-party services (Google Analytics, Stripe, Senja)
- Specific to your company (AMH Solutions Pty Ltd)

## Future Updates Needed If...

**You add new analytics:** Update Privacy Policy + Cookie Policy  
**You start email marketing:** Add email compliance section  
**You add new payment methods:** Update Terms + Privacy  
**Laws change:** Review annually or when notified

---

**Not included (because you're a one-person company):**
- Cookie consent banners (not legally required for essential + analytics cookies in Australia)
- Complex GDPR procedures (nice to have, but you can handle requests manually via email)
- Legal jargon (kept it simple on purpose)

---

**Questions?** Just publish them. You can always update later if needed.
