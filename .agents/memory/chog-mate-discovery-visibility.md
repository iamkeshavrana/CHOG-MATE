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

## Previously handled profiles and Unlike

**Rule:** Keep outgoing Likes and Super Likes out of Discover until the signed-in member withdraws them. An explicit Like replaces that member's earlier Pass for the same profile. Keep active matches out of Discover and do not allow Unlike while a match is active. An ended match stays out of Discover while the member's outgoing Like or Super Like remains; withdrawing it makes that profile eligible for Discover again without deleting Ex Match history.

**Why:** The user requested an Unlike option on “Liked By Me” and that withdrawn profiles return to Discover, while active matches and match history remain intact. A saved Pass also caused a later explicit Like to be silently rejected, making the card return without appearing in “Liked By Me.”

**How to apply:** Filter persisted outgoing Likes, Super Likes, and active matches from authenticated Discover results. Replace a prior Pass when the member explicitly Likes that profile. When an unmatched profile's outgoing interaction is withdrawn, refresh the sent-like list and Discover queries; retain the unmatched row for Ex Matches history.
