# How to Create the FAQ Page in Ghost

## Steps to Add the FAQ Page

1. **Login to Ghost Admin**
   - Go to your Ghost admin panel (typically `yourdomain.com/ghost`)

2. **Create a New Page**
   - Click **Pages** in the left sidebar
   - Click **New Page** button

3. **Add the Content**
   - Copy the content from `FAQ_PAGE_CONTENT.md`
   - Paste it into the Ghost editor
   - The Markdown will automatically format correctly

4. **Configure Page Settings**
   - Click the **Settings** gear icon (top right)
   - Set the **Page URL** to: `faq`
   - Set **Page Title** to: `Quality Coach FAQ`
   - Add **Meta Description**: "Frequently asked questions about Quality Coach Book subscriptions, billing, newsletters, and content access."
   - **Feature this page**: No (unless you want it in navigation)

5. **Publish**
   - Click **Publish** → **Publish now**

## Important Notes

### Update Email Frequency
Before publishing, you may want to customize the email frequency section based on your actual sending pattern. I've set it to:
- Free subscribers: 1 email/month (newsletter)
- Paid subscribers: 2 emails/month (newsletter + book chapter)

### Add Your Contact Email
In the "Still Have Questions?" section, add your actual support email address.

### Link is Already Set Up
The home page (`home.hbs`) already has a link to `/faq/` so once you publish the page, the link will work automatically!

## Testing

After publishing:
1. Visit your homepage
2. Click "Quality Coach FAQ →" button
3. Verify all links work (especially the Stripe billing portal link)
4. Test on mobile to ensure readability

## Future Updates

Consider adding to the FAQ as questions come in:
- Group subscriptions (if you offer them)
- Gift subscriptions (if you offer them)
- Refund policy
- Privacy/data questions
- Mobile app questions (if applicable)
