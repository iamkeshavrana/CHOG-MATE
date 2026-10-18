/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WALLETCONNECT_PROJECT_ID?: string;
  readonly VITE_MONAD_RPC_URL?: string;
  readonly VITE_CHOG_CONTRACT_ADDRESS?: string;
  readonly VITE_CHOG_TOKEN_ADDRESS?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_NFT_METADATA_API?: string;
  readonly VITE_NFT_INDEXER_API?: string;
}
