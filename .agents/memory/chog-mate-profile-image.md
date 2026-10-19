---
name: CHOG MATE profile image
description: Product rule for the NFT artwork shown as a CHOG MATE user's profile image.
---

**Rule:** The user's selected, verified Chog NFT is the only profile image. Do not add uploads or user-facing photo URLs, and preserve the artwork's intrinsic aspect ratio wherever it appears as profile artwork.

**Why:** The selected Chog is the user's verified identity artwork; cropping or distortion can hide part of it.

**How to apply:** Keep profile forms free of profile-photo fields and render profile artwork responsively with automatic height and full-image containment. A deprecated database column may remain for compatibility, but the UI must not use it.
