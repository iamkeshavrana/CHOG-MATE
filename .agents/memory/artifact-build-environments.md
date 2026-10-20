---
name: Artifact-specific build environments
description: Build commands for this multi-artifact workspace need the target artifact's own mount path and port.
---

Run a production build for the artifact being changed with the `PORT` and `BASE_PATH` from that artifact's service configuration. A workspace-wide recursive build can pass the wrong mount path to sibling artifacts or fail when a sibling's required variables are absent.

**Why:** The web artifacts have different preview paths, and their Vite configurations require artifact-specific environment values even during production builds.

**How to apply:** Before building, check the target artifact's service config and Vite requirements. Use a package-scoped build when sibling artifacts need different environment values.
