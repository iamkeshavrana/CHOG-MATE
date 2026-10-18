---
name: Supabase project alignment
description: Verify CHOG MATE's frontend and database credentials point to the same Supabase project before schema changes.
---

**Rule:** Before applying Supabase migrations, confirm the configured frontend URL resolves and matches the project referenced by the PostgreSQL connection. Then verify the service-role client can query the target table.

**Why:** The app's existing frontend URL and newly provided database credentials can point to different projects; a successful migration on one project does not make the app use it.

**How to apply:** Compare project identifiers internally without printing credentials, check DNS resolution, and run a read-only PostgREST query before applying schema changes.
