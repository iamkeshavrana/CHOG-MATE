---
name: Monad NFT enumeration
description: Use separate reliable paths for holder ownership and full-collection NFT browsing.
---

The CHOG Genesis collection exposes `tokensOfOwner(address)` for current holder ownership, but does not provide usable `tokenByIndex` collection enumeration. `totalSupply` is only a count, not a way to enumerate token IDs. Use the cursor-paginated OpenSea collection endpoint for the full gallery; keep its API key server-side. Do not scan presumed sequential IDs or reconstruct ownership from transfer logs.

**Why:** Monad RPC `eth_getLogs` is capped at 100-block ranges, and the contract's owner-list method does not enumerate the whole collection. Treating `totalSupply` as sequential IDs can silently omit or invent items.

**How to apply:** Use `tokensOfOwner` for wallet holdings, compare its count with `balanceOf`, and verify each item with `ownerOf`. Use the NFT indexer's cursor for collection pages and fail clearly when it is unavailable. For no-holder probes, use a valid nonzero wallet; this contract reverts on `balanceOf(0x0)`.
