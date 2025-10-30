# Paywall Layout Analysis

## How Ghost's Native Paywall Works

### Structure in Casper (default theme)
```handlebars
<section class="gh-content gh-canvas">
    {{content}}
</section>
```

**Key insight:** The `{{content}}` helper AUTOMATICALLY injects the paywall HTML when:
- Post visibility is "Paid members only" or "Specific tiers"
- User is not logged in OR doesn't have access
- Ghost injects `.gh-post-upgrade-cta` INSIDE the content

### Ghost's Injected Paywall HTML
```html
<div class="gh-post-upgrade-cta">
    <div class="gh-post-upgrade-cta-content" style="background-color: ACCENT_COLOR">
        <h2>Title</h2>
        <p>Message</p>
        <a href="#/portal/signup" class="gh-btn">Subscribe</a>
    </div>
</div>
```

## Our Custom Implementation Problem

### Current Structure (BROKEN)
```handlebars
{{#unless @member.paid}}
    <!-- Preview -->
    <section class="gh-content gh-canvas">
        {{excerpt words="150"}}
        <div class="gh-content-fade"></div>
    </section>

    <!-- Paywall partial (NO canvas wrapper) -->
    {{> "paywall"}}

    <!-- Hidden full content -->
    <section class="gh-content gh-canvas" style="display: none;">
        {{content}}
    </section>
{{else}}
    <section class="gh-content gh-canvas">
        {{content}}
    </section>
{{/unless}}
```

**Problem:** The paywall sits BETWEEN two `.gh-canvas` sections, breaking the layout flow.

## Solution Options

### Option 1: Keep Everything in ONE Canvas Section (RECOMMENDED)
```handlebars
{{#unless @member.paid}}
    <section class="gh-content gh-canvas">
        <!-- Preview -->
        {{excerpt words="150"}}
        <div class="gh-content-fade"></div>
        
        <!-- Paywall (no wrapper needed) -->
        {{> "paywall"}}
        
        <!-- Hidden full content -->
        <div class="gh-hidden-content" style="display: none;">
            {{content}}
        </div>
    </section>
{{else}}
    <section class="gh-content gh-canvas">
        {{content}}
    </section>
{{/unless}}
```

**Advantages:**
- Single canvas container maintains proper width
- Paywall flows naturally with content
- Matches Ghost's native pattern

**Paywall partial structure:**
```handlebars
<div class="gh-paywall-card">
    <!-- All paywall content, NO canvas wrapper -->
</div>
```

### Option 2: Wrap Paywall in Its Own Canvas (ALTERNATIVE)
```handlebars
{{#unless @member.paid}}
    <section class="gh-content gh-canvas">
        {{excerpt words="150"}}
        <div class="gh-content-fade"></div>
    </section>

    <section class="gh-content gh-canvas">
        {{> "paywall"}}
    </section>

    <section class="gh-content gh-canvas" style="display: none;">
        {{content}}
    </section>
{{else}}
    <section class="gh-content gh-canvas">
        {{content}}
    </section>
{{/unless}}
```

**Advantages:**
- Each section has proper canvas wrapper
- More flexible for styling

**Disadvantages:**
- Multiple sections may have spacing issues
- Less consistent with Ghost patterns

## CSS Considerations

### Ghost's `.gh-canvas` class
- Provides max-width constraint (typically 740-920px)
- Centers content
- Adds left/right padding
- Used for all text content in Ghost themes

### Our `.gh-paywall-card` class
- Should be a CHILD of `.gh-canvas`, not a sibling
- Inherits width constraints from parent
- Can add own styling (background, padding, border)

## Recommended Final Structure

### custom-paid-article.hbs
```handlebars
{{#unless @member.paid}}
    <section class="gh-content gh-canvas">
        {{excerpt words="150"}}
        <div class="gh-content-fade"></div>
        {{> "paywall"}}
        <div style="display: none;">{{content}}</div>
    </section>
{{else}}
    <section class="gh-content gh-canvas">
        <div class="gh-member-badge">✓ Included with your subscription</div>
        {{content}}
    </section>
{{/unless}}
```

### partials/paywall.hbs
```handlebars
{{#unless @member.paid}}
  <div class="gh-paywall-card">
    <!-- Success banner -->
    <div id="purchase-success-banner" style="display: none;">...</div>
    
    <!-- Paywall content -->
    <div class="gh-paywall-content">
      <h3>Continue reading for $5</h3>
      <p>Get lifetime access...</p>
      <button data-portal="signup">Subscribe</button>
      <button class="buy-article-btn">Buy this article for $5</button>
    </div>
  </div>
{{/unless}}
```

## Why This Matters

1. **Width consistency:** Text should never break outside the canvas
2. **Visual hierarchy:** Paywall should feel part of the content flow
3. **Ghost patterns:** Match how Ghost natively handles paywalls
4. **Maintainability:** Simpler structure is easier to style and debug
