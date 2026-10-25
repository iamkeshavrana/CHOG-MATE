---
name: Live app host matching
description: Distinguish requests to another CHOG MATE runtime from the current workspace's workflow logs.
---

Before interpreting missing API requests as a frontend issue, compare the app host in the supplied screenshot with the current workspace's development host. Similar CHOG MATE pages may belong to separate Replit workspaces, and their server logs are not shared.

**Why:** A Super Like retry happened on a `pike.replit.dev` host different from this workspace, so the current API workflow never received that POST.

**How to apply:** If the hosts differ, use the current preview for reproduction or obtain the original runtime's sanitized API response and server logs. Do not infer the original database exception from the current workspace's empty logs.
