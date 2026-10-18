---
name: Supabase under Node 20
description: Why the API server installs a WebSocket global before creating Supabase clients.
---

**Rule:** Keep a Node-compatible WebSocket implementation available as `globalThis.WebSocket` before calling `createClient` in the API server.

**Why:** The current Supabase JavaScript client checks for a global WebSocket during client creation; this workspace runs Node 20, which does not provide that global by default.

**How to apply:** Preserve the explicit `ws` dependency and initialize the global in the Supabase server module before any client is created.
