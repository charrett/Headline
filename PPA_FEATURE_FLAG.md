# PPA Feature Flag - Toggle Without Redeployment

## How to Enable/Disable PPA in Production

You can turn the PPA feature on/off **instantly** without redeploying the theme by using Ghost's Code Injection feature.

### ✅ To ENABLE PPA (Turn it ON)

1. Go to **Ghost Admin** → **Settings** → **Code Injection**
2. In the **Site Header** section, add this code:

```html
<script>
  window.PPA_ENABLED = true;
</script>
```

3. Click **Save**
4. Refresh your site - PPA is now active on ALL paid posts!

---

### ❌ To DISABLE PPA (Turn it OFF)

1. Go to **Ghost Admin** → **Settings** → **Code Injection**
2. In the **Site Header** section, either:
   - **Option A**: Remove the script entirely
   - **Option B**: Change `true` to `false`:

```html
<script>
  window.PPA_ENABLED = false;
</script>
```

3. Click **Save**
4. Refresh your site - PPA is now disabled on all posts!

---

## 🧪 Testing on ONE Article Only

If you want to test PPA on just one article before enabling it globally:

1. Go to **Ghost Admin** → **Settings** → **Code Injection**
2. In the **Site Header** section, add this code:

```html
<script>
  // Only enable PPA for this specific post ID
  const TEST_POST_ID = '673620f2e1c89a0001703dc0'; // Replace with your test article's ID
  
  // Set flag immediately (will be checked later when article loads)
  window.PPA_TEST_POST_ID = TEST_POST_ID;
  window.PPA_ENABLED = 'check-post-id'; // Special value to check post ID
</script>
```

3. Replace `'673620f2e1c89a0001703dc0'` with your actual test article's Post ID
4. Click **Save**
5. Only that specific article will have PPA enabled!

---

## 📍 How to Find a Post's ID

**Method 1: From the Editor URL**
When editing a post, look at the URL:
```
https://annemariecharrett.com/ghost/#/editor/post/673620f2e1c89a0001703dc0
                                                    ^^^^^^^^^^^^^^^^^^^^^^^^
                                                    This is the Post ID
```

**Method 2: From the Browser Console**
1. Visit the published article
2. Open browser console (F12)
3. Type: `document.querySelector('article[data-post-id]').dataset.postId`
4. Press Enter - it will show the Post ID

---

## 🎯 Debugging

Add `?ppa_debug=true` to any URL to see PPA logs in console:
```
https://annemariecharrett.com/your-article?ppa_debug=true
```

This works whether PPA is enabled or disabled (you'll see why it's not activating).

---

## Summary of Approaches

| Approach | Use Case | Change Required |
|----------|----------|----------------|
| **Global ON** | Enable PPA for all paid posts | Set `window.PPA_ENABLED = true` |
| **Global OFF** | Disable PPA everywhere | Set `window.PPA_ENABLED = false` or remove script |
| **Single Post Test** | Test on one article only | Check post ID and enable conditionally |

**No theme redeployment needed for any of these!** ✅
