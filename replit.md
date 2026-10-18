# CHOG MATE

A wallet-verified social discovery app for Chog Genesis NFT holders on Monad.

## Run & Operate

- `artifacts/chog-mate: web` — managed frontend workflow and browser preview
- `artifacts/api-server: API Server` — managed API workflow at `/api`
- `pnpm run typecheck` — typecheck workspace packages
- `pnpm --filter @workspace/chog-mate run typecheck` — typecheck the frontend
- `pnpm --filter @workspace/api-server run typecheck` — typecheck the API
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas after editing `lib/api-spec/openapi.yaml`
- Database schema is managed by Supabase; migration SQL is in `artifacts/chog-mate/supabase/migrations/`.

Environment configuration:

- Copy `artifacts/chog-mate/.env.example` to `artifacts/chog-mate/.env.local` for local frontend development.
- Public frontend variables: `VITE_WALLETCONNECT_PROJECT_ID`, `VITE_MONAD_RPC_URL`, `VITE_CHOG_CONTRACT_ADDRESS`, `VITE_CHOG_TOKEN_ADDRESS`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_NFT_METADATA_API`, and `VITE_NFT_INDEXER_API`.
- The contract address defaults to the Chog Genesis contract; the token address defaults to the public `$CHOG` token address. The Monad RPC defaults to `https://rpc.monad.xyz`. NFT API endpoints are optional until those integrations are implemented.
- The API server also needs `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `SESSION_SECRET`. `MONAD_RPC_URL` is an optional server-only RPC override; otherwise the server accepts `VITE_MONAD_RPC_URL` or uses the public Monad RPC.
- Optional live marketplace feed and collection statistics: server-side `OPENSEA_API_KEY`.

**Security:** Vite embeds every `VITE_*` value in browser assets. Use only public project IDs, public endpoint URLs, public contract addresses, and the Supabase anon key in these variables. Never put private keys, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`, or other credentials in a `VITE_*` variable. Keep server credentials in Replit Secrets.

## Stack

- pnpm workspaces, Node.js, TypeScript 5.9
- API: Express 5
- Social persistence: Supabase Postgres with the service-role client restricted to the API server
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/chog-mate/src/pages/` — home, identity/profile/settings, discovery/matches/messages
- `artifacts/api-server/src/routes/` — auth, NFT, profile, and social HTTP routes
- `artifacts/api-server/src/lib/chogs.ts` — Monad Chog ownership verification and token metadata
- `artifacts/api-server/src/lib/opensea.ts` — OpenSea collection, recent sale, and statistics access
- `lib/api-spec/openapi.yaml` — source of truth for frontend/server API contracts
- `artifacts/chog-mate/supabase/migrations/` — database schema and policy migrations

## Architecture decisions

- Chog holder verification targets the NFT contract on Monad Mainnet; the separate `$CHOG` token is not an identity check.
- Collection browsing uses OpenSea's cursor API; wallet holdings use `tokensOfOwner` and verify each token with `ownerOf`.
- Marketplace-dependent sections show unavailable/empty states when OpenSea data is missing; they never substitute sample sales or metrics.
- OpenSea's collection stats endpoint does not provide a defined “top floor” metric, so CHOG MATE leaves that value unreported.

## Product

Verified Chog holders can create profiles, discover other holders, mutually match, and message matches. Users can browse the Chogs they own and select a profile Chog.

## User preferences

Use real chain/indexer data for NFTs and marketplace activity. Never seed fabricated production users, ownership, sales, statistics, matches, messages, balances, or call status.

## Gotchas

- Wallet sign-in needs the WalletConnect project ID and Supabase URL/anon key; persistent profiles and social actions also need the server-side Supabase service-role key.
- Marketplace sales and stats require the server-side `OPENSEA_API_KEY`; when absent, the UI must keep its explicit unavailable state.
- Regenerate API clients from OpenAPI before consuming new API response types.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
