---
name: Node 20 DOM tests
description: Compatibility note for running Vitest browser-like tests in the workspace's Node 20 environment.
---

When running Vitest with a jsdom environment under this Node 20 runtime, use jsdom 26 rather than jsdom 30. jsdom 30 brings Undici 8, which attempts to access a missing Zstandard decompression API in Node 20 and fails before the test worker starts.

**Why:** The first UI test run failed during worker initialization inside Undici; pinning jsdom 26 allowed the tests to start and pass.

**How to apply:** If a jsdom-based Vitest suite fails before executing tests with an Undici/Zstandard error, check the jsdom major version first and use jsdom 26 for this runtime.
