---
name: CHOG MATE public and authenticated access
description: Product rules for anonymous browsing, account navigation, and private features.
---

Anonymous visitors can browse Home and Discover without an account. Account navigation and private pages require a valid CHOG MATE session; logout or session expiry returns the visitor to public access. Public Discover shows only profiles intended to be visible, while social actions require an account.

**Why:** The user explicitly specified a public-vs-authenticated access boundary for CHOG MATE.

**How to apply:** Keep public browsing open, gate private routes and social actions on the server-backed session, and return to the requested discovery context after successful sign-in when the account is ready.
