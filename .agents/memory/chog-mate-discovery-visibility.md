---
name: CHOG MATE discovery visibility
description: Product rule for how member identity and Chog NFT details appear in discovery.
---

**Rule:** CHOG MATE does not use Blind Chog or Blind Date. Show a member's real profile photo and Chog NFT image/token details in the initial discovery card; do not hide them or add a reveal step.

**Why:** The user explicitly set this as a product requirement.

**How to apply:** Keep photo and Chog artwork visible together from the first discovery card. Do not add reveal flows or blur identity details.

**Explore listing rule:** Show eligible, complete Chog-holder profiles regardless of `profile_visible` or prior interaction state (likes, passes, active matches, and ex-matches). Exclude the current account and users blocked in either direction. Profile detail and interaction endpoints must follow the same rule while preserving block and current-ownership checks.

**Why:** On 2026-10-24, the user explicitly changed the product rule: every eligible profile should appear in Explore regardless of visibility preference or relationship history, with blocking as the only exclusion.

**How to apply:** Do not filter by `profile_visible`, likes, passes, or match status in Explore/search. Do not let profile detail or Like Back reject an otherwise eligible hidden profile. Continue excluding self and both directions of blocks, and verify current Chog ownership.

**Preview safety rule:** Do not insert synthetic users or change a real profile's `profile_visible` value just to make an Explore preview non-empty. Keep real profile and on-chain ownership checks intact.

**Why:** The user explicitly prohibited fake users, manual visibility changes for preview, and bypassing ownership verification during Discover diagnosis.

**How to apply:** When Discover is empty, report the real row counts and the exact failing gates. Do not write visibility or seed account data as a debugging workaround.

## Swipe deck exhaustion

**Rule:** Discover must advance past a profile when a left/right swipe is already recorded, instead of leaving the same card stuck in the deck. When no profiles and no next page remain, show a clear end-of-list message.

**Why:** The user explicitly asked that swiping the last available profile show that no more profiles are available instead of repeating the card.

**How to apply:** Keep this local to Discover; preserve Explore's visibility and prior-interaction rules. Continue pagination when `nextCursor` exists, show the terminal empty state when it does not, and do not weaken Super Like transaction safeguards.

## Previously liked profiles

**Rule:** Do not show a profile again in Discover after the signed-in member has liked or Super Liked it. This must remain true after navigating away or reloading; Explore modes keep their existing prior-interaction behavior.

**Why:** The user explicitly said previously liked users must not return in Discover and repeated this requirement when reporting duplicate profiles.

**How to apply:** Filter persisted outgoing Likes and Super Likes in the authenticated Discover results. Refresh “Liked By Me” after a Like is recorded, and avoid refetching the active deck in a way that skips its next card.
