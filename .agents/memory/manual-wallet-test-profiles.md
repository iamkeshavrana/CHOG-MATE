---
name: Manual address onboarding
description: Product and security boundary for persistent accounts created after an unsigned address passes an on-chain Chog ownership check.
---

Manual wallet-address onboarding is an intentional persistent social-account flow after Chog ownership is verified on-chain. These sessions remain address-only: the public address does not prove wallet control, must never be treated as a signed wallet session, and must not authorize transactions.

**Why:** The user specified that address-only onboarding must create or resume persistent CHOG MATE accounts and save profiles, while an unsigned public address still does not prove control of its private key.

**How to apply:** Allow address-only sessions to create profiles and use social discovery. Require a signed wallet-connected session for transactions or any action that depends on control of the private key. Keep any separate test-only profile preview isolated from shared persistence.
