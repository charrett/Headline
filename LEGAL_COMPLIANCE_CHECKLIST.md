# Legal Compliance Checklist

**Pay-Per-Article Production Launch**  
**Last Updated:** November 2, 2025

---

## 📋 Legal Documents

### Core Policies (Required)

- [ ] **Privacy Policy** - `PRIVACY_POLICY.md`
  - [ ] Customize with your email and address
  - [ ] Review data retention periods
  - [ ] Add GDPR representative if serving EU customers
  - [ ] Have lawyer review for your jurisdiction
  - [ ] Publish on website (e.g., `/privacy` page)
  - [ ] Link in website footer
  - [ ] Link in Stripe checkout flow

- [ ] **Terms of Service** - `TERMS_OF_SERVICE.md`
  - [ ] Customize with your email and address
  - [ ] Specify governing law jurisdiction
  - [ ] Decide on dispute resolution method
  - [ ] Review refund policy
  - [ ] Have lawyer review
  - [ ] Publish on website (e.g., `/terms` page)
  - [ ] Link in website footer
  - [ ] Reference in checkout flow

- [ ] **Cookie Policy** - `COOKIE_POLICY.md`
  - [ ] Verify cookie names in browser dev tools
  - [ ] Customize with your details
  - [ ] Update if adding analytics
  - [ ] Publish on website (e.g., `/cookies` page)
  - [ ] Link in website footer

### Implementation on Website

- [ ] Create Ghost pages for each policy
  - [ ] `/privacy` → Privacy Policy
  - [ ] `/terms` → Terms of Service
  - [ ] `/cookies` → Cookie Policy

- [ ] Add footer links (edit theme `default.hbs` or `partials/footer.hbs`)
  ```html
  <a href="/privacy">Privacy Policy</a>
  <a href="/terms">Terms of Service</a>
  <a href="/cookies">Cookie Policy</a>
  ```

- [ ] Link Privacy Policy in checkout flow
  - [ ] Add to paywall button text or nearby
  - [ ] Example: "By purchasing, you agree to our Terms and Privacy Policy"

---

## 🌍 GDPR Compliance (EU Users)

### Core Requirements

- [ ] **Lawful Basis for Processing**
  - [ ] Contract performance (article access)
  - [ ] Legitimate interest (service improvement)
  - [ ] Documented in Privacy Policy

- [ ] **Data Subject Rights**
  - [ ] Access: Provide user data on request
  - [ ] Rectification: Allow users to update info
  - [ ] Erasure: Delete account and data on request
  - [ ] Portability: Export data in readable format
  - [ ] Objection: Handle objections to processing
  - [ ] Implement email contact for rights requests

- [ ] **Consent (if required)**
  - [ ] Cookie consent banner (if using non-essential cookies)
  - [ ] Marketing emails (if sending newsletters)
  - [ ] Clear opt-in checkboxes (no pre-checked boxes)

- [ ] **Data Protection**
  - [ ] HTTPS encryption (✅ already implemented)
  - [ ] Secure token-based auth (✅ already implemented)
  - [ ] Regular security audits
  - [ ] Data breach notification procedure

- [ ] **Privacy by Design**
  - [ ] Minimal data collection (✅ email only)
  - [ ] 15-minute token expiry (✅ implemented)
  - [ ] Rate limiting (✅ implemented)

### Documentation

- [ ] **Record of Processing Activities (ROPA)**
  - [ ] Document what data you process
  - [ ] Why you process it
  - [ ] How long you retain it
  - [ ] Who you share it with

- [ ] **Data Protection Impact Assessment (DPIA)**
  - [ ] May be required for high-risk processing
  - [ ] Consult with GDPR expert if unsure

### GDPR Representative

- [ ] **Do you need one?**
  - Required if: Based outside EU but offering goods/services to EU users
  - Not required if: Based in EU or minimal EU user presence
  - [ ] Appoint representative if required
  - [ ] Add contact info to Privacy Policy

---

## 💳 Payment & Financial Compliance

### Stripe Compliance

- [ ] **Stripe Terms Accepted**
  - [ ] Reviewed Stripe Terms of Service
  - [ ] Link to Stripe's consumer terms in checkout
  - [ ] Using Stripe correctly (not for prohibited items)

- [ ] **PCI DSS Compliance**
  - ✅ Automatic via Stripe (we don't handle card data)
  - [ ] Verify HTTPS only (no HTTP)
  - [ ] Don't store card numbers

### Tax Obligations

- [ ] **Sales Tax / VAT Collection**
  - [ ] Determine if you must collect tax in your jurisdiction
  - [ ] Configure Stripe Tax if required
  - [ ] Australia: GST registration if over threshold
  - [ ] EU: VAT MOSS registration if serving EU customers
  - [ ] US: Sales tax varies by state

- [ ] **Income Tax**
  - [ ] Business registered with tax authority
  - [ ] Accounting system for tracking revenue
  - [ ] Set aside funds for tax payments

- [ ] **Tax Records**
  - [ ] Retain purchase records (7 years recommended)
  - [ ] Database backups for financial records

### Consumer Protection Laws

- [ ] **Refund Rights**
  - [ ] EU: 14-day cooling-off period may apply (digital content exception)
  - [ ] Australia: Consumer guarantees under ACL
  - [ ] US: State-specific consumer protection laws
  - [ ] Document your refund policy clearly

- [ ] **Pricing Display**
  - [ ] Prices clearly shown before purchase
  - [ ] Currency clearly indicated
  - [ ] Total cost including taxes

- [ ] **Receipts**
  - [ ] Email receipt after purchase (Stripe provides this)
  - [ ] Include business details on receipt

---

## 📧 Email Compliance

### Transactional Emails (Purchase receipts)

- ✅ Allowed without consent (necessary for service)
- [ ] Include unsubscribe link if sending marketing later
- [ ] Include business address in footer

### Marketing Emails (if sending newsletters)

- [ ] **CAN-SPAM (US)**
  - [ ] Clear unsubscribe link
  - [ ] Process opt-outs within 10 days
  - [ ] Include physical address

- [ ] **GDPR (EU)**
  - [ ] Obtain explicit consent (opt-in checkbox)
  - [ ] Keep records of consent
  - [ ] Easy unsubscribe process

- [ ] **CASL (Canada)**
  - [ ] Express consent before sending
  - [ ] Identify sender clearly
  - [ ] Unsubscribe mechanism

---

## 🔒 Security & Data Protection

### Current Implementation

- ✅ HTTPS encryption
- ✅ Token-based authentication
- ✅ Rate limiting (5 requests/15 min)
- ✅ HMAC signature validation
- ✅ No credit card storage (Stripe handles)
- ✅ 15-minute token expiry

### Additional Measures

- [ ] **Security Audits**
  - [ ] Regular code reviews
  - [ ] Dependency updates
  - [ ] Penetration testing (for production)

- [ ] **Incident Response Plan**
  - [ ] Data breach notification procedure
  - [ ] GDPR: Notify within 72 hours
  - [ ] Contact plan for affected users

- [ ] **Backups**
  - [ ] Regular database backups
  - [ ] Secure backup storage
  - [ ] Test restoration process

---

## 📊 Business Registration

### Legal Entity

- [ ] **Business Structure**
  - [ ] Sole proprietor / LLC / Corporation?
  - [ ] Registered with government authorities
  - [ ] Business license (if required locally)

- [ ] **Business Bank Account**
  - [ ] Separate from personal finances
  - [ ] Connect to Stripe payout

- [ ] **Insurance** (recommended)
  - [ ] Professional liability insurance
  - [ ] Cyber liability insurance
  - [ ] Consult insurance broker

---

## 🌐 Domain & Hosting

### Domain Registration

- [ ] Domain registered in business name
- [ ] WHOIS privacy protection (optional)
- [ ] Auto-renewal enabled

### Hosting

- [ ] Terms of Service reviewed
- [ ] GDPR-compliant hosting provider
- [ ] Data center location documented
- [ ] Uptime SLA documented

### SSL/TLS Certificate

- ✅ HTTPS enabled
- [ ] Auto-renewal configured
- [ ] Valid certificate (check expiry)

---

## 📝 Accessibility (Recommended)

### WCAG Compliance

- [ ] **WCAG 2.1 Level AA** (recommended)
  - [ ] Keyboard navigation works
  - [ ] Screen reader compatible
  - [ ] Sufficient color contrast
  - [ ] Alt text for images

### ADA Compliance (US)

- [ ] If commercial website, ADA Title III may apply
- [ ] Accessibility statement published
- [ ] Contact for accessibility issues

---

## 🚀 Pre-Launch Checklist

### Final Review

- [ ] All policies published and linked
- [ ] Lawyer reviewed terms and privacy policy
- [ ] Accountant consulted on tax obligations
- [ ] Business properly registered
- [ ] Payment flow tested with real transactions
- [ ] Refund process tested
- [ ] Email templates reviewed
- [ ] Footer links working on all pages
- [ ] Mobile responsiveness checked

### Monitoring

- [ ] Error logging configured
- [ ] Stripe dashboard monitoring setup
- [ ] Email notifications for failed payments
- [ ] Regular policy review schedule (quarterly)

---

## 📚 Resources

### Legal

- **GDPR Guide:** <https://gdpr.eu/>
- **Stripe Legal:** <https://stripe.com/legal>
- **Privacy Policy Generator:** <https://www.termsfeed.com/> (starting point only)

### Tax

- **Stripe Tax:** <https://stripe.com/tax>
- **AU Taxation Office:** <https://www.ato.gov.au/>
- **US IRS:** <https://www.irs.gov/>

### Professional Help

- [ ] Lawyer (licensed in your jurisdiction)
- [ ] Accountant/Tax advisor
- [ ] GDPR consultant (if serving EU)

---

## ⚠️ Important Disclaimers

**This checklist is for guidance only and does NOT constitute legal advice.**

- Laws vary significantly by jurisdiction
- Requirements change over time
- Your specific circumstances may differ
- **Always consult with qualified professionals** (lawyer, accountant) licensed in your jurisdiction

---

**Status:** Templates created, customization required  
**Next Step:** Review with legal professional before publishing

