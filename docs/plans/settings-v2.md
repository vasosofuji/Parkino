# Compact settings

## Plan

1. Replace the all-at-once settings content with category rows and one detail view at a time.
2. Keep appearance modes, language, location/reminders, account, and app information separate.
3. Remove the “Help nearby drivers” heading and move reminder explanation to its own information view. Keep the explicit opt-in under Location.
4. Show guest identity correctly and remove repeated account advice from settings.
5. Run lint and typecheck, then inspect back/close behavior and the reminder states.

## Implementation

- The settings root now contains five compact rows: Appearance, Language, Location & reminders, Account, and About.
- Each category opens its own content inside the existing sheet. A back action returns to the category list; close resets the list for the next opening.
- Appearance only reveals theme modes when opened; Language only reveals the language chooser when opened.
- Location keeps GPS refresh, permissions, and a compact reminder opt-in. A separate About reminders view holds explanation and operating-system limits.
- Account correctly labels guests and links to the account and data pages. Repeated account advice was removed.
- Reminder controls show a checking state while loading status, avoiding a false “install updated build” message.

## Review

- Full Expo lint passes. A later full TypeScript check also passes after the backend author resolved in-progress test types.
- Source inspection confirms the removed “Help nearby drivers” heading no longer appears and all reminder component call sites provide the information link.
- No new tests for this reversible presentation-only refactor. Parent device walkthrough remains to check touch targets and sheet layout.
- Expo 57 docs/index were consulted earlier in this session; RN Pressable/AppState and Expo Router navigation docs were checked for these controls.
- Parent review found native system appearance was fixed to light in app config. The parent changed it to automatic and installed/configured Expo SystemUI so the System choice can follow the phone after rebuilding.
