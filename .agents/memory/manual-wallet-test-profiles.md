---
name: Wallet-only onboarding
description: CHOG MATE authentication and onboarding must prove wallet control and current Chog ownership.
---

CHOG MATE must not offer manual wallet-address entry, address-only sessions, or profile creation based on a typed address. Onboarding requires a connected wallet, a valid wallet signature, and server-side verification that the wallet currently owns a Chog Genesis NFT.

**Why:** The user explicitly replaced the former address-only onboarding flow with a wallet-only requirement.

**How to apply:** Keep wallet signature verification and Chog ownership checks on the server, require the `wallet_connected` session marker (cookies without it must re-authenticate), and revalidate ownership when saving a profile. Never create a parallel manual-login route or use typed wallet addresses as authentication.
