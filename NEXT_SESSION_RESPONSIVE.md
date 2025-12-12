# Next Session: Responsive Design Fixes

## Objective

Fix the chat widget responsive behavior so it works well on:

1. **Desktop** (>1024px) - Current design, floating bottom-right
2. **Tablet/Mid-size** (768px-1024px) - Widget is cutting off
3. **Mobile** (<768px) - Unknown state, needs testing

## Current Problem

The chat widget cuts off when the browser is mid-sized. 

### Screenshot Evidence (Mid-size browser)

![Widget cutoff issue](./docs/responsive-issue-midsize.png)

**Visible issues:**
- Header is cut off at top - only "Researcher" visible, title truncated
- "on sale a..." text is clipped on the left side
- The widget extends beyond the viewport top edge
- Close button (X) may be inaccessible

The widget window has fixed height that doesn't adapt when viewport is shorter than the widget.

## Key Files

- `Headline/assets/css/quality-coach.css` - All widget styling
- `Headline/partials/quality-coach.hbs` - Widget HTML structure

## Investigation Steps

### 1. Test Current Breakpoints

Open the site and use browser DevTools responsive mode to check:

- 1440px (large desktop)
- 1024px (small desktop)
- 768px (tablet)
- 414px (mobile - iPhone)
- 375px (mobile - small)

Screenshot or document what breaks at each size.

### 2. Find Fixed Dimensions

Search quality-coach.css for:

```css
/* Look for fixed widths/heights that might cause cutoff */
width: 400px;
height: 600px;
max-width: ...
max-height: ...
right: ...
bottom: ...
```

### 3. Common Fixes Needed

**Widget Window Size:**

```css
/* Mobile-first responsive sizing */
.qc-chat-window {
    width: 100%;
    max-width: 400px;
    height: 100%;
    max-height: 600px;
}

@media (max-width: 768px) {
    .qc-chat-window {
        /* Full screen on mobile */
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        width: 100%;
        max-width: 100%;
        height: 100%;
        max-height: 100%;
        border-radius: 0;
    }
}
```

**Button Position:**

```css
@media (max-width: 768px) {
    .qc-chat-button {
        /* Ensure button stays visible on mobile */
        bottom: 16px;
        right: 16px;
        width: 56px;
        height: 56px;
    }
}
```

**Input Area:**

```css
@media (max-width: 768px) {
    .qc-input-area {
        /* Account for mobile keyboard */
        padding-bottom: env(safe-area-inset-bottom);
    }
}
```

### 4. Test Interaction on Touch

- Does the keyboard push the input up correctly?
- Can users scroll through chat history?
- Does the close button work?
- Is text readable without zooming?

## Expected Behavior

| Breakpoint | Widget Behavior |
|------------|-----------------|
| >1024px | Floating window, bottom-right, 400x600px |
| 768-1024px | Floating window, slightly smaller, stays on screen |
| <768px | Full-screen overlay when open, button stays visible |

## Notes

- The button emoji (📚) was just changed to transparent background
- Button is positioned at `right: 16px` to align with profile circle
- Widget uses CSS custom properties (check `:root` in quality-coach.css)
- Test on actual devices if possible, not just browser emulation
