# Quick Legal Setup Guide

**Goal:** Get your pay-per-article system legally compliant in minimum time.

---

## 🚦 Priority Levels

### 🔴 CRITICAL (Must have before launch)

1. Privacy Policy
2. Terms of Service
3. Business registration (if required in your area)
4. Tax setup

### 🟡 IMPORTANT (Should have soon after launch)

1. Cookie Policy
2. GDPR compliance procedures
3. Refund process documentation
4. Email compliance

### 🟢 RECOMMENDED (Add when possible)

1. Accessibility improvements
2. Professional liability insurance
3. Regular security audits

---

## ⚡ Fastest Path to Launch

### Step 1: Customize Policy Templates (1-2 hours)

**Edit these files:**

1. `PRIVACY_POLICY.md`
2. `TERMS_OF_SERVICE.md`
3. `COOKIE_POLICY.md`

**Find and replace:**

- `[YOUR-EMAIL@example.com]` → Your actual email
- `[YOUR BUSINESS ADDRESS]` → Your business address
- `[YOUR JURISDICTION]` → Your country/state
- `[YOUR COUNTRY]` → Where you're based

**Customize sections:**

- Review data retention periods (Privacy Policy)
- Set your refund policy (Terms of Service)
- Add any analytics services you use (Cookie Policy)

### Step 2: Get Legal Review (timeline varies)

**Options:**

**Budget Option:**

- Online legal service (LegalZoom, Rocket Lawyer)
- ~$200-500 USD
- Template review and customization
- Better than nothing

**Professional Option (Recommended):**

- Local lawyer licensed in your jurisdiction
- ~$500-2000 USD
- Proper legal review
- Ongoing advice available

**DIY (Not recommended but realistic):**

- Use templates as-is with customizations
- Better than no policies
- Plan to get proper review when revenue allows

### Step 3: Publish Policies (30 minutes)

**In Ghost Admin:**

1. Go to Pages → New Page
2. Create three pages:
   - **Privacy Policy** (slug: `/privacy`)
   - **Terms of Service** (slug: `/terms`)
   - **Cookie Policy** (slug: `/cookies`)

3. Copy content from .md files
4. Convert markdown to Ghost's format (or paste as HTML)
5. Publish all three pages

**Add footer links:**

Edit your theme's footer (usually `partials/footer.hbs` or `default.hbs`):

```handlebars
<footer class="site-footer">
    <nav class="legal-links">
        <a href="{{@site.url}}/privacy">Privacy Policy</a>
        <a href="{{@site.url}}/terms">Terms of Service</a>
        <a href="{{@site.url}}/cookies">Cookie Policy</a>
    </nav>
    <p>&copy; {{date format="YYYY"}} {{@site.title}}. All rights reserved.</p>
</footer>
```

### Step 4: Link in Checkout Flow (15 minutes)

**Edit paywall in `assets/js/lib/ppa.js`:**

Update the button/text to reference policies:

```javascript
// In showPaywall() or similar function
const disclaimer = document.createElement('p');
disclaimer.className = 'ppa-disclaimer';
disclaimer.innerHTML = 'By purchasing, you agree to our <a href="/terms">Terms of Service</a> and <a href="/privacy">Privacy Policy</a>.';
paywall.appendChild(disclaimer);
```

**Or update post.hbs if paywall is template-based.**

### Step 5: Business Setup (timeline varies)

**Minimum requirements:**

- [ ] Register business name (if required)
- [ ] Get tax ID / ABN / EIN (depending on country)
- [ ] Register for sales tax collection (if required)
- [ ] Set up business bank account
- [ ] Connect to Stripe

**Country-specific:**

**Australia:**

- Register for ABN (free, instant online)
- GST registration if expect >$75k AUD/year
- <https://www.abr.gov.au/>

**United States:**

- Register business with state
- Get EIN from IRS (free)
- Sales tax varies by state
- <https://www.irs.gov/businesses/small-businesses-self-employed>

**United Kingdom:**

- Register as self-employed or limited company
- Get UTR (Unique Taxpayer Reference)
- VAT registration if over threshold
- <https://www.gov.uk/set-up-business>

**Consult local accountant for specifics**

### Step 6: Configure Stripe Tax (30 minutes)

**In Stripe Dashboard:**

1. Go to Settings → Tax
2. Enable automatic tax calculation (if available)
3. Configure tax collection for your jurisdictions
4. Test with a $0.01 purchase

**Alternative:**

- Manually calculate and add to product price
- Clearly state "price includes tax" in checkout

---

## 📧 Email Templates

### Purchase Receipt (Stripe handles, but verify)

**Check your Stripe email settings include:**

- Business name
- Business address
- Link to Terms of Service
- Link to Privacy Policy
- Refund policy reference

### Support Email Template

Create a template for handling requests:

**Subject: Re: [Customer Request]**

```
Hi [Name],

Thank you for contacting us about [issue].

[Response to their specific question]

If you have any other questions, please don't hesitate to reach out.

Best regards,
[Your Name]
[Your Business Name]
[Your Email]
[Your Website]
```

---

## 🎯 Launch Day Checklist

**Before accepting real payments:**

- [ ] All policies published and linked
- [ ] Footer links working on all pages
- [ ] Privacy Policy linked in checkout
- [ ] Business properly registered (or in progress)
- [ ] Tax obligations understood
- [ ] Stripe connected to business bank account
- [ ] Test purchase completed successfully
- [ ] Receipt email received and reviewed
- [ ] Refund process tested
- [ ] Support email monitoring set up

---

## 📊 Post-Launch Monitoring

### Daily (first week)

- [ ] Check Stripe dashboard for transactions
- [ ] Monitor support email
- [ ] Review error logs

### Weekly

- [ ] Review purchase analytics
- [ ] Check for support requests
- [ ] Test purchase flow still working

### Monthly

- [ ] Financial reconciliation
- [ ] Security updates
- [ ] Policy review (any needed updates?)

### Quarterly

- [ ] Tax obligations
- [ ] Legal compliance review
- [ ] Insurance renewal (if applicable)

---

## 🆘 Common Questions

### "Do I really need a lawyer?"

**Legally:** No, you can publish policies without one.  
**Practically:** Highly recommended to reduce risk.  
**Compromise:** Use templates now, get review when revenue justifies cost.

### "What if I can't afford legal review?"

**Options:**

1. Use templates and clearly state they're general templates
2. Start with minimal service (friends/family) before public launch
3. Budget 10% of first revenue for legal review
4. Use online legal services as middle ground

### "Which jurisdiction's laws apply?"

**Generally:** Where your business is located + where your customers are.

- If you're in Australia serving Australian customers: Australian law
- If you're in Australia serving EU customers: Australian law + GDPR
- Specify governing law in Terms of Service
- Consult lawyer for multi-jurisdiction sales

### "Do I need GDPR compliance if I'm not in EU?"

**Yes, if:**

- You offer goods/services to EU residents
- You monitor behavior of EU residents

**No, if:**

- You only serve customers in your own country
- You explicitly exclude EU customers (rarely practical)

### "What about refunds?"

**Recommended policy:**

- "All sales final" by default (digital goods exception)
- Refund if technical error prevents access
- Refund if content misrepresented
- Process within 7-14 days
- Document all refund requests

### "How do I handle GDPR data requests?"

**Set up a process:**

1. Email dedicated to requests: privacy@yourdomain.com
2. Verify identity of requester
3. Respond within 30 days (GDPR requirement)
4. Provide data export or confirm deletion
5. Document all requests and responses

---

## 💡 Smart Shortcuts (Pragmatic approach)

### "Good Enough" for Soft Launch

If you want to test with limited audience before full public launch:

1. ✅ Privacy Policy (use template, customize basics)
2. ✅ Terms of Service (use template, customize basics)
3. ✅ Business registration started (can be in progress)
4. ⚠️ Cookie Policy (can wait if only using essential cookies)
5. ⚠️ Full GDPR procedures (implement as needed)

**Timeline:** Can be done in 1-2 days

### "Production Ready" for Public Launch

Full compliance for peace of mind:

1. ✅ All policies reviewed by lawyer
2. ✅ Business fully registered
3. ✅ Tax obligations sorted
4. ✅ GDPR procedures documented
5. ✅ Insurance in place

**Timeline:** 2-4 weeks depending on jurisdiction

---

## 📞 When to Get Professional Help

**Talk to a lawyer if:**

- Selling to multiple countries
- Handling sensitive data
- Expecting significant revenue (>$50k/year)
- You receive a legal complaint
- Unsure about any requirements

**Talk to an accountant if:**

- Unsure about tax obligations
- Revenue over tax-free threshold
- Operating across jurisdictions
- Setting up business structure

**Talk to insurance broker if:**

- Handling customer data
- Revenue >$20k/year
- Want to minimize risk

---

## ✅ Your Action Plan

**This week:**

1. [ ] Customize the three policy templates (2 hours)
2. [ ] Publish policies as Ghost pages (30 min)
3. [ ] Add footer links (30 min)
4. [ ] Link in checkout flow (15 min)
5. [ ] Get email quotes from 2-3 lawyers for policy review

**Next week:**

1. [ ] Complete business registration
2. [ ] Set up tax collection
3. [ ] Get legal review (if budget allows)
4. [ ] Test full purchase flow with policies linked

**Before public launch:**

1. [ ] All policies live and linked
2. [ ] Business legally registered
3. [ ] Tax obligations met
4. [ ] Legal review complete (or scheduled)

---

**You can be "good enough" compliant in a few days. Perfect compliance takes weeks but is worth it for peace of mind.**

**Start with templates → Launch carefully → Improve as revenue grows → Get professional review when justified.**

