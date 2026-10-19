---
name: Supabase project alignment
description: Verify CHOG MATE's frontend and database credentials point to the same Supabase project before schema changes.
---

**Rule:** Before applying Supabase migrations, confirm the configured frontend URL resolves and matches the project referenced by the PostgreSQL connection. Then verify the service-role client can query the target table.

**Why:** The app's existing frontend URL and newly provided database credentials can point to different projects; a successful migration on one project does not make the app use it.

**Migration state:** The checked remote database had no app migration-history table, so numbered files alone could not establish what had run. Its PostgREST schema/OpenAPI endpoint also rejected the public key; use catalog inspection through the direct PostgreSQL connection to compare columns and database objects.

**Why:** A partial or manually applied migration can leave the live schema different from the repository even when the base tables exist.

**How to apply:** Compare project identifiers internally without printing credentials, check DNS resolution, inspect `information_schema`/`pg_catalog` and required application objects, then apply only the missing idempotent migrations through the direct database connection.
