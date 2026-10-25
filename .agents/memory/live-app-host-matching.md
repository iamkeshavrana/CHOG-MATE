---
name: Live app host matching
description: Compare app origins and full workflow logs before interpreting missing requests.
---

Before concluding that a user action never reached the API, compare the app host in the screenshot with this workspace's development host, then inspect the complete workflow log for the request and its timestamp. Similar CHOG MATE pages may run in separate Replit workspaces, and their server logs are not shared.

**Why:** A host mismatch initially suggested the failed retry was outside this workspace, but the API workflow log contained the actual POST and its Zod validation error.

**How to apply:** Verify the host, search the full log file rather than relying only on a short preview, and correlate request time and route. If the hosts differ and no request exists locally, use the current preview or obtain sanitized logs from the original runtime.
