# Progressive Disclosure UX Pattern for Persona Selection

## Overview
Implemented a user-friendly progressive disclosure pattern for persona selection that:
1. **Never blocks the user** - no upfront modal or forced selection
2. **Shows confirmation after first AI response** - inline, non-intrusive
3. **Maintains persistent footer badge** - always visible for changing persona
4. **Remembers user preference** - uses localStorage to avoid showing confirmation again

## User Flow

### First-Time User
1. User opens chat widget
2. User asks a question
3. AI responds with detected persona (e.g., "Quality Coach")
4. **Inline confirmation appears** below the response:
   ```
   I'm responding as if you're a Quality Coach. Is that right?
   [Yes, that's right] [Actually, I'm a...]
   ```
5. If user clicks "Yes":
   - Confirmation disappears
   - Footer badge remains visible
   - Preference saved to localStorage (never show again)
6. If user clicks "Actually, I'm a...":
   - Shows inline persona selector with 5 options
   - User selects correct persona
   - Sends correction to backend API
   - Updates display and footer badge
   - Saves preference to localStorage

### Returning User
1. User opens chat widget
2. User asks a question
3. AI responds with persona
4. **No confirmation shown** (already confirmed in localStorage)
5. Footer badge visible if user wants to change

### Changing Persona
- User clicks footer persona badge (e.g., "Quality Coach")
- Dropdown appears with 5 persona options
- User selects different persona
- Sends correction to backend API
- Updates display immediately

## Technical Implementation

### JavaScript Functions

#### `showPersonaConfirmation(persona, confidence)`
- Checks if already shown this session or confirmed in localStorage
- Creates inline confirmation card with:
  - Persona icon
  - Message: "I'm responding as if you're a [Persona]"
  - Two action buttons: "Yes, that's right" / "Actually, I'm a..."
- Appends to messages container
- Handles button clicks:
  - "Yes" → calls `confirmPersona()` and fades out
  - "Actually" → calls `showPersonaSelector()`

#### `showPersonaSelector(confirmDiv, originalPersona)`
- Replaces confirmation content with persona selector grid
- Shows 5 persona options with icons and labels
- On selection:
  - Calls `correctPersona(originalPersona, newPersona, 'user_selected')`
  - Fades out and removes confirmation

#### `confirmPersona(persona)`
- Saves to localStorage: `qc_persona_confirmed = 'true'`
- Saves persona choice: `qc_persona_choice = persona`
- Prevents future confirmations from appearing

#### `correctPersona(originalPersona, newPersona, reason)`
- Updates `currentPersona` global variable
- Updates footer badge via `updateFooterPersonaBadge()`
- Calls `confirmPersona()` to save preference
- Sends correction to backend API: `POST /api/v1/persona/correct`
- Shows success message to user

#### `updateFooterPersonaBadge(persona)`
- Sets footer badge label text
- Makes footer badge visible (`display: flex`)
- Marks active option in dropdown

### CSS Styling

#### `.qc-footer-persona`
- Subtle button in footer with persona icon + text
- Hidden by default, shown after first response
- Border on hover with accent color
- Positioned alongside "Powered by" text

#### `.qc-persona-confirmation`
- Inline card with gradient background (blue tones)
- Left border in accent color
- Slide-down animation
- Contains icon, text, and action buttons

#### `.qc-persona-selector`
- CSS Grid layout (auto-fit, min 140px columns)
- 5 buttons with emoji icons and labels
- Hover effects with accent color

#### `.qc-fade-out`
- Scale and opacity animation for dismissing confirmation

### Backend API Integration

#### Endpoint: `POST /api/v1/persona/correct`
Payload:
```json
{
  "thread_id": "uuid",
  "corrected_persona": "SOFTWARE_ENGINEER",
  "original_persona": "QUALITY_COACH",
  "original_confidence": 0.85,
  "message_context": "How do I set up CI/CD?",
  "correction_reason": "user_selected"
}
```

Response:
```json
{
  "status": "success",
  "message": "Persona updated to Software Engineer"
}
```

### localStorage Keys
- `qc_persona_confirmed` - Set to 'true' when user confirms or changes persona
- `qc_persona_choice` - Stores the confirmed persona code (e.g., 'QUALITY_COACH')
- `qc_current_persona` - Stores current session persona

## Benefits

### User Experience
- **Zero friction** - No forced decisions before first interaction
- **Contextual** - Confirmation appears at the right moment (after first response)
- **One-time** - Never bothers user again once confirmed
- **Always accessible** - Footer badge always visible for changes
- **Non-intrusive** - Inline confirmation blends into conversation flow

### Data Collection
- Captures persona corrections for machine learning
- Includes original detection confidence
- Stores message context for training examples
- Tracks correction reason (user_selected vs. other triggers)

### Analytics
- Weekly report shows correction flows (e.g., "EM → Test Lead: 5 times")
- Calculates persona detection accuracy rate
- Identifies most common misclassifications
- Informs prompt engineering improvements

## Testing Checklist

### First-Time User
- [ ] Open widget → ask question → see AI response
- [ ] Inline confirmation appears below response
- [ ] Click "Yes, that's right" → confirmation disappears
- [ ] Footer badge remains visible
- [ ] Refresh page → ask again → no confirmation shown

### Changing Persona
- [ ] Click footer badge → dropdown appears
- [ ] Select different persona → updates immediately
- [ ] Backend receives correction API call
- [ ] Success message appears
- [ ] Dropdown closes

### Edge Cases
- [ ] User clicks "Actually, I'm a..." → selector appears
- [ ] User selects same persona → treated as confirmation
- [ ] User closes widget before confirming → shows again next session
- [ ] User confirms → closes widget → reopens → no confirmation
- [ ] Multiple tabs open → localStorage syncs across tabs

## Deployment

### Files Modified
1. `Headline/partials/quality-coach.hbs` - Added JavaScript functions and footer badge HTML
2. `Headline/assets/css/quality-coach.css` - Added styles for footer badge and confirmation

### Deployment Steps
1. Ensure backend migration is run: `alembic upgrade head`
2. Test locally: `cd Headline && ./deploy-local.sh`
3. Verify in browser:
   - Open Ghost site with chat widget
   - Ask a question as guest
   - Check inline confirmation appears
   - Test footer badge click
4. Deploy to production Ghost theme
5. Monitor `/api/v1/persona/correct` endpoint logs

### Rollback Plan
If issues occur:
1. Remove inline confirmation code (keep footer badge)
2. Revert to header-only persona selector
3. Backend API remains backward compatible

## Future Enhancements
- [ ] Show confidence score in confirmation (if low)
- [ ] A/B test confirmation message variants
- [ ] Add "Not sure" option to let AI keep detecting
- [ ] Cross-device sync via backend instead of localStorage
- [ ] Show persona impact in chat (e.g., "I'll focus on code quality...")
