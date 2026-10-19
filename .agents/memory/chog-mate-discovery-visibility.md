---
name: CHOG MATE discovery visibility
description: Product rule for how member identity and Chog NFT details appear in discovery.
---

**Rule:** CHOG MATE does not use Blind Chog or Blind Date. Show a member's real profile photo and Chog NFT image/token details in the initial discovery card; do not hide them or add a reveal step.

**Why:** The user explicitly set this as a product requirement.

**How to apply:** Keep photo and Chog artwork visible together from the first discovery card. Do not add reveal flows or blur identity details.

**Discover visibility gate:** The owner-controlled `profile_visible` setting is the privacy gate. Missing age or profile-photo values must not independently hide an opted-in profile; keep verified, currently owned Chog checks.

**Why:** The user specified that the Settings toggle controls whether a profile appears. Production had opted-in holders excluded only because age and photo fields were empty.

**How to apply:** Filter `profile_visible = true` in both Discover and Search, never expose opted-out profiles, verify active Chog ownership separately, and render missing age/photo safely.
